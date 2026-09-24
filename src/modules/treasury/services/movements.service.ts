import 'server-only';

import type { Payment, PaymentMethodType, PaymentSource } from '@prisma/client';
import { postTreasuryMovementEntry } from '@/modules/accounting/posting-rules/treasury-posting';
import type { TxClient } from '@/modules/accounting/services/journal.service';
import { emitWorkflowEvent } from '@/lib/workflows/engine';

/**
 * Libro único de dinero de la empresa.
 *
 * Todo módulo que cobra o paga algo fuera de un documento de venta/compra
 * (sueldos, honorarios, rendiciones, cuotas, entradas, votos, auspicios,
 * pagarés, cartola) pasa por `recordTreasuryMovement`. Así:
 *  - el flujo de caja y los saldos por cuenta ven TODO el dinero, no solo el
 *    de ventas y compras;
 *  - cada movimiento genera su asiento (si la Contabilidad está activa) dentro
 *    de la misma transacción del módulo que lo origina: o nacen los dos o
 *    ninguno;
 *  - desde Tesorería se puede volver al registro de origen (`source`/`sourceId`).
 *
 * Nunca abre su propia transacción: el módulo que llama ya tiene la suya, con
 * el lock sobre su propio registro.
 */

export interface TreasuryMovementInput {
  companyId: string;
  direction: 'INCOME' | 'EXPENSE';
  /** CLP entero, > 0. Una corrección a la baja se registra como movimiento de sentido contrario. */
  amount: number;
  method: PaymentMethodType;
  date?: Date;
  source: PaymentSource;
  sourceId: string;
  description: string;
  /** Clave de `AccountMapping` de la contrapartida contable (ver `postTreasuryMovementEntry`). */
  counterpartKey: string;
  contactId?: string | null;
  projectId?: string | null;
  treasuryAccountId?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  createdByUserId?: string;
}

export class TreasuryMovementError extends Error {}

export async function recordTreasuryMovement(tx: TxClient, input: TreasuryMovementInput): Promise<Payment> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new TreasuryMovementError('El monto del movimiento debe ser un entero positivo en pesos');
  }
  if (input.treasuryAccountId) {
    const account = await tx.treasuryAccount.findFirst({
      where: { id: input.treasuryAccountId, companyId: input.companyId, isActive: true },
      select: { id: true },
    });
    if (!account) throw new TreasuryMovementError('La caja o cuenta bancaria seleccionada no existe o está desactivada');
  }

  const treasuryAccountId = input.treasuryAccountId ?? (await defaultTreasuryAccountId(tx, input.companyId, input.method));

  const payment = await tx.payment.create({
    data: {
      companyId: input.companyId,
      type: input.direction,
      contactId: input.contactId ?? null,
      projectId: input.projectId ?? null,
      source: input.source,
      sourceId: input.sourceId,
      description: input.description,
      amount: input.amount,
      paymentMethod: input.method,
      paymentDate: input.date ?? new Date(),
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      treasuryAccountId,
    },
  });

  await postTreasuryMovementEntry(tx, input.companyId, payment, input.counterpartKey, {
    createdByUserId: input.createdByUserId,
  });
  return payment;
}

/**
 * Para los módulos que registran el "monto pagado acumulado" de un registro
 * (entradas, votos, pagarés, auspicios): registra en Tesorería solo la
 * diferencia contra lo ya pagado. Si el monto sube, es un cobro; si baja (una
 * corrección o devolución), es un egreso por la diferencia contra la misma
 * contrapartida, así el saldo contable queda igual a lo realmente cobrado.
 * `null` si no cambió nada.
 */
export async function recordPaidAmountChange(
  tx: TxClient,
  input: Omit<TreasuryMovementInput, 'direction' | 'amount' | 'method'> & {
    previousPaid: number;
    newPaid: number;
    method?: PaymentMethodType;
  }
): Promise<Payment | null> {
  const { previousPaid, newPaid, method, ...rest } = input;
  const delta = newPaid - previousPaid;
  if (delta === 0) return null;
  return recordTreasuryMovement(tx, {
    ...rest,
    direction: delta > 0 ? 'INCOME' : 'EXPENSE',
    amount: Math.abs(delta),
    method: method ?? 'TRANSFERENCIA',
    description: delta > 0 ? rest.description : `Corrección / devolución — ${rest.description}`,
  });
}

/**
 * Cuenta de Tesorería que se asume cuando el módulo no indica una: la marcada
 * por defecto del tipo que corresponde al medio de pago (efectivo → caja,
 * resto → banco). `null` si la empresa no configuró cuentas: el movimiento
 * igual queda registrado, solo que sin cuenta asignada.
 */
export async function defaultTreasuryAccountId(tx: TxClient, companyId: string, method: PaymentMethodType): Promise<string | null> {
  const account = await tx.treasuryAccount.findFirst({
    where: { companyId, isActive: true, isDefault: true, type: method === 'EFECTIVO' ? 'CASH' : 'BANK' },
    select: { id: true },
  });
  return account?.id ?? null;
}

/**
 * Dispara `PAYMENT_RECEIVED`/`PAYMENT_MADE` para las automatizaciones. Se
 * llama DESPUÉS de que la transacción confirmó (regla de CLAUDE.md: un correo
 * o webhook no debe poder influir en si el pago se guarda). Nunca lanza.
 */
export function emitPaymentEvent(companyId: string, payment: Pick<Payment, 'id' | 'type' | 'amount' | 'paymentMethod' | 'source' | 'description' | 'contactId'>): void {
  void emitWorkflowEvent(companyId, payment.type === 'INCOME' ? 'PAYMENT_RECEIVED' : 'PAYMENT_MADE', {
    paymentId: payment.id,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    source: payment.source ?? 'DOCUMENT',
    description: payment.description ?? '',
    contactId: payment.contactId ?? '',
  });
}
