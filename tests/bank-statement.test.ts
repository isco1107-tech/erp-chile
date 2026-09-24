import crypto from 'crypto';
import { fingerprintLines, matchScore, parseBankStatement, parseStatementAmount, parseStatementDate } from '@/lib/treasury/bank-statement';

/**
 * Cartolas bancarias: el lector debe entender los formatos reales que
 * exportan los bancos chilenos. Un monto mal leído (miles por decimales) o
 * un cargo leído como abono descuadra toda la conciliación.
 */

const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

describe('montos de cartola', () => {
  it.each([
    ['1.250.000', 1_250_000],
    ['$ 1.250.000', 1_250_000],
    ['-15.000', -15_000],
    ['(15.000)', -15_000],
    ['15.000-', -15_000],
    ['1.250,50', 1_251],
    ['1,250.50', 1_251],
    ['15,000', 15_000],
    ['2500', 2_500],
    ['0', 0],
  ])('"%s" → %d', (raw, expected) => {
    expect(parseStatementAmount(raw)).toBe(expected);
  });

  it('rechaza texto que no es monto', () => {
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('')).toBeNull();
  });
});

describe('fechas de cartola', () => {
  it.each([
    ['05/09/2026', '2026-09-05'],
    ['5-9-26', '2026-09-05'],
    ['2026-09-05', '2026-09-05'],
    ['46270', '2026-09-05'],
  ])('"%s" → %s', (raw, expected) => {
    expect(parseStatementDate(raw)).toBe(expected);
  });

  it('rechaza fechas imposibles', () => {
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('Saldo final')).toBeNull();
  });
});

describe('lectura de la cartola completa', () => {
  it('salta el encabezado del banco y usa columnas de cargos y abonos', () => {
    const grid = [
      ['Banco de Chile', '', '', '', ''],
      ['Cuenta Corriente N° 00-123-45678-90', '', '', '', ''],
      ['', '', '', '', ''],
      ['Fecha', 'Descripción', 'N° Documento', 'Cargos ($)', 'Abonos ($)', 'Saldo ($)'],
      ['01/09/2026', 'TRASPASO DE: CLIENTE UNO SPA', '4581', '', '1.190.000', '5.190.000'],
      ['02/09/2026', 'COMISION MANTENCION', '', '8.990', '', '5.181.010'],
      ['', 'Saldo final', '', '', '', '5.181.010'],
    ];
    const result = parseBankStatement(grid);
    expect(result.headerRow).toBe(4);
    expect(result.lines).toEqual([
      { row: 5, date: '2026-09-01', description: 'TRASPASO DE: CLIENTE UNO SPA', reference: '4581', amount: 1_190_000, balance: 5_190_000 },
      { row: 6, date: '2026-09-02', description: 'COMISION MANTENCION', reference: null, amount: -8_990, balance: 5_181_010 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('entiende una columna de monto con signo', () => {
    const result = parseBankStatement([
      ['Fecha Movimiento', 'Glosa', 'Monto'],
      ['2026-09-10', 'Pago proveedor', '-450.000'],
      ['2026-09-11', 'Depósito', '120.000'],
    ]);
    expect(result.lines.map((line) => line.amount)).toEqual([-450_000, 120_000]);
  });

  it('avisa si no encuentra la tabla', () => {
    expect(() => parseBankStatement([['Hola', 'Mundo']])).toThrow(/tabla de movimientos/);
  });
});

describe('huellas anti-duplicado', () => {
  it('dos movimientos idénticos en el mismo archivo tienen huellas distintas; reimportar da las mismas', () => {
    const lines = [
      { row: 2, date: '2026-09-02', description: 'COMISION', reference: null, amount: -990, balance: null },
      { row: 3, date: '2026-09-02', description: 'COMISION', reference: null, amount: -990, balance: null },
    ];
    const first = fingerprintLines(lines, sha);
    expect(first[0]).not.toBe(first[1]);
    expect(fingerprintLines(lines, sha)).toEqual(first);
  });
});

describe('calce con Tesorería', () => {
  const line = { amount: 1_190_000, date: new Date('2026-09-01T12:00:00Z'), reference: '4581', description: 'TRASPASO', treasuryAccountId: 'acc_1' };

  it('exige mismo sentido y monto exacto', () => {
    expect(matchScore(line, { id: 'p', type: 'EXPENSE', amount: 1_190_000, paymentDate: line.date, referenceNumber: null, treasuryAccountId: null })).toBeNull();
    expect(matchScore(line, { id: 'p', type: 'INCOME', amount: 1_190_001, paymentDate: line.date, referenceNumber: null, treasuryAccountId: null })).toBeNull();
  });

  it('prefiere la fecha más cercana y la referencia coincidente', () => {
    const near = matchScore(line, { id: 'a', type: 'INCOME', amount: 1_190_000, paymentDate: new Date('2026-09-01T15:00:00Z'), referenceNumber: null, treasuryAccountId: null });
    const far = matchScore(line, { id: 'b', type: 'INCOME', amount: 1_190_000, paymentDate: new Date('2026-09-06T15:00:00Z'), referenceNumber: null, treasuryAccountId: null });
    const withRef = matchScore(line, { id: 'c', type: 'INCOME', amount: 1_190_000, paymentDate: new Date('2026-09-06T15:00:00Z'), referenceNumber: '4581', treasuryAccountId: null });
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!).toBeGreaterThan(far!);
    expect(withRef!).toBeGreaterThan(near!);
  });

  it('no calza un pago registrado en otra cuenta', () => {
    expect(matchScore(line, { id: 'p', type: 'INCOME', amount: 1_190_000, paymentDate: line.date, referenceNumber: null, treasuryAccountId: 'acc_2' })).toBeNull();
  });
});
