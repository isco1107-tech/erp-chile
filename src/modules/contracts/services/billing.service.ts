import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { constraintInvolves } from '@/lib/prisma-errors';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { dueDateFor, isBillingDue, nextBillingDate, periodKeyFor, periodLabel } from '@/lib/services/recurring-billing';
import { createSalesDocument } from '@/modules/sales/services/sales.service';
import { salesDocumentCreateSchema } from '@/modules/sales/schema';

/**
 * Facturación de contratos recurrentes.
 *
 * Garantías:
 *  - Un período se factura UNA vez: el documento lleva la llave de
 *    idempotencia `contract:<id>:<período>`, así que si dos procesos (cron +
 *    botón "Facturar ahora") llegan a la vez, `createSalesDocument` devuelve
 *    el mismo documento en vez de crear otro.
 *  - La fecha del contrato avanza con un `updateMany` condicionado a la fecha
 *    que se leyó: solo uno de dos procesos simultáneos la mueve.
 *  - Si la emisión falla (sin folios, límite de crédito, cliente sin RUT…),
 *    queda registrado como FALLIDO con el motivo y la fecha NO avanza: el
 *    próximo intento vuelve a probar el mismo período.
 */

export type BillingOutcome =
  | { kind: 'billed'; salesDocumentId: string; periodKey: string; issued: boolean }
  | { kind: 'failed'; periodKey: string; error: string }
  | { kind: 'ended' }
  | { kind: 'not_due' };

