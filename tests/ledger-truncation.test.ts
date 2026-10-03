import { LEDGER_MAX_LINES, getLedger } from '@/modules/accounting/services/ledger.service';

const findMany = jest.fn();
const aggregate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    journalLine: {
      findMany: (...args: unknown[]) => findMany(...args),
      aggregate: (...args: unknown[]) => aggregate(...args),
    },
  },
}));

const FROM = new Date('2026-09-01T00:00:00Z');
const TO = new Date('2026-09-30T23:59:59Z');

function lines(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `l${i}`, debit: 10, credit: 0, lineNumber: i, entry: {} }));
}

beforeEach(() => {
  findMany.mockReset();
  aggregate.mockReset();
});

describe('getLedger: tope de movimientos', () => {
  it('bajo el tope: devuelve todo, saldo corrido y totales de las líneas, sin consulta extra', async () => {
    aggregate.mockResolvedValueOnce({ _sum: { debit: 100, credit: 0 } }); // saldo inicial
    findMany.mockResolvedValueOnce(lines(3));
    const result = await getLedger('c1', 'a1', FROM, TO);
    expect(result.truncated).toBe(false);
    expect(result.lines).toHaveLength(3);
    expect(result.openingBalance).toBe(100);
    expect(result.closingBalance).toBe(130);
    expect(result.periodDebit).toBe(30);
    expect(result.periodCredit).toBe(0);
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('pide una línea más que el tope para detectar el recorte', async () => {
    aggregate.mockResolvedValueOnce({ _sum: { debit: 0, credit: 0 } });
    findMany.mockResolvedValueOnce([]);
    await getLedger('c1', 'a1', FROM, TO);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: LEDGER_MAX_LINES + 1, where: { companyId: 'c1', accountId: 'a1' } });
  });

  it('sobre el tope: recorta las líneas pero saldo final y totales salen de la base completa', async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { debit: 1000, credit: 400 } }) // saldo inicial = 600
      .mockResolvedValueOnce({ _sum: { debit: 70_000, credit: 5_000 } }); // totales reales del período
    findMany.mockResolvedValueOnce(lines(LEDGER_MAX_LINES + 1));
    const result = await getLedger('c1', 'a1', FROM, TO);
    expect(result.truncated).toBe(true);
    expect(result.lines).toHaveLength(LEDGER_MAX_LINES);
    expect(result.openingBalance).toBe(600);
    expect(result.periodDebit).toBe(70_000);
    expect(result.periodCredit).toBe(5_000);
    expect(result.closingBalance).toBe(600 + 70_000 - 5_000);
    // El saldo corrido de la última línea mostrada NO es el saldo final.
    expect(result.lines.at(-1)!.runningBalance).toBe(600 + LEDGER_MAX_LINES * 10);
  });

  it('la consulta de totales usa el mismo filtro de empresa y cuenta', async () => {
    aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 0 } });
    findMany.mockResolvedValueOnce(lines(LEDGER_MAX_LINES + 1));
    await getLedger('c1', 'a1', FROM, TO);
    expect(aggregate.mock.calls[1]![0]).toMatchObject({ where: { companyId: 'c1', accountId: 'a1' } });
  });
});
