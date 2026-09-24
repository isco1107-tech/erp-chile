/**
 * Lector de cartolas bancarias (puro, sin base de datos ni archivos).
 *
 * Las cartolas de los bancos chilenos (BancoEstado, Chile, Santander, BCI,
 * Itaú, Scotiabank…) exportadas a Excel/CSV comparten la idea pero no el
 * formato: traen filas de encabezado con el nombre del banco y la cuenta
 * antes de la tabla, algunas usan columnas separadas de Cargos/Abonos y otras
 * un Monto con signo, y las fechas vienen como dd/mm/aaaa o como fecha de
 * Excel. Este módulo busca la fila de títulos, identifica las columnas por
 * sus nombres habituales y devuelve movimientos normalizados: monto entero
 * en pesos, positivo si es abono y negativo si es cargo.
 */

export interface ParsedStatementLine {
  /** Fila original (1-based) para reportar errores. */
  row: number;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  reference: string | null;
  /** CLP entero: positivo = abono (entra dinero), negativo = cargo (sale). */
  amount: number;
  balance: number | null;
}

export interface StatementParseResult {
  lines: ParsedStatementLine[];
  errors: Array<{ row: number; message: string }>;
  headerRow: number;
  columns: Partial<Record<StatementColumn, number>>;
}

export type StatementColumn = 'date' | 'description' | 'reference' | 'debit' | 'credit' | 'amount' | 'balance';

function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[()$°º.:#_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES: Record<StatementColumn, string[]> = {
  date: ['fecha', 'fecha movimiento', 'fecha operacion', 'fecha contable', 'fecha transaccion', 'fec', 'dia', 'date'],
  description: ['descripcion', 'detalle', 'glosa', 'descripcion movimiento', 'concepto', 'movimiento', 'descripcion operacion', 'transaccion', 'description'],
  reference: ['n documento', 'nro documento', 'numero documento', 'documento', 'n doc', 'nro doc', 'referencia', 'n operacion', 'nro operacion', 'serial', 'n comprobante', 'comprobante'],
  debit: ['cargo', 'cargos', 'debe', 'giros', 'egresos', 'monto cargo', 'debito', 'debitos', 'cheques y otros cargos', 'cargos pesos'],
  credit: ['abono', 'abonos', 'haber', 'depositos', 'ingresos', 'monto abono', 'credito', 'creditos', 'depositos y otros abonos', 'abonos pesos'],
  amount: ['monto', 'importe', 'amount', 'monto pesos', 'valor'],
  balance: ['saldo', 'saldo disponible', 'saldo contable', 'saldo diario', 'balance', 'saldo pesos'],
};

/** Columna a la que corresponde un encabezado, si alguna. Coincidencia exacta primero, luego por prefijo. */
function columnFor(header: string): StatementColumn | null {
  const value = normalize(header);
  if (!value) return null;
  for (const [column, aliases] of Object.entries(ALIASES) as Array<[StatementColumn, string[]]>) {
    if (aliases.includes(value)) return column;
  }
  for (const [column, aliases] of Object.entries(ALIASES) as Array<[StatementColumn, string[]]>) {
    if (aliases.some((alias) => value.startsWith(`${alias} `))) return column;
  }
  return null;
}

