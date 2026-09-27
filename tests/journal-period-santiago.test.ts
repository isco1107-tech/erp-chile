import { createEntry } from '@/modules/accounting/services/journal.service';

/**
 * Auditoría 2026-09-27, hallazgo FIN-01/TRI-03: el período contable y el año
 * del correlativo de un asiento se resolvían con `date.getUTCFullYear()` /
 * `getUTCMonth()`. Un asiento fechado el 1 de septiembre a primera hora en
 * Chile (`2026-09-01T02:00:00Z`) todavía es 31 de agosto en UTC-4, así que
 * caía en el período de agosto en vez de septiembre. `resolveOpenPeriod` y el
 * correlativo ahora usan `santiagoDateParts`.
 */

function fakeTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountingPeriod: {
      upsert: jest.fn(async ({ where }: { where: { companyId_year_month: { year: number; month: number } } }) => ({
        id: `period-${where.companyId_year_month.year}-${where.companyId_year_month.month}`,
        status: 'OPEN',
      })),
    },
    account: {
      findMany: jest.fn(async () => [{ id: 'acc-1', code: '1', name: 'Cuenta', isPostable: true, isActive: true }]),
    },
    journalEntrySequence: {
      upsert: jest.fn(async () => ({ currentNumber: 1 })),
    },
    journalEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, lines: [] })),
    },
    ...overrides,
  };
}

const lines = [
  { accountId: 'acc-1', debit: 1000, credit: 0 },
  { accountId: 'acc-1', debit: 0, credit: 1000 },
];

describe('createEntry — período y correlativo en el calendario de Santiago', () => {
  it('un asiento del 1 de septiembre 02:00 UTC (31 de agosto en Chile) abre el período de agosto, no el de septiembre', async () => {
    const tx = fakeTx();
    await createEntry(tx as never, {
      companyId: 'c1',
      date: new Date('2026-09-01T02:00:00Z'),
      description: 'Test',
      sourceType: 'MANUAL',
      lines,
    });

    expect(tx.accountingPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId_year_month: { companyId: 'c1', year: 2026, month: 8 } } })
    );
    expect(tx.journalEntrySequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId_year: { companyId: 'c1', year: 2026 } } })
    );
  });

  it('el mismo instante ya en pleno día (12:00 UTC, tarde en Chile) sí cae en septiembre', async () => {
    const tx = fakeTx();
    await createEntry(tx as never, {
      companyId: 'c1',
      date: new Date('2026-09-01T12:00:00Z'),
      description: 'Test',
      sourceType: 'MANUAL',
      lines,
    });

    expect(tx.accountingPeriod.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId_year_month: { companyId: 'c1', year: 2026, month: 9 } } })
    );
  });
});