async function defaultWarehouseId(companyId: string): Promise<string | null> {
  const warehouse = await prisma.warehouse.findFirst({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
  return warehouse?.id ?? null;
}

/**
 * Factura el período que empieza en `nextBillingDate`. Con `force` (botón
 * "Facturar ahora") se factura aunque la fecha todavía no llegue — útil para
 * emitir el primer período apenas se firma el contrato.
 */
export async function billContractPeriod(companyId: string, contractId: string, opts: { force?: boolean } = {}): Promise<BillingOutcome> {
  const contract = await prisma.serviceContract.findFirst({
    where: { id: contractId, companyId },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, contact: { select: { razonSocial: true } } },
  });
  if (!contract) throw new Error('El contrato no existe');
  if (contract.status !== 'ACTIVE') throw new Error('Solo se facturan contratos activos');

  const billingDate = contract.nextBillingDate;
  if (contract.endDate && billingDate.getTime() > contract.endDate.getTime()) {
    await prisma.serviceContract.updateMany({ where: { id: contract.id, companyId, status: 'ACTIVE' }, data: { status: 'ENDED' } });
    return { kind: 'ended' };
  }
  if (!opts.force && !isBillingDue(contract, new Date())) return { kind: 'not_due' };

  const periodKey = periodKeyFor(billingDate);
  const label = periodLabel(billingDate, contract.frequency);

  try {
    const warehouseId = contract.warehouseId ?? (await defaultWarehouseId(companyId));
    if (!warehouseId) throw new Error('La empresa no tiene bodegas: crea una en Inventario antes de facturar');

    const parsed = salesDocumentCreateSchema.safeParse({
      contactId: contract.contactId,
      warehouseId,
      dteType: contract.dteType,
      paymentMethod: contract.paymentMethod,
      dueDate: dueDateFor(new Date(), contract.paymentTermDays).toISOString(),
      notes: `${contract.name} — período ${label}`,
      idempotencyKey: `contract:${contract.id}:${periodKey}`,
      items: contract.lines.map((line) => ({
        productId: line.productId ?? undefined,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        isExempt: line.productId ? undefined : line.isExempt,
      })),
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'El contrato tiene datos inválidos');

    let document: { id: string; status: string };
    try {
      document = await createSalesDocument(companyId, parsed.data, contract.autoIssue ? 'ISSUED' : 'DRAFT');
    } catch (error) {
      // Otro proceso (cron + "Facturar ahora") creó el mismo período entre la
      // revisión de idempotencia y el INSERT: el documento existe, se usa ese.
      if (!constraintInvolves(error, 'idempotencyKey')) throw error;
      const existing = await prisma.salesDocument.findFirst({
        where: { companyId, idempotencyKey: `contract:${contract.id}:${periodKey}` },
        select: { id: true, status: true },
      });
      if (!existing) throw error;
      document = existing;
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceContractBilling.upsert({
        where: { contractId_periodKey: { contractId: contract.id, periodKey } },
        update: { status: 'GENERATED', salesDocumentId: document.id, errorMessage: null, billingDate },
        create: { companyId, contractId: contract.id, periodKey, billingDate, status: 'GENERATED', salesDocumentId: document.id },
      });
      const next = nextBillingDate(billingDate, contract.frequency, contract.startDate);
      const ended = contract.endDate !== null && next.getTime() > contract.endDate.getTime();
      await tx.serviceContract.updateMany({
        where: { id: contract.id, companyId, nextBillingDate: billingDate },
        data: { nextBillingDate: next, ...(ended ? { status: 'ENDED' as const } : {}) },
      });
    });

    return { kind: 'billed', salesDocumentId: document.id, periodKey, issued: document.status === 'ISSUED' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al facturar';
    // Un error de negocio (sin folios, límite de crédito) es información para
    // el usuario; uno inesperado además va a observabilidad.
    if (!(error instanceof Error) || error.name !== 'Error') {
      captureException(error, { module: 'contratos-recurrentes', companyId, extra: { contractId, periodKey } });
    }
    // Un período ya GENERATED nunca baja a FALLIDO (un intento concurrente
    // pudo facturarlo mientras este fallaba): solo se actualiza lo no generado
    // y, si no había registro, se crea.
    const failure = { status: 'FAILED' as const, errorMessage: message.slice(0, 500), billingDate };
    await prisma
      .$transaction(async (tx) => {
        const updated = await tx.serviceContractBilling.updateMany({
          where: { companyId, contractId: contract.id, periodKey, status: { not: 'GENERATED' } },
          data: failure,
        });
        if (updated.count > 0) return;
        const exists = await tx.serviceContractBilling.findFirst({ where: { companyId, contractId: contract.id, periodKey }, select: { id: true } });
        if (!exists) await tx.serviceContractBilling.create({ data: { companyId, contractId: contract.id, periodKey, ...failure } });
      })
      .catch((logError) => {
        // Una carrera al crear el registro (otro proceso lo creó primero) no es un problema real.
        if (constraintInvolves(logError, 'periodKey')) return;
        captureException(logError, { module: 'contratos-recurrentes', companyId, extra: { contractId, reason: 'billing-log' } });
      });
    return { kind: 'failed', periodKey, error: message };
  }
}

/**
 * Cron diario: factura todos los contratos vencidos de las empresas con el
 * módulo activo. Si un contrato quedó atrasado varios períodos (el cron no
 * corrió), se pone al día hasta 12 períodos por ejecución. Nunca deja que el
 * fallo de un contrato o de una empresa interrumpa a los demás.
 */
export async function runRecurringBillingCron(now: Date = new Date()): Promise<{ companies: number; billed: number; failed: number }> {
  const companies = await prisma.company.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, features: { hasServiceContracts: true } },
    select: { id: true },
  });

  let billed = 0;
  let failed = 0;
  for (const company of companies) {
    const due = await prisma.serviceContract.findMany({
      where: { companyId: company.id, status: 'ACTIVE', nextBillingDate: { lte: now } },
      select: { id: true, name: true },
      take: 500,
    });
    let companyDrafts = 0;
    for (const contract of due) {
      for (let round = 0; round < 12; round++) {
        try {
          const outcome = await billContractPeriod(company.id, contract.id);
          if (outcome.kind === 'billed') {
            billed++;
            if (!outcome.issued) companyDrafts++;
            continue;
          }
          if (outcome.kind === 'failed') {
            failed++;
            void emitWorkflowEvent(company.id, 'RECURRING_BILLING_FAILED', {
              contractId: contract.id,
              contractName: contract.name,
              periodKey: outcome.periodKey,
              error: outcome.error,
            });
          }
        } catch (error) {
          failed++;
          captureException(error, { module: 'contratos-recurrentes', companyId: company.id, extra: { contractId: contract.id } });
        }
        break;
      }
    }
    if (companyDrafts > 0) {
      void emitWorkflowEvent(company.id, 'RECURRING_INVOICES_READY', { draftCount: companyDrafts });
    }
  }
  return { companies: companies.length, billed, failed };
}
