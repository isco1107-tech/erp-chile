import { prisma } from '@/lib/prisma';
import type { Contact, PaymentStatus, Prisma, PromissoryNote } from '@prisma/client';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type {
  PromissoryNoteCreateInput,
  PromissoryNotePaymentInput,
  PromissoryNoteUpdateInput,
} from '../schema';

export type PromissoryNoteWithRelations = PromissoryNote & {
  contact: Contact;
  candidate: { id: string; fullName: string; stageName: string | null } | null;
};

/**
 * Valida que `contactId`/`candidateId` pertenezcan a la empresa del usuario.
 * Ninguna FK del schema fuerza esa coincidencia por sí sola (`Contact` y
 * `Candidate` solo declaran su propio `companyId`) — sin este chequeo, un
 * usuario podría crear un pagaré apuntando al contacto o candidata de OTRA
 * empresa con solo adivinar/probar un `id`. Mismo criterio que
 * `src/modules/sponsorships/services/sponsorships.service.ts`.
 */
async function assertOwnership(companyId: string, contactId: string, candidateId?: string | null): Promise<void> {
  const [contact, candidate] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } }),
    candidateId
      ? prisma.candidate.findFirst({ where: { id: candidateId, companyId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!contact) throw new Error('El contacto seleccionado no existe o no pertenece a tu empresa');
  if (candidateId && !candidate) throw new Error('La candidata seleccionada no existe o no pertenece a tu empresa');
}

export async function createPromissoryNote(
  companyId: string,
  data: PromissoryNoteCreateInput
): Promise<PromissoryNote> {
  await assertOwnership(companyId, data.contactId, data.candidateId);

  return prisma.promissoryNote.create({
    data: {
      companyId,
      contactId: data.contactId,
      candidateId: data.candidateId || undefined,
      amount: data.amount,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      documentUrl: data.documentUrl || undefined,
      status: data.status,
      notes: data.notes || undefined,
    },
  });
}

export async function updatePromissoryNote(
  companyId: string,
  id: string,
  data: PromissoryNoteUpdateInput
): Promise<PromissoryNote> {
  // Si el update trae `contactId`/`candidateId` nuevos, hay que revalidar la
  // pertenencia igual que en la creación — de lo contrario un update podría
  // reasignar el pagaré a un contacto o candidata de otra empresa.
  if (data.contactId || data.candidateId) {
    const existing = await prisma.promissoryNote.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Pagaré no encontrado');
    await assertOwnership(
      companyId,
      data.contactId ?? existing.contactId,
      data.candidateId !== undefined ? data.candidateId : existing.candidateId
    );
  }

  const updateData: Prisma.PromissoryNoteUncheckedUpdateManyInput = {
    contactId: data.contactId,
    candidateId: data.candidateId === '' ? null : data.candidateId,
    amount: data.amount,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    documentUrl: data.documentUrl === '' ? null : data.documentUrl,
    status: data.status,
    notes: data.notes === '' ? null : data.notes,
  };

  const result = await prisma.promissoryNote.updateMany({ where: { id, companyId }, data: updateData });
  if (result.count === 0) throw new Error('Pagaré no encontrado');

  const updated = await prisma.promissoryNote.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Pagaré no encontrado');
  return updated;
}

/**
 * Solo se permite eliminar un pagaré que todavía no registra pagos. Uno con
 * `paidAmount > 0` debe pasar a estado `CANCELLED` en vez de borrarse, para
 * no perder el rastro de la plata ya recibida — mismo criterio que
 * `deleteSponsorshipContract`.
 */
export async function deletePromissoryNote(companyId: string, id: string): Promise<void> {
  const note = await prisma.promissoryNote.findFirst({ where: { id, companyId } });
  if (!note) throw new Error('Pagaré no encontrado');
  if (note.paidAmount > 0) {
    throw new Error(
      'No se puede eliminar: este pagaré ya registra pagos. Cámbialo a estado "Anulado" en vez de eliminarlo, para no perder el historial de pago.'
    );
  }

  const result = await prisma.promissoryNote.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Pagaré no encontrado');
}

/**
 * Registra el monto efectivamente pagado y recalcula `paymentStatus` en el
 * servidor — nunca se confía en un status que mande el cliente, mismo
 * criterio que `updateSponsorshipPayment`. Si el pagaré queda totalmente
 * pagado, también se cierra `status: 'PAID'` (deja de estar "Vigente").
 */
/**
 * `data.paidAmount` es el TOTAL acumulado pagado hasta ahora (así lo pide la
 * pantalla: "actualizar monto pagado"), no un incremento. N-15 (auditoría
 * 2026-09-14): el `Payment` de tesorería que genera este cobro se crea por la
 * DIFERENCIA respecto al `paidAmount` anterior — generarlo por el total
 * duplicaría el cobro cada vez que se vuelve a guardar el mismo pagaré.
 * Lock explícito: mismo motivo que `registerInstallmentPayment` — dos
 * llamadas concurrentes no deben pisarse el `paidAmount` anterior.
 */
export async function registerPromissoryNotePayment(
  companyId: string,
  id: string,
  data: PromissoryNotePaymentInput
): Promise<PromissoryNote> {
  const { updated, previousPaymentStatus } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PromissoryNote" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;

    const note = await tx.promissoryNote.findFirst({ where: { id, companyId } });
    if (!note) throw new Error('Pagaré no encontrado');
    // Repetido server-side: la UI ya deshabilita el botón sobre el tope, pero
    // esto también corre si se llama la Server Action directo.
    if (data.paidAmount > note.amount) {
      throw new Error('El monto pagado supera el monto del pagaré');
    }
    // N-15 (corrección a la baja): un abono mal digitado ya no queda inflado
    // para siempre — se permite corregir hacia abajo, nunca por debajo de 0.
    // El "no puede ser menor" de antes bloqueaba cualquier corrección
    // legítima de un error de digitación.
    if (data.paidAmount < 0) {
      throw new Error('El monto pagado no puede ser negativo');
    }

    let paymentStatus: PaymentStatus;
    if (data.paidAmount === 0) {
      paymentStatus = 'UNPAID';
    } else if (data.paidAmount >= note.amount) {
      paymentStatus = 'PAID';
    } else {
      paymentStatus = 'PARTIAL';
    }

    await tx.promissoryNote.updateMany({
      where: { id, companyId },
      data: {
        paidAmount: data.paidAmount,
        paymentStatus,
        status: paymentStatus === 'PAID' ? 'PAID' : undefined,
      },
    });

    const delta = data.paidAmount - note.paidAmount;
    // No se postea asiento contable acá: no existe hoy una regla de posteo
    // para cobros de `PromissoryNote`.
    if (delta > 0) {
      await tx.payment.create({
        data: {
          companyId,
          type: 'INCOME',
          contactId: note.contactId,
          promissoryNoteId: id,
          amount: delta,
          paymentMethod: data.method,
        },
      });
    } else if (delta < 0) {
      // Corrección a la baja: un `Payment` EXPENSE por la diferencia deja el
      // flujo de caja correcto sin borrar el rastro del abono original
      // (mismo criterio que la reversa de una anulación de venta).
      await tx.payment.create({
        data: {
          companyId,
          type: 'EXPENSE',
          contactId: note.contactId,
          promissoryNoteId: id,
          amount: -delta,
          paymentMethod: data.method,
          notes: 'Corrección de abono',
        },
      });
    }

    const updated = await tx.promissoryNote.findFirst({ where: { id, companyId } });
    if (!updated) throw new Error('Pagaré no encontrado');
    return { updated, previousPaymentStatus: note.paymentStatus };
  });

  // Solo en la transición a pagado: volver a guardar un pagaré ya pagado no avisa de nuevo.
  if (updated.paymentStatus === 'PAID' && previousPaymentStatus !== 'PAID') {
    const contact = await prisma.contact.findFirst({ where: { id: updated.contactId, companyId }, select: { razonSocial: true } });
    void emitWorkflowEvent(companyId, 'PROMISSORY_NOTE_PAID', {
      noteId: updated.id,
      contactName: contact?.razonSocial ?? null,
      amount: updated.amount,
    });
  }
  return updated;
}

