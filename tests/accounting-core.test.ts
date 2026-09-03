import { validateLinesShape, JournalError, type JournalLineInput } from '@/modules/accounting/services/journal.service';
import { netToColumns } from '@/modules/accounting/services/ledger.service';

/**
 * Lógica pura del núcleo contable: cuadratura y signos de línea, y la
 * conversión de un saldo neto a columnas debe/haber. Las invariantes que
 * exigen una base real (inmutabilidad de un POSTED, período cerrado,
 * aislamiento multi-tenant, reverso) se verifican en
 * `scripts/verify-accounting-invariants.ts` y `scripts/verify-accounting-engine.ts`.
 */

function line(debit: number, credit: number, accountId = 'acc-1'): JournalLineInput {
  return { accountId, debit, credit };
}

describe('validateLinesShape — cuadratura y signos', () => {
  it('acepta un asiento cuadrado con líneas simples', () => {
    expect(() => validateLinesShape([line(1000, 0), line(0, 1000, 'acc-2')])).not.toThrow();
  });

  it('acepta un asiento cuadrado con varias líneas por lado', () => {
    expect(() =>
      validateLinesShape([line(600, 0), line(400, 0, 'acc-2'), line(0, 1000, 'acc-3')])
    ).not.toThrow();
  });

  it('rechaza un asiento sin líneas', () => {
    expect(() => validateLinesShape([])).toThrow(JournalError);
  });

  it('rechaza un asiento descuadrado', () => {
    expect(() => validateLinesShape([line(1000, 0), line(0, 700, 'acc-2')])).toThrow(/descuadrado/);
  });

  it('rechaza una línea con debit y credit ambos > 0', () => {
    expect(() => validateLinesShape([line(100, 50), line(0, 50, 'acc-2')])).toThrow(/debe O a haber/);
  });

  it('rechaza una línea con debit y credit ambos en cero', () => {
    expect(() => validateLinesShape([line(0, 0), line(0, 0, 'acc-2')])).toThrow(/debe O a haber/);
  });

  it('rechaza un monto negativo', () => {
    expect(() => validateLinesShape([line(-100, 0), line(0, 100, 'acc-2')])).toThrow(/negativos/);
  });
});

describe('netToColumns — presentación del balance de comprobación', () => {
  it('un neto positivo (saldo deudor) va a la columna debe', () => {
    expect(netToColumns(5000)).toEqual({ debit: 5000, credit: 0 });
  });

  it('un neto negativo (saldo acreedor) va a la columna haber, en positivo', () => {
    expect(netToColumns(-5000)).toEqual({ debit: 0, credit: 5000 });
  });

  it('un neto en cero no aparece en ninguna columna', () => {
    expect(netToColumns(0)).toEqual({ debit: 0, credit: 0 });
  });
});
