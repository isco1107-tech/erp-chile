import { prisma } from '@/lib/prisma';
import type { Contact, FeeDocument, Payment, PaymentStatus, Project } from '@prisma/client';
import { calculateFeeAmounts } from '@/lib/services/fees';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { ensureFeeDocumentAccrual, postFeeDocumentRegistered, reverseFeeDocumentPosting } from '@/modules/accounting/posting-rules/people-posting';
import { recordTreasuryMovement } from '@/modules/treasury/services/movements.service';
import type { MoneyDetailsInput } from '@/modules/treasury/schema';
import type { FeeDocumentCreateInput, ListFeeDocumentsFilter } from '../schema';

/** Tasa por defecto si la empresa nunca configuró `CompanySettings` (mismo default del schema, 15.25% — 2026). */
const DEFAULT_RETENTION_RATE_BPS = 1525;

export type FeeDocumentWithRelations = FeeDocument & { contact: Contact; project: Project | null };

/**
 * Crea el registro de una BHE ya emitida por el prestador. Ninguna FK obliga
 * a que `contactId`/`projectId` pertenezcan a `companyId` (ver CLAUDE.md
 * sección multi-tenant), así que se valida ownership acá antes de escribir.
 *
 * Con Contabilidad activa, la boleta nace con su asiento (honorarios contra
 * retención por enterar y líquido por pagar) en la misma transacción.
 */
export async function createFeeDocument(companyId: string, data: FeeDocumentCreateInput, userId?: string): Promise<FeeDocument> {
  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, companyId } });
  if (!contact) throw new Error('Prestador no encontrado');

  if (data.projectId) {
    const project = await prisma.project.findFirst({ where: { id: data.projectId, companyId } });
    if (!project) throw new Error('Proyecto no encontrado');
  }

  let retentionRateBps = data.retentionRateBps;
  if (retentionRateBps == null) {
    const settings = await prisma.companySettings.findUnique({ where: { companyId } });
    retentionRateBps = settings?.honorariumRetentionBps ?? DEFAULT_RETENTION_RATE_BPS;
  }

  // Snapshot: la retención y el líquido se calculan y quedan fijos al crear,
  // nunca se recalculan después aunque cambie la tasa de la empresa.
  const { retentionAmount, netToPay } = calculateFeeAmounts(data.grossAmount, retentionRateBps);

  return prisma.$transaction(async (tx) => {
    const fee = await tx.feeDocument.create({
      data: {
        companyId,
        contactId: data.contactId,
        projectId: data.projectId,
        folioNumber: data.folioNumber,
        issueDate: data.issueDate,
        serviceDescription: data.serviceDescription,
        grossAmount: data.grossAmount,
        retentionRateBps,
        retentionAmount,
        netToPay,
      },
    });
    await postFeeDocumentRegistered(tx, companyId, fee, userId);
    return fee;
  });
}

/**
 * Paga el líquido de la boleta: queda como egreso en Tesorería (contra
 * `HONORARIOS_POR_PAGAR`) y la boleta como pagada, en una sola transacción.
 * Devuelve el `Payment` para que la acción dispare la automatización después
 * de confirmar.
 */