export async function listPromissoryNotes(companyId: string, contactId?: string): Promise<PromissoryNoteWithRelations[]> {
  return prisma.promissoryNote.findMany({
    where: { companyId, contactId: contactId || undefined },
    include: { contact: true, candidate: { select: { id: true, fullName: true, stageName: true } } },
    orderBy: { dueDate: 'asc' },
  });
}

export async function getPromissoryNote(companyId: string, id: string): Promise<PromissoryNoteWithRelations | null> {
  return prisma.promissoryNote.findFirst({
    where: { companyId, id },
    include: { contact: true, candidate: { select: { id: true, fullName: true, stageName: true } } },
  });
}

export interface OverduePromissoryNote {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: Date;
  contact: { id: string; razonSocial: string; email: string | null };
}

/**
 * Pagarés vigentes ya vencidos, para el cron de recordatorio (fuera del
 * alcance de este módulo — solo se expone la consulta, autocontenida).
 */
export async function listOverduePromissoryNotes(companyId: string): Promise<OverduePromissoryNote[]> {
  const notes = await prisma.promissoryNote.findMany({
    where: { companyId, status: 'ACTIVE', dueDate: { lt: new Date() } },
    include: { contact: { select: { id: true, razonSocial: true, email: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return notes.map((note) => ({
    id: note.id,
    amount: note.amount,
    paidAmount: note.paidAmount,
    dueDate: note.dueDate,
    contact: note.contact,
  }));
}
