import { prisma } from '@/lib/prisma';
import type { Contact, PaymentMethodType, PaymentPlan, PaymentPlanInstallment, PaymentStatus, Prisma } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { computeDueDate, distributeInstallmentAmounts } from '../calc';
import type { PaymentPlanCreateInput, PaymentPlanUpdateInput } from '../schema';

export type PaymentPlanWithRelations = PaymentPlan & {
  contact: Contact;
  candidate: { id: string; fullName: string; stageName: string | null } | null;
  installments: PaymentPlanInstallment[];
};

/**
 * `PaymentPlan.contactId` es obligatorio a nivel de BD (lo usan los
 * recordatorios de mora y el resto de tesorería, que hablan en términos de
 * `Contact`), pero el usuario del formulario ya no elige un `Contact` — elige
 * una candidata. Se resuelve (o crea, si es la primera vez que esa candidata
 * tiene un plan de pago) el `Contact` correspondiente por RUT, igual que
 * cualquier otro cliente del sistema — así el resto del módulo de tesorería
 * no necesita distinguir "cliente candidata" de "cliente normal".
 */
async function getOrCreateContactForCandidate(companyId: string, candidateId: string) {
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId } });
  if (!candidate) throw new Error('La candidata seleccionada no existe o no pertenece a tu empresa');

  return prisma.contact.upsert({
    where: { companyId_rutClean: { companyId, rutClean: candidate.rutClean } },
    update: {},
    create: {
      companyId,
      rut: candidate.rut,
      rutClean: candidate.rutClean,
      razonSocial: candidate.stageName || candidate.fullName,
      email: candidate.email || undefined,
      phone: candidate.phone || undefined,
      isCustomer: true,
    },
  });
}

/**
 * Resuelve el `Contact` según el tipo de cliente elegido: un sponsor ya ES un
 * `Contact` (se usa tal cual, validando que pertenezca a la empresa); una
 * candidata resuelve/crea su `Contact` vía `getOrCreateContactForCandidate`.
 */
async function resolveClient(
  companyId: string,
  data: Pick<PaymentPlanCreateInput, 'clientType' | 'contactId' | 'candidateId'>
): Promise<{ contactId: string; candidateId: string | null }> {
  if (data.clientType === 'CANDIDATE') {
    if (!data.candidateId) throw new Error('Seleccione una candidata');
    const contact = await getOrCreateContactForCandidate(companyId, data.candidateId);
    return { contactId: contact.id, candidateId: data.candidateId };
  }

  if (!data.contactId) throw new Error('Seleccione un sponsor');
  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, companyId }, select: { id: true } });
  if (!contact) throw new Error('El sponsor seleccionado no existe o no pertenece a tu empresa');
  return { contactId: contact.id, candidateId: null };
}

