import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import {
  buildOperationalAlertEmail,
  type OperationalAlertLowStockRow,
  type OperationalAlertPendingApprovalRow,
  type OperationalAlertOverdueReceivableRow,
  type OperationalAlertExpiringContractRow,
  type OperationalAlertMismatchedPurchaseRow,
} from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';
import { getLowFolioWarnings } from '@/modules/dte/services/caf.service';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { captureException } from '@/lib/observability';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/** Compras `PENDING` con menos días esperando que esto no generan alerta
 * todavía — evita ruido el mismo día que alguien las emite; recién al día
 * siguiente sin resolución se considera una demora real. */
const APPROVAL_ALERT_MIN_DAYS_PENDING = 1;

/** Contratos de imagen que vencen dentro de esta ventana entran en el aviso
 * — bastante margen para gestionar la renovación antes de que expire. */
const CONTRACT_EXPIRY_ALERT_WINDOW_DAYS = 14;

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/** La parte barata de `findLowStockProducts`: un solo query, sin el N+1 de
 * enriquecer cada línea con su último proveedor (eso vive en
 * `findLowStockProducts`, pensado para el correo diario, no para un conteo
 * en vivo). */
async function findProductsBelowMinimum(
  companyId: string
): Promise<Array<{ id: string; sku: string; name: string; minStock: number; totalStock: number }>> {
  const products = await prisma.product.findMany({
    where: { companyId, minStock: { gt: 0 }, isTrackable: true },
    select: { id: true, sku: true, name: true, minStock: true, stocks: { select: { quantity: true } } },
  });

  return products
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, minStock: p.minStock, totalStock: p.stocks.reduce((sum, s) => sum + s.quantity, 0) }))
    .filter((p) => p.totalStock <= p.minStock)
    .sort((a, b) => a.totalStock - b.totalStock);
}

/** Productos cuyo stock total (sumado entre todas las bodegas) cayó a su
 * mínimo configurado o por debajo. Solo considera productos con `minStock >
 * 0` — el default es 0, que significa "sin umbral configurado", no "avisar
 * si llega a cero". */
export async function findLowStockProducts(companyId: string): Promise<OperationalAlertLowStockRow[]> {
  const belowMinimum = await findProductsBelowMinimum(companyId);

  if (belowMinimum.length === 0) return [];

  // Enriquece cada línea con el último proveedor y costo unitario con que se
  // compró ese producto — antes la alerta solo decía "esto está bajo", sin
  // ninguna pista de a quién comprarle ni cuánto pedir. Sin esto, reponer
  // stock era 100% trabajo manual: alguien tenía que abrir el kardex del
  // producto, revisar el historial de compras y armar la orden a mano.
  const suggestions = await Promise.all(
    belowMinimum.map(async (p) => {
      const lastPurchase = await prisma.purchaseDocumentItem.findFirst({
        where: { companyId, productId: p.id, document: { status: 'ISSUED' } },
        orderBy: { document: { issueDate: 'desc' } },
        select: { unitCost: true, document: { select: { contact: { select: { razonSocial: true } } } } },
      });
      // Sugiere reponer hasta el doble del mínimo configurado — margen
      // simple para no volver a caer bajo el umbral apenas llegue la
      // próxima venta, sin depender de un pronóstico de demanda que este
      // sistema no calcula.
      const suggestedQuantity = Math.max(Math.round(p.minStock * 2 - p.totalStock), 1);
      return {
        sku: p.sku,
        name: p.name,
        minStock: p.minStock,
        totalStock: p.totalStock,
        suggestedQuantity,
        suggestedSupplier: lastPurchase?.document.contact.razonSocial ?? null,
        lastUnitCost: lastPurchase?.unitCost ?? null,
      };
    })
  );

  return suggestions;
}

/** Compras que llevan `APPROVAL_ALERT_MIN_DAYS_PENDING` días o más esperando
 * que alguien con `purchases:approve` las apruebe o rechace. */