export async function markFeeDocumentPaid(
  companyId: string,
  id: string,
  details: MoneyDetailsInput,
  userId?: string
): Promise<{ fee: FeeDocument; payment: Payment }> {
  return prisma.$transaction(async (tx) => {
    // Lock explícito: sin él, dos solicitudes concurrentes de "marcar pagada"
    // podían ambas leer paymentStatus UNPAID y duplicar el efecto.
    await tx.$queryRaw`SELECT id FROM "FeeDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const doc = await tx.feeDocument.findFirst({ where: { id, companyId } });
    if (!doc) throw new Error('Boleta de honorarios no encontrada');
    if (doc.paymentStatus === 'PAID') throw new Error('Esta boleta ya está marcada como pagada');
    // Boletas registradas antes de que existiera su asiento de devengo.
    await ensureFeeDocumentAccrual(tx, companyId, doc, userId);

    const paymentDate = details.paymentDate ?? new Date();
    const pending = doc.netToPay - doc.paidAmount;
    const payment = await recordTreasuryMovement(tx, {
      companyId,
      direction: 'EXPENSE',
      amount: pending,
      method: details.paymentMethod,
      date: paymentDate,
      source: 'FEE_DOCUMENT',
      sourceId: doc.id,
      description: `Pago BHE N° ${doc.folioNumber}`,
      counterpartKey: 'HONORARIOS_POR_PAGAR',
      contactId: doc.contactId,
      projectId: doc.projectId,
      treasuryAccountId: details.treasuryAccountId,
      referenceNumber: details.referenceNumber,
      createdByUserId: userId,
    });

    const paymentStatus: PaymentStatus = 'PAID';
    await tx.feeDocument.updateMany({
      where: { id, companyId },
      data: { paymentStatus, paidAmount: doc.netToPay, paymentDate },
    });

    const updated = await tx.feeDocument.findFirst({ where: { id, companyId } });
    if (!updated) throw new Error('Boleta de honorarios no encontrada');
    return { fee: updated, payment };
  }, LOCKING_TX_OPTIONS);
}

/**
 * Solo se permite eliminar una boleta que nunca se pagó. Una ya pagada (o con
 * pago parcial) debe conservarse: su `retentionAmount` puede ya haber
 * quedado sumado en un F29 de un período cerrado (`src/lib/chile/f29.ts`
 * filtra por `paymentDate`, no por si el registro sigue existiendo). Su
 * asiento de registro no se borra: se reversa, como todo asiento contabilizado.
 */
export async function deleteFeeDocument(companyId: string, id: string, userId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FeeDocument" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const doc = await tx.feeDocument.findFirst({ where: { id, companyId } });
    if (!doc) throw new Error('Boleta de honorarios no encontrada');
    if (doc.paymentStatus !== 'UNPAID') {
      throw new Error('No se puede eliminar una boleta ya pagada: perderías el registro de la retención ya declarada.');
    }
    await reverseFeeDocumentPosting(tx, companyId, id, `Eliminación de BHE N° ${doc.folioNumber}`, userId);
    const result = await tx.feeDocument.deleteMany({ where: { id, companyId, paymentStatus: 'UNPAID' } });
    if (result.count === 0) throw new Error('Boleta de honorarios no encontrada');
  }, LOCKING_TX_OPTIONS);
}

export async function listFeeDocuments(
  companyId: string,
  filter?: ListFeeDocumentsFilter
): Promise<FeeDocumentWithRelations[]> {
  return prisma.feeDocument.findMany({
    where: {
      companyId,
      paymentStatus: filter?.paymentStatus,
      projectId: filter?.projectId,
      contactId: filter?.contactId,
    },
    include: { contact: true, project: true },
    orderBy: { issueDate: 'desc' },
  });
}

export async function getFeeDocument(companyId: string, id: string): Promise<FeeDocumentWithRelations | null> {
  return prisma.feeDocument.findFirst({
    where: { id, companyId },
    include: { contact: true, project: true },
  });
}

/** Tasa de retención vigente de la empresa, para la vista previa en vivo del formulario. */
export async function getHonorariumRetentionRate(companyId: string): Promise<number> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId } });
  return settings?.honorariumRetentionBps ?? DEFAULT_RETENTION_RATE_BPS;
}

/**
 * Listado liviano de proyectos para el selector opcional del formulario.
 * Vive acá (no en `src/modules/projects`) a propósito: los 4 módulos de
 * producción de eventos son independientes entre sí (ver `src/lib/auth/modules.ts`),
 * así que Boletas de Honorarios no debe acoplar su disponibilidad a que el
 * módulo Eventos & Proyectos también esté contratado.
 */
export async function listProjectsForSelection(companyId: string): Promise<Project[]> {
  return prisma.project.findMany({ where: { companyId }, orderBy: { startDate: 'desc' } });
}