export async function createPaymentPlan(companyId: string, data: PaymentPlanCreateInput): Promise<PaymentPlanWithRelations> {
  const client = await resolveClient(companyId, data);

  const amounts = distributeInstallmentAmounts(data.totalAmount, data.installmentCount);

  return prisma.$transaction(async (tx) => {
    const plan = await tx.paymentPlan.create({
      data: {
        companyId,
        contactId: client.contactId,
        candidateId: client.candidateId ?? undefined,
        totalAmount: data.totalAmount,
        installmentCount: data.installmentCount,
        frequency: data.frequency,
        startDate: data.startDate,
        penaltyBps: data.penaltyBps,
        notes: data.notes || undefined,
      },
    });

    await tx.paymentPlanInstallment.createMany({
      data: amounts.map((amount, index) => ({
        companyId,
        paymentPlanId: plan.id,
        installmentNumber: index + 1,
        dueDate: computeDueDate(data.startDate, data.frequency, index),
        amount,
      })),
    });

    const withRelations = await tx.paymentPlan.findFirst({
      where: { id: plan.id, companyId },
      include: {
        contact: true,
        candidate: { select: { id: true, fullName: true, stageName: true } },
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!withRelations) throw new Error('Plan de pago no encontrado tras su creación');
    return withRelations;
  });
}

export async function updatePaymentPlan(
  companyId: string,
  id: string,
  data: PaymentPlanUpdateInput
): Promise<PaymentPlanWithRelations> {
  const updateData: Prisma.PaymentPlanUncheckedUpdateManyInput = {
    notes: data.notes === '' ? null : data.notes,
    status: data.status,
  };

  const result = await prisma.paymentPlan.updateMany({ where: { id, companyId }, data: updateData });
  if (result.count === 0) throw new Error('Plan de pago no encontrado');

  const updated = await getPaymentPlan(companyId, id);
  if (!updated) throw new Error('Plan de pago no encontrado');
  return updated;
}

/** Cancela un plan de pago. Nunca se elimina — ver nota de `onDelete: Restrict` en el schema. */
export async function cancelPaymentPlan(companyId: string, id: string): Promise<PaymentPlanWithRelations> {
  return updatePaymentPlan(companyId, id, { status: 'CANCELLED' });
}

export async function listPaymentPlans(companyId: string, contactId?: string): Promise<PaymentPlanWithRelations[]> {
  return prisma.paymentPlan.findMany({
    where: { companyId, contactId: contactId || undefined },
    include: {
      contact: true,
      candidate: { select: { id: true, fullName: true, stageName: true } },
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPaymentPlan(companyId: string, id: string): Promise<PaymentPlanWithRelations | null> {
  return prisma.paymentPlan.findFirst({
    where: { id, companyId },
    include: {
      contact: true,
      candidate: { select: { id: true, fullName: true, stageName: true } },
      installments: { orderBy: { installmentNumber: 'asc' } },
    },
  });
}

/**
 * Registra un pago sobre una cuota, con lock explícito — mismo patrón EXACTO
 * que `registerSalesPayment` en `treasury.service.ts`: sin el lock, dos cobros
 * concurrentes sobre la misma cuota leían el mismo `paidAmount` y el segundo
 * pisaba al primero.
 */
export async function registerInstallmentPayment(
  companyId: string,
  installmentId: string,
  amount: number,
  method: PaymentMethodType,
  date?: Date
): Promise<PaymentPlanInstallment> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PaymentPlanInstallment" WHERE id = ${installmentId} AND "companyId" = ${companyId} FOR UPDATE`;

    const installment = await tx.paymentPlanInstallment.findFirst({ where: { id: installmentId, companyId } });
    if (!installment) throw new Error('Cuota no encontrada');

    const pendingBalance = installment.amount - installment.paidAmount;
    if (amount > pendingBalance) throw new Error('El monto pagado supera el saldo pendiente de la cuota');

    const newPaidAmount = installment.paidAmount + amount;
    const paymentStatus: PaymentStatus =
      newPaidAmount <= 0 ? 'UNPAID' : newPaidAmount >= installment.amount ? 'PAID' : 'PARTIAL';

    await tx.paymentPlanInstallment.updateMany({
      where: { id: installmentId, companyId },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus,
        paidAt: paymentStatus === 'PAID' ? (date ?? new Date()) : null,
      },
    });

    // método de pago (`method`) y `date` quedan registrados en la propia cuota
    // vía `paidAt`; este módulo no crea un `Payment` de tesorería aparte
    // (el plan de cuotas es su propio libro de cobro), así que `method` solo
    // sirve hoy para trazabilidad futura si se decide anotarlo en auditoría.
    void method;

    // Si todas las cuotas del plan quedaron pagadas, el plan se marca COMPLETED.
    const allInstallments = await tx.paymentPlanInstallment.findMany({
      where: { paymentPlanId: installment.paymentPlanId, companyId },
      select: { paymentStatus: true },
    });
    const allPaid = allInstallments.every((i) => i.paymentStatus === 'PAID');
    if (allPaid) {
      await tx.paymentPlan.updateMany({
        where: { id: installment.paymentPlanId, companyId },
        data: { status: 'COMPLETED' },
      });
    }

    const updated = await tx.paymentPlanInstallment.findFirst({ where: { id: installmentId, companyId } });
    if (!updated) throw new Error('Cuota no encontrada');
    return updated;
  }, LOCKING_TX_OPTIONS);
}

/**
 * Aplica multa por mora a las cuotas vencidas y aún no penalizadas.
 *
 * Decisión: la multa se SUMA directamente a `amount` (el monto exigible de la
 * cuota), no a un campo separado. `penaltyApplied` guarda cuánto de ese
 * `amount` corresponde a multa (guardia contra doble aplicación y para poder
 * desglosarla en la UI), pero el saldo pendiente de la cuota
 * (`amount - paidAmount`) ya queda correcto sin tener que sumar dos columnas
 * en cada lugar que lo calcula (registro de pago, listados, recordatorios).
 */
export async function applyOverduePenalties(companyId: string): Promise<number> {
  const now = new Date();
  const candidates = await prisma.paymentPlanInstallment.findMany({
    where: {
      companyId,
      paymentStatus: { not: 'PAID' },
      dueDate: { lt: now },
      penaltyApplied: 0,
      paymentPlan: { penaltyBps: { gt: 0 }, status: 'ACTIVE' },
    },
    include: { paymentPlan: { select: { penaltyBps: true } } },
  });

  let processed = 0;
  for (const installment of candidates) {
    const penalty = Math.round((installment.amount * installment.paymentPlan.penaltyBps) / 10000);
    if (penalty <= 0) continue;

    const result = await prisma.paymentPlanInstallment.updateMany({
      // `penaltyApplied: 0` repetido acá: guardia contra doble aplicación si
      // el cron corriera dos veces concurrentemente para la misma empresa.
      where: { id: installment.id, companyId, penaltyApplied: 0 },
      data: { amount: { increment: penalty }, penaltyApplied: penalty },
    });
    if (result.count > 0) processed++;
  }

  return processed;
}

/**
 * Solo se permite eliminar una cuota que todavía no registra pago —
 * mismo criterio que `deletePromissoryNote`: una cuota con `paidAmount > 0`
 * no se borra (perdería el rastro del cobro ya hecho), se deja como está.
 */
export async function deleteInstallment(companyId: string, installmentId: string): Promise<void> {
  const installment = await prisma.paymentPlanInstallment.findFirst({ where: { id: installmentId, companyId } });
  if (!installment) throw new Error('Cuota no encontrada');
  if (installment.paidAmount > 0) {
    throw new Error('No se puede eliminar: esta cuota ya registra un pago. El historial de cobro no se puede perder.');
  }

  const result = await prisma.paymentPlanInstallment.deleteMany({ where: { id: installmentId, companyId } });
  if (result.count === 0) throw new Error('Cuota no encontrada');
}

/**
 * Elimina el plan de pago COMPLETO y todas sus cuotas — a diferencia de
 * `cancelPaymentPlan` (que solo cambia el estado y conserva el historial),
 * esto es borrado real, sin vuelta atrás, INCLUSO si ya tiene cuotas con
 * pagos registrados (decisión explícita del negocio: cuando alguien deja de
 * pertenecer al sistema, no debe quedar dato "estorbando" aunque haya tenido
 * pagos). El único rastro que sobrevive es el `AuditLog` de la Server Action
 * (quién, cuándo, cuánto se borró) — la fila operativa desaparece de verdad.
 *
 * `PaymentPlanInstallment.paymentPlan` usa `onDelete: Restrict` a nivel de
 * BD, así que las cuotas se borran primero y el plan después, dentro de la
 * misma transacción, con lock explícito para que un cobro registrado a mitad
 * de camino no quede en un estado inconsistente (mismo criterio que
 * `registerInstallmentPayment`).
 */
export async function deletePaymentPlan(companyId: string, id: string): Promise<{ totalPaid: number }> {
  return prisma.$transaction(async (tx) => {
    const installments = await tx.$queryRaw<Array<{ paidAmount: number }>>`
      SELECT "paidAmount" FROM "PaymentPlanInstallment"
      WHERE "paymentPlanId" = ${id} AND "companyId" = ${companyId}
      FOR UPDATE
    `;

    const plan = await tx.paymentPlan.findFirst({ where: { id, companyId } });
    if (!plan) throw new Error('Plan de pago no encontrado');

    const totalPaid = installments.reduce((sum, i) => sum + i.paidAmount, 0);

    await tx.paymentPlanInstallment.deleteMany({ where: { paymentPlanId: id, companyId } });
    await tx.paymentPlan.deleteMany({ where: { id, companyId } });
    return { totalPaid };
  }, LOCKING_TX_OPTIONS);
}

export interface OverdueInstallmentGroup {
  paymentPlanId: string;
  contactId: string;
  contactRazonSocial: string;
  contactEmail: string | null;
  installments: Array<{
    installmentNumber: number;
    installmentCount: number;
    dueDate: Date;
    amount: number;
    penaltyApplied: number;
  }>;
}

/** Cuotas vencidas agrupadas por plan/contacto, para el cron de recordatorio por correo. */
export async function listOverdueInstallments(companyId: string): Promise<OverdueInstallmentGroup[]> {
  const now = new Date();
  const installments = await prisma.paymentPlanInstallment.findMany({
    where: {
      companyId,
      paymentStatus: { not: 'PAID' },
      dueDate: { lt: now },
      paymentPlan: { status: 'ACTIVE' },
    },
    include: {
      paymentPlan: {
        select: {
          id: true,
          installmentCount: true,
          contactId: true,
          contact: { select: { razonSocial: true, email: true } },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const groups = new Map<string, OverdueInstallmentGroup>();
  for (const installment of installments) {
    const key = installment.paymentPlan.id;
    if (!groups.has(key)) {
      groups.set(key, {
        paymentPlanId: installment.paymentPlan.id,
        contactId: installment.paymentPlan.contactId,
        contactRazonSocial: installment.paymentPlan.contact.razonSocial,
        contactEmail: installment.paymentPlan.contact.email,
        installments: [],
      });
    }
    groups.get(key)!.installments.push({
      installmentNumber: installment.installmentNumber,
      installmentCount: installment.paymentPlan.installmentCount,
      dueDate: installment.dueDate,
      amount: installment.amount,
      penaltyApplied: installment.penaltyApplied,
    });
  }

  return Array.from(groups.values());
}