export async function findPendingPurchaseApprovals(companyId: string): Promise<OperationalAlertPendingApprovalRow[]> {
  const documents = await prisma.purchaseDocument.findMany({
    where: { companyId, approvalStatus: 'PENDING', status: { not: 'CANCELLED' } },
    select: { folio: true, totalAmount: true, createdAt: true, contact: { select: { razonSocial: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return documents
    .map((doc) => ({ folio: doc.folio, contactName: doc.contact.razonSocial, totalAmount: doc.totalAmount, daysPending: daysSince(doc.createdAt) }))
    .filter((row) => row.daysPending >= APPROVAL_ALERT_MIN_DAYS_PENDING);
}

/** Ventas emitidas y no pagadas cuya fecha de vencimiento ya pasó — misma
 * exclusión de Guía de Despacho que `listReceivables`/
 * `getContactOutstandingBalance` en `treasury.service.ts` (la guía nunca
 * queda pagada por sí sola cuando se factura después, así que sumarla
 * duplicaría la deuda). Requiere `dueDate` seteado: un documento sin fecha
 * de vencimiento no puede estar "vencido". */
export async function findOverdueReceivables(companyId: string): Promise<OperationalAlertOverdueReceivableRow[]> {
  const documents = await prisma.salesDocument.findMany({
    where: {
      companyId,
      status: 'ISSUED',
      paymentStatus: { not: 'PAID' },
      dteType: { not: 'GUIA_DESPACHO_52' },
      dueDate: { lt: new Date() },
    },
    select: { folio: true, totalAmount: true, paidAmount: true, dueDate: true, contact: { select: { razonSocial: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return documents.map((doc) => ({
    folio: String(doc.folio ?? '—'),
    contactName: doc.contact.razonSocial,
    pendingAmount: doc.totalAmount - doc.paidAmount,
    daysOverdue: daysSince(doc.dueDate!),
  }));
}

/** Contratos de imagen de candidatas (`CandidateDocumentType.CONTRACT_IMAGE`)
 * que vencen dentro de `CONTRACT_EXPIRY_ALERT_WINDOW_DAYS` o que ya vencieron
 * y quedaron sin renovar — hoy `EXPIRED` solo se calcula al leer la ficha
 * (`documents.service.ts`), sin ningún aviso proactivo antes de que ocurra. */
export async function findExpiringCandidateContracts(companyId: string): Promise<OperationalAlertExpiringContractRow[]> {
  const windowEnd = new Date(Date.now() + CONTRACT_EXPIRY_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const documents = await prisma.candidateDocument.findMany({
    where: {
      companyId,
      documentType: 'CONTRACT_IMAGE',
      status: { in: ['SIGNED', 'PENDING'] },
      expiresAt: { not: null, lt: windowEnd },
      candidate: { status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
    },
    select: { title: true, expiresAt: true, candidate: { select: { fullName: true, stageName: true } } },
    orderBy: { expiresAt: 'asc' },
  });

  const now = Date.now();
  return documents.map((doc) => ({
    candidateName: doc.candidate.stageName ?? doc.candidate.fullName,
    documentTitle: doc.title,
    daysUntilExpiry: Math.ceil((doc.expiresAt!.getTime() - now) / (24 * 60 * 60 * 1000)),
  }));
}

/** Compras `MISMATCHED` (factura vs. Orden de Compra vs. Recepción) que
 * siguen bloqueadas sin que nadie las haya forzado (`OVERRIDDEN`) ni
 * corregido — hoy solo se ve entrando al detalle del documento. */
export async function findMismatchedPurchases(companyId: string): Promise<OperationalAlertMismatchedPurchaseRow[]> {
  const documents = await prisma.purchaseDocument.findMany({
    where: { companyId, matchStatus: 'MISMATCHED' },
    select: { folio: true, totalAmount: true, matchNotes: true, contact: { select: { razonSocial: true } } },
    orderBy: { folio: 'asc' },
  });

  return documents.map((doc) => ({
    folio: doc.folio,
    contactName: doc.contact.razonSocial,
    totalAmount: doc.totalAmount,
    matchNotes: doc.matchNotes ?? 'Sin detalle',
  }));
}

export interface CompanyOperationalAlerts {
  companyId: string;
  companyName: string;
  lowStock: OperationalAlertLowStockRow[];
  pendingApprovals: OperationalAlertPendingApprovalRow[];
  overdueReceivables: OperationalAlertOverdueReceivableRow[];
  expiringContracts: OperationalAlertExpiringContractRow[];
  mismatchedPurchases: OperationalAlertMismatchedPurchaseRow[];
}

/**
 * Corre para cada empresa operativa con `hasInventory`, `hasPurchases`,
 * `hasTreasury` o `hasCandidates` activo: junta stock bajo mínimo, compras
 * atascadas en aprobación o con mismatch de 3 vías sin resolver, cuentas por
 * cobrar vencidas y contratos de imagen por vencer. Manda un correo a
 * Dueños/Administradores si hay algo que revisar, y siempre devuelve los
 * datos crudos por empresa — así el mismo endpoint que dispara
 * este cron (`GET /api/alerts/operational/cron`) le sirve tanto a Vercel
 * Cron (que solo necesita que el correo salga) como a un workflow de n8n
 * que quiera leer el JSON y postearlo en Slack en vez de/además de correo.
 *
 * Mismo patrón que `runOverdueInstallmentsReminderCron`: itera todas las
 * empresas, un fallo en una no interrumpe a las demás.
 */
export async function runOperationalAlertsCron(): Promise<{ processedCompanies: number; alertsSent: number; companies: CompanyOperationalAlerts[] }> {
  const companies = await prisma.company.findMany({
    where: {
      status: { in: [...OPERATIONAL_STATUSES] },
      features: { OR: [{ hasInventory: true }, { hasPurchases: true }, { hasTreasury: true }, { hasCandidates: true }, { hasDteBilling: true }] },
    },
    select: {
      id: true,
      businessName: true,
      features: { select: { hasInventory: true, hasPurchases: true, hasTreasury: true, hasCandidates: true, hasDteBilling: true } },
    },
  });

  let processedCompanies = 0;
  let alertsSent = 0;
  const results: CompanyOperationalAlerts[] = [];

  for (const company of companies) {
    try {
      const [lowStock, pendingApprovals, overdueReceivables, expiringContracts, mismatchedPurchases, lowFolios] = await Promise.all([
        company.features?.hasInventory ? findLowStockProducts(company.id) : Promise.resolve([]),
        company.features?.hasPurchases ? findPendingPurchaseApprovals(company.id) : Promise.resolve([]),
        company.features?.hasTreasury ? findOverdueReceivables(company.id) : Promise.resolve([]),
        company.features?.hasCandidates ? findExpiringCandidateContracts(company.id) : Promise.resolve([]),
        company.features?.hasPurchases ? findMismatchedPurchases(company.id) : Promise.resolve([]),
        company.features?.hasDteBilling ? getLowFolioWarnings(company.id) : Promise.resolve([]),
      ]);

      results.push({ companyId: company.id, companyName: company.businessName, lowStock, pendingApprovals, overdueReceivables, expiringContracts, mismatchedPurchases });

      // Automatizaciones personalizadas (Configuración → Automatizaciones):
      // estas 3 señales ya se calculaban para el correo diario de arriba; acá
      // solo se reutilizan para que una empresa pueda armar SU propia regla
      // sobre el mismo evento, sin esperar a que este cron le mande un correo
      // fijo. Fire-and-forget: el motor nunca lanza, y esta función ya corre
      // fuera de cualquier transacción de negocio.
      for (const product of lowStock) {
        void emitWorkflowEvent(company.id, 'STOCK_BELOW_MINIMUM', {
          sku: product.sku,
          productName: product.name,
          totalStock: product.totalStock,
          minStock: product.minStock,
        });
      }
      for (const receivable of overdueReceivables) {
        void emitWorkflowEvent(company.id, 'RECEIVABLE_OVERDUE', {
          folio: receivable.folio,
          contactName: receivable.contactName,
          pendingAmount: receivable.pendingAmount,
          daysOverdue: receivable.daysOverdue,
        });
      }
      for (const folio of lowFolios) {
        void emitWorkflowEvent(company.id, 'DTE_FOLIOS_LOW', { dteType: folio.dteType, remaining: folio.remaining });
      }

      const totalIssues = lowStock.length + pendingApprovals.length + overdueReceivables.length + expiringContracts.length + mismatchedPurchases.length;
      let recipientCount = 0;

      if (totalIssues > 0) {
        const recipients = await prisma.user.findMany({
          where: { companyId: company.id, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
          select: { email: true },
        });
        recipientCount = recipients.length;

        const email = buildOperationalAlertEmail({
          companyName: company.businessName,
          lowStock,
          pendingApprovals,
          overdueReceivables,
          expiringContracts,
          mismatchedPurchases,
          dashboardUrl: `${getAppUrl()}/dashboard`,
        });

        for (const recipient of recipients) {
          const delivery = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html, text: email.text });
          if (delivery.status !== 'failed') alertsSent++;
        }
      }

      // Se registra SIEMPRE, con o sin incidentes — no solo cuando hay algo
      // que avisar. Sin esto, el panel de "Automatizaciones" (Configuración
      // → Automatizaciones) no puede distinguir "corrió y no encontró nada"
      // de "no ha corrido hace semanas": ambos se verían idénticos, sin
      // ninguna fila en el historial.
      await createAuditLog({
        companyId: company.id,
        userEmail: 'operational-alerts-cron',
        action: 'CREATE',
        entity: 'OperationalAlert',
        entityId: company.id,
        metadata: {
          lowStockCount: lowStock.length,
          pendingApprovalsCount: pendingApprovals.length,
          overdueReceivablesCount: overdueReceivables.length,
          expiringContractsCount: expiringContracts.length,
          mismatchedPurchasesCount: mismatchedPurchases.length,
          recipientCount,
        },
      });

      processedCompanies++;
    } catch (err) {
      captureException(err, { module: 'alerts', companyId: company.id, extra: { reason: 'operational-alerts' } });
    }
  }

  return { processedCompanies, alertsSent, companies: results };
}
