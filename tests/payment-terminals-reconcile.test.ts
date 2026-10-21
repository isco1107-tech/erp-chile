import { reconcileTerminalPayment, type ExpectedPayment } from '@/lib/payments/terminals/reconcile';
import { buildManualPayment } from '@/lib/payments/terminals/providers/manual';
import type { TerminalPayment } from '@/lib/payments/terminals/types';

function payment(overrides: Partial<TerminalPayment> = {}): TerminalPayment {
  return {
    providerId: 'generic-webhook',
    externalId: 'tx-1',
    amountClp: 10_000,
    currency: 'CLP',
    status: 'APPROVED',
    method: 'DEBIT',
    occurredAt: new Date('2026-10-21T12:00:00Z'),
    raw: {},
    ...overrides,
  };
}

const open: ExpectedPayment = { amountClp: 10_000, state: 'OPEN' };

describe('reconcileTerminalPayment', () => {
  it('APPLY solo con APPROVED y monto exacto', () => {
    expect(reconcileTerminalPayment(payment(), open)).toEqual({ action: 'APPLY' });
  });

  it.each([9_999, 10_001, 1_000, 100_000])('monto %i distinto del esperado: AMOUNT_MISMATCH', (amountClp) => {
    expect(reconcileTerminalPayment(payment({ amountClp }), open)).toMatchObject({ action: 'AMOUNT_MISMATCH' });
  });

  it('un monto no entero nunca calza', () => {
    expect(reconcileTerminalPayment(payment({ amountClp: 10_000.4 }), open)).toMatchObject({ action: 'AMOUNT_MISMATCH' });
  });

  it('moneda distinta de CLP: AMOUNT_MISMATCH', () => {
    const foreign = { ...payment(), currency: 'USD' } as unknown as TerminalPayment;
    expect(reconcileTerminalPayment(foreign, open)).toMatchObject({ action: 'AMOUNT_MISMATCH' });
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['REJECTED', 'REJECTED'],
    ['CANCELLED', 'CANCELLED'],
    ['REFUNDED', 'REFUNDED'],
  ] as const)('estado %s: NOT_FINAL aunque el monto calce', (status, reason) => {
    expect(reconcileTerminalPayment(payment({ status }), open)).toEqual({ action: 'NOT_FINAL', reason });
  });

  it('el estado se evalúa antes que el monto: un PENDING con otro monto es NOT_FINAL', () => {
    expect(reconcileTerminalPayment(payment({ status: 'PENDING', amountClp: 5 }), open)).toMatchObject({ action: 'NOT_FINAL' });
  });

  it('mismo pago llegando otra vez sobre una venta ya pagada: IGNORE_DUPLICATE', () => {
    const paid: ExpectedPayment = { ...open, state: 'PAID', paidByExternalId: 'tx-1' };
    expect(reconcileTerminalPayment(payment(), paid)).toEqual({ action: 'IGNORE_DUPLICATE' });
  });

  it('venta pagada sin saber por quién: se trata como reintento', () => {
    expect(reconcileTerminalPayment(payment(), { ...open, state: 'PAID' })).toEqual({ action: 'IGNORE_DUPLICATE' });
  });

  it('OTRO pago aprobado sobre una venta ya pagada es doble cobro, no duplicado', () => {
    const paid: ExpectedPayment = { ...open, state: 'PAID', paidByExternalId: 'tx-0' };
    expect(reconcileTerminalPayment(payment({ externalId: 'tx-2' }), paid)).toEqual({ action: 'NEEDS_REVIEW', reason: 'DOUBLE_PAYMENT' });
  });

  it('pago aprobado sobre una venta anulada/vencida: revisión humana', () => {
    expect(reconcileTerminalPayment(payment(), { ...open, state: 'CLOSED' })).toEqual({ action: 'NEEDS_REVIEW', reason: 'ORDER_CLOSED' });
  });

  it('referencia de otra orden: no se aplica', () => {
    const expected: ExpectedPayment = { ...open, reference: 'order-1' };
    expect(reconcileTerminalPayment(payment({ reference: 'order-2' }), expected)).toEqual({ action: 'NEEDS_REVIEW', reason: 'REFERENCE_MISMATCH' });
    expect(reconcileTerminalPayment(payment({ reference: 'order-1' }), expected)).toEqual({ action: 'APPLY' });
  });

  it('sin referencia en el pago: aplica salvo que se exija', () => {
    const expected: ExpectedPayment = { ...open, reference: 'order-1' };
    expect(reconcileTerminalPayment(payment(), expected)).toEqual({ action: 'APPLY' });
    expect(reconcileTerminalPayment(payment(), { ...expected, requireReference: true })).toEqual({ action: 'NEEDS_REVIEW', reason: 'REFERENCE_MISSING' });
  });

  it('la confirmación manual del cajero pasa por la misma reconciliación (monto digitado se contrasta)', () => {
    const confirmed = buildManualPayment({ confirmationId: 'req-1', amountClp: 10_000, method: 'CREDIT' });
    expect(confirmed.externalId).toBe('manual:req-1');
    expect(reconcileTerminalPayment(confirmed, open)).toEqual({ action: 'APPLY' });
    const typo = buildManualPayment({ confirmationId: 'req-2', amountClp: 1_000 });
    expect(reconcileTerminalPayment(typo, open)).toMatchObject({ action: 'AMOUNT_MISMATCH' });
  });

  it('la confirmación manual rechaza montos no enteros o ids vacíos', () => {
    expect(() => buildManualPayment({ confirmationId: 'a', amountClp: 10.5 })).toThrow();
    expect(() => buildManualPayment({ confirmationId: '  ', amountClp: 100 })).toThrow();
  });
});
