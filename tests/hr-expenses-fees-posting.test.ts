/**
 * Auditoría 2026-09-27, hallazgo C-1: cerrar remuneraciones, reembolsar una
 * rendición de gastos y pagar una boleta de honorarios no generaban ningún
 * movimiento en Tesorería ni asiento contable. Estos tests cubren las tres
 * reglas nuevas y el helper de auto-completado del plan de cuentas.
 */

jest.mock('@/modules/accounting/services/journal.service', () => ({
  ...jest.requireActual('@/modules/accounting/services/journal.service'),
  createAndPostEntry: jest.fn(async () => ({ id: 'entry-1' })),
}));
jest.mock('@/modules/accounting/chart-of-accounts', () => ({
  ...jest.requireActual('@/modules/accounting/chart-of-accounts'),
  resolveOrCreateMappedAccount: jest.fn(async (_tx: unknown, _companyId: string, key: string) => `acc-${key}`),
}));
jest.mock('@/modules/accounting/posting-rules/shared', () => ({
  ...jest.requireActual('@/modules/accounting/posting-rules/shared'),
  isLedgerActive: jest.fn(async () => true),
}));

import { createAndPostEntry } from '@/modules/accounting/services/journal.service';
import { resolveOrCreateMappedAccount } from '@/modules/accounting/chart-of-accounts';
import { isLedgerActive } from '@/modules/accounting/posting-rules/shared';
import { postPayrollClosingEntry } from '@/modules/accounting/posting-rules/hr-posting';
import { postExpenseReimbursementEntry } from '@/modules/accounting/posting-rules/expenses-posting';
import { postFeeDocumentPaymentEntry } from '@/modules/accounting/posting-rules/fees-posting';

const tx = {} as never;

afterEach(() => jest.clearAllMocks());

describe('postPayrollClosingEntry', () => {
  it('sin Contabilidad activa, no postea nada', async () => {
    jest.mocked(isLedgerActive).mockResolvedValueOnce(false);
    await postPayrollClosingEntry(tx, 'c1', 'p1', 'Septiembre 2026', { totalNetPay: 1000, totalEmployerCost: 200 });
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });

  it('con total cero (planilla vacía), no postea nada', async () => {
    await postPayrollClosingEntry(tx, 'c1', 'p1', 'Septiembre 2026', { totalNetPay: 0, totalEmployerCost: 0 });
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });

  it('carga el gasto de remuneraciones (líquido + costo empresa) contra la obligación con el personal', async () => {
    await postPayrollClosingEntry(tx, 'c1', 'p1', 'Septiembre 2026', { totalNetPay: 800_000, totalEmployerCost: 150_000 });
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'c1', 'GASTO_REMUNERACIONES', '6101');
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'c1', 'OBLIGACIONES_POR_PAGAR_RRHH', '2107');
    const call = jest.mocked(createAndPostEntry).mock.calls[0]![1];
    expect(call.sourceType).toBe('PAYROLL_PERIOD');
    expect(call.sourceId).toBe('p1');
    expect(call.lines).toEqual([
      { accountId: 'acc-GASTO_REMUNERACIONES', debit: 950_000, credit: 0 },
      { accountId: 'acc-OBLIGACIONES_POR_PAGAR_RRHH', debit: 0, credit: 950_000 },
    ]);
  });
});

describe('postExpenseReimbursementEntry', () => {
  it('sin Contabilidad activa, no postea nada', async () => {
    jest.mocked(isLedgerActive).mockResolvedValueOnce(false);
    await postExpenseReimbursementEntry(tx, 'c1', 'r1', 'Viaje a Temuco', 45_000);
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });

  it('carga el gasto de reembolsos contra Banco', async () => {
    await postExpenseReimbursementEntry(tx, 'c1', 'r1', 'Viaje a Temuco', 45_000);
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'c1', 'GASTO_REEMBOLSOS', '6109');
    expect(resolveOrCreateMappedAccount).toHaveBeenCalledWith(tx, 'c1', 'BANCO', '1102');
    const call = jest.mocked(createAndPostEntry).mock.calls[0]![1];
    expect(call.sourceType).toBe('EXPENSE_REPORT');
    expect(call.sourceId).toBe('r1');
    expect(call.lines).toEqual([
      { accountId: 'acc-GASTO_REEMBOLSOS', debit: 45_000, credit: 0 },
      { accountId: 'acc-BANCO', debit: 0, credit: 45_000 },
    ]);
  });
});

describe('postFeeDocumentPaymentEntry', () => {
  const fee = {
    id: 'fee-1',
    contactId: 'contact-1',
    folioNumber: '123',
    grossAmount: 100_000,
    retentionAmount: 15_250,
    netToPay: 84_750,
    paymentDate: new Date('2026-09-27'),
  } as never;

  function fakeTx() {
    return { payment: { create: jest.fn(async ({ data }: { data: unknown }) => ({ id: 'payment-1', ...(data as object) })) } };
  }

  it('siempre crea el Payment de tesorería, incluso sin Contabilidad activa', async () => {
    jest.mocked(isLedgerActive).mockResolvedValueOnce(false);
    const t = fakeTx();
    await postFeeDocumentPaymentEntry(t as never, 'c1', fee);
    expect(t.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'c1', type: 'EXPENSE', contactId: 'contact-1', feeDocumentId: 'fee-1', amount: 84_750 }),
    });
    expect(createAndPostEntry).not.toHaveBeenCalled();
  });

  it('con Contabilidad activa, el asiento cuadra: gasto bruto = retención + banco', async () => {
    const t = fakeTx();
    await postFeeDocumentPaymentEntry(t as never, 'c1', fee);
    const call = jest.mocked(createAndPostEntry).mock.calls[0]![1];
    expect(call.sourceType).toBe('PAYMENT');
    expect(call.sourceId).toBe('payment-1');
    const total = call.lines.reduce((sum: number, l: { debit: number; credit: number }) => sum + l.debit - l.credit, 0);
    expect(total).toBe(0);
    expect(call.lines).toEqual([
      { accountId: 'acc-GASTO_HONORARIOS', debit: 100_000, credit: 0 },
      { accountId: 'acc-RETENCION_HONORARIOS', debit: 0, credit: 15_250 },
      { accountId: 'acc-BANCO', debit: 0, credit: 84_750 },
    ]);
  });
});