/** Monto chileno: "$1.250.000", "-15.000", "1.250,50", "(15.000)". Entero en pesos o `null`. */
export function parseStatementAmount(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[$\sCLP]/gi, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(text)) return null;
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    // Ambos separadores: el último es el decimal ("1.250,50" o "1,250.50").
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = text.split(thousands).join('').replace(decimal, '.');
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ',';
    const groups = text.split(separator);
    // Grupos de 3 dígitos después del primero = separador de miles ("1.250.000", "15,000").
    const isThousands = groups.length > 1 && groups.slice(1).every((group) => group.length === 3) && groups[0]!.length >= 1 && groups[0]!.length <= 3;
    normalized = isThousands ? groups.join('') : groups.length === 2 ? `${groups[0]}.${groups[1]}` : text.split(separator).join('');
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(negative ? -value : value);
}

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Fecha de cartola a YYYY-MM-DD: "05/09/2026", "5-9-26", "2026-09-05", número de serie de Excel. */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isValidDate(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    return isValidDate(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  // Número de serie de Excel (días desde 1899-12-30), cuando la celda llega como número.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

/** Fila de títulos: la primera (de las 30 primeras) con fecha y algún monto reconocibles. */
function findHeaderRow(grid: string[][]): { index: number; columns: Partial<Record<StatementColumn, number>> } | null {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const columns: Partial<Record<StatementColumn, number>> = {};
    grid[i]!.forEach((cell, index) => {
      const column = columnFor(cell);
      if (column && columns[column] === undefined) columns[column] = index;
    });
    const hasMoney = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
    if (columns.date !== undefined && hasMoney) return { index: i, columns };
  }
  return null;
}

export function parseBankStatement(grid: string[][]): StatementParseResult {
  const header = findHeaderRow(grid);
  if (!header) {
    throw new Error('No encontré la tabla de movimientos: la cartola debe tener columnas de Fecha y de Monto (o Cargos/Abonos)');
  }
  const { index, columns } = header;
  const lines: ParsedStatementLine[] = [];
  const errors: StatementParseResult['errors'] = [];
  const cell = (row: string[], column: StatementColumn) => (columns[column] === undefined ? '' : (row[columns[column]!] ?? '').trim());

  for (let r = index + 1; r < grid.length; r++) {
    const row = grid[r]!;
    if (row.every((value) => !value || !value.trim())) continue;
    const rawDate = cell(row, 'date');
    const date = parseStatementDate(rawDate);
    // Filas de subtotal/saldo al pie ("Saldo final", "Total cargos") no tienen fecha: se omiten sin error.
    if (!date) {
      if (rawDate) errors.push({ row: r + 1, message: `Fecha no reconocida: "${rawDate}"` });
      continue;
    }

    let amount: number | null = null;
    if (columns.debit !== undefined || columns.credit !== undefined) {
      const debit = parseStatementAmount(cell(row, 'debit')) ?? 0;
      const credit = parseStatementAmount(cell(row, 'credit')) ?? 0;
      amount = Math.abs(credit) - Math.abs(debit);
      if (debit === 0 && credit === 0) amount = parseStatementAmount(cell(row, 'amount'));
    } else {
      amount = parseStatementAmount(cell(row, 'amount'));
    }
    if (amount === null || amount === 0) {
      errors.push({ row: r + 1, message: 'Sin monto o monto en cero' });
      continue;
    }

    const description = cell(row, 'description') || 'Movimiento sin glosa';
    const reference = cell(row, 'reference') || null;
    lines.push({
      row: r + 1,
      date,
      description: description.slice(0, 300),
      reference: reference ? reference.slice(0, 120) : null,
      amount,
      balance: parseStatementAmount(cell(row, 'balance')),
    });
  }
  return { lines, errors, headerRow: index + 1, columns };
}

/**
 * Huella de cada movimiento para no importarlo dos veces. Incluye el número
 * de repetición dentro del archivo: dos cargos idénticos el mismo día (dos
 * comisiones iguales) son movimientos distintos y ambos deben entrar.
 */
export function fingerprintLines(lines: ParsedStatementLine[], hash: (text: string) => string): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.date}|${line.amount}|${normalize(line.description)}|${line.reference ?? ''}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return hash(`${base}|${occurrence}`);
  });
}

export interface MatchCandidate {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  paymentDate: Date;
  referenceNumber: string | null;
  treasuryAccountId: string | null;
}

/**
 * Puntaje de calce entre un movimiento de cartola y un pago de Tesorería:
 * mismo sentido y monto exacto son obligatorios; luego suma por cercanía de
 * fecha, referencia coincidente y misma cuenta. `null` = no calza.
 */
export function matchScore(
  line: { amount: number; date: Date; reference: string | null; description: string; treasuryAccountId: string },
  payment: MatchCandidate,
  maxDays = 7
): number | null {
  const direction = line.amount > 0 ? 'INCOME' : 'EXPENSE';
  if (payment.type !== direction || payment.amount !== Math.abs(line.amount)) return null;
  const days = Math.abs(payment.paymentDate.getTime() - line.date.getTime()) / 86_400_000;
  if (days > maxDays) return null;
  if (payment.treasuryAccountId && payment.treasuryAccountId !== line.treasuryAccountId) return null;
  let score = 50 + Math.round((maxDays - days) * 5);
  const ref = payment.referenceNumber?.replace(/\D/g, '') ?? '';
  if (ref.length >= 3 && ((line.reference ?? '').replace(/\D/g, '').includes(ref) || line.description.replace(/\D/g, '').includes(ref))) score += 40;
  if (payment.treasuryAccountId === line.treasuryAccountId) score += 10;
  return score;
}
