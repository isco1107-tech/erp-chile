import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildOperationalAlertEmail, type OperationalAlertLowStockRow, type OperationalAlertPendingApprovalRow } from '@/lib/email/templates';
import { createAuditLog } from '@/lib/auth/audit';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'] as const;

/** Compras `PENDING` con menos días esperando que esto no generan alerta
 * todavía — evita ruido el mismo día que alguien las emite; recién al día
 * siguiente sin resolución se considera una demora real. */
const APPROVAL_ALERT_MIN_DAYS_PENDING = 1;

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/** Productos cuyo stock total (sumado entre todas las bodegas) cayó a su
 * mínimo configurado o por debajo. Solo considera productos con `minStock >
 * 0` — el default es 0, que significa "sin umbral configurado", no "avisar
 * si llega a cero". */
export async function findLowStockProducts(companyId: string): Promise<OperationalAlertLowStockRow[]> {
  const products = await prisma.product.findMany({
    where: { companyId, minStock: { gt: 0 }, isTrackable: true },
    select: { sku: true, name: true, minStock: true, stocks: { select: { quantity: true } } },
  });

  return products
    .map((p) => ({ sku: p.sku, name: p.name, minStock: p.minStock, totalStock: p.stocks.reduce((sum, s) => sum + s.quantity, 0) }))
    .filter((p) => p.totalStock <= p.minStock)
    .sort((a, b) => a.totalStock - b.totalStock);
}

/** Compras que llevan `APPROVAL_ALERT_MIN_DAYS_PENDING` días o más esperando
 * que alguien con `purchases:approve` las apruebe o rechace. */
export async function findPendingPurchaseApprovals(companyId: string): Promise<OperationalAlertPendingApprovalRow[]> {
  const documents = await prisma.purchaseDocument.findMany({
    where: { companyId, approvalStatus: 'PENDING' },
    select: { folio: true, totalAmount: true, createdAt: true, contact: { select: { razonSocial: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return documents
    .map((doc) => ({ folio: doc.folio, contactName: doc.contact.razonSocial, totalAmount: doc.totalAmount, daysPending: daysSince(doc.createdAt) }))
    .filter((row) => row.daysPending >= APPROVAL_ALERT_MIN_DAYS_PENDING);
}

export interface CompanyOperationalAlerts {
  companyId: string;
  companyName: string;
  lowStock: OperationalAlertLowStockRow[];
  pendingApprovals: OperationalAlertPendingApprovalRow[];
}

/**
 * Corre para cada empresa operativa con `hasInventory` o `hasPurchases`
 * activo: junta stock bajo mínimo y compras atascadas en aprobación, manda
 * un correo a Dueños/Administradores si hay algo que revisar, y siempre
 * devuelve los datos crudos por empresa — así el mismo endpoint que dispara
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
      features: { OR: [{ hasInventory: true }, { hasPurchases: true }] },
    },
    select: { id: true, businessName: true, features: { select: { hasInventory: true, hasPurchases: true } } },
  });

  let processedCompanies = 0;
  let alertsSent = 0;
  const results: CompanyOperationalAlerts[] = [];

  for (const company of companies) {
    try {
      const [lowStock, pendingApprovals] = await Promise.all([
        company.features?.hasInventory ? findLowStockProducts(company.id) : Promise.resolve([]),
        company.features?.hasPurchases ? findPendingPurchaseApprovals(company.id) : Promise.resolve([]),
      ]);

      results.push({ companyId: company.id, companyName: company.businessName, lowStock, pendingApprovals });

      if (lowStock.length > 0 || pendingApprovals.length > 0) {
        const recipients = await prisma.user.findMany({
          where: { companyId: company.id, role: { in: ['OWNER', 'ADMIN'] }, isActive: true },
          select: { email: true },
        });

        const email = buildOperationalAlertEmail({
          companyName: company.businessName,
          lowStock,
          pendingApprovals,
          dashboardUrl: `${getAppUrl()}/dashboard`,
        });

        for (const recipient of recipients) {
          const delivery = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html, text: email.text });
          if (delivery.status !== 'failed') alertsSent++;
        }

        await createAuditLog({
          companyId: company.id,
          userEmail: 'operational-alerts-cron',
          action: 'CREATE',
          entity: 'OperationalAlert',
          entityId: company.id,
          metadata: { lowStockCount: lowStock.length, pendingApprovalsCount: pendingApprovals.length, recipientCount: recipients.length },
        });
      }

      processedCompanies++;
    } catch (err) {
      console.error(`Error al procesar alertas operativas para empresa ${company.id}:`, err);
    }
  }

  return { processedCompanies, alertsSent, companies: results };
}
