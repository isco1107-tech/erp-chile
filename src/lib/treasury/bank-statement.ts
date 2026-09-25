/**
 * Lectura de cartolas bancarias como funciones puras. Cada banco exporta su
 * propio formato (BancoEstado, Santander, BCI, Chile, Itaú…): un preámbulo con
 * los datos de la cuenta, una fila de encabezados y los movimientos, con cargos
 * y abonos en columnas separadas o en una sola columna con signo. En vez de un
 * parser por banco, se detecta la fila de encabezados y el rol de cada columna
 * por su nombre.
 */

export interface ParsedStatementLine {
  /** Fecha calendario YYYY-MM-DD. */
  date: string;
  description: string;
  reference: string | null;
  /** CLP entero con signo: + abono, − cargo. */
  amount: number;
  balance: number | null;
}

export interface StatementColumns {
  headerRow: number;
  date: number;
  description: number | null;
  reference: number | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  /** Columna "Cargo/Abono" cuando el monto viene sin signo. */
  kind: number | null;
  balance: number | null;
}

export interface ParseStatementResult {
  lines: ParsedStatementLine[];
  columns: StatementColumns;
  /** Filas descartadas (sin fecha válida o sin monto: saldos, totales, líneas en blanco). */
  skipped: number;
}

function key(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const DATE_HEADERS = ['fecha', 'fecha operacion', 'fecha contable', 'fecha movimiento', 'fecha transaccion', 'fec', 'date'];
const DESCRIPTION_HEADERS = ['descripcion', 'glosa', 'detalle', 'movimiento', 'concepto', 'descripcion movimiento', 'descripcion operacion', 'transaccion', 'description'];
const REFERENCE_HEADERS = ['n documento', 'nro documento', 'numero documento', 'documento', 'n operacion', 'nro operacion', 'numero operacion', 'referencia', 'serial', 'n doc', 'no documento', 'num documento', 'folio'];
const DEBIT_HEADERS = ['cargo', 'cargos', 'debito', 'debitos', 'giro', 'giros', 'retiro', 'retiros', 'cheques y otros cargos', 'cargos clp', 'monto cargo'];
const CREDIT_HEADERS = ['abono', 'abonos', 'credito', 'creditos', 'deposito', 'depositos', 'depositos y otros abonos', 'abonos clp', 'monto abono'];
const AMOUNT_HEADERS = ['monto', 'importe', 'monto clp', 'valor', 'amount'];
const KIND_HEADERS = ['tipo', 'tipo movimiento', 'cargo abono', 'c a', 'd c', 'tipo transaccion'];
const BALANCE_HEADERS = ['saldo', 'saldo diario', 'saldo contable', 'saldo disponible', 'saldo clp', 'balance'];

function findColumn(headers: readonly string[], candidates: readonly string[]): number | null {
  // Primero igualdad exacta; después "empieza con" (ej. "cargos ($)").
  const exact = headers.findIndex((header) => candidates.includes(header));
  if (exact >= 0) return exact;
  const prefix = headers.findIndex((header) => header !== '' && candidates.some((candidate) => header.startsWith(`${candidate} `)));
  return prefix >= 0 ? prefix : null;
}

/** Detecta la fila de encabezados entre las primeras 40 filas del archivo. */
export function detectColumns(rows: readonly (readonly string[])[]): StatementColumns | null {
  const limit = Math.min(rows.length, 40);
  for (let index = 0; index < limit; index += 1) {
    const headers = (rows[index] ?? []).map((cell) => key(cell ?? ''));
    const date = findColumn(headers, DATE_HEADERS);
    if (date === null) continue;
    const debit = findColumn(headers, DEBIT_HEADERS);
    const credit = findColumn(headers, CREDIT_HEADERS);
    const amount = findColumn(headers, AMOUNT_HEADERS);
    if (amount === null && (debit === null || credit === null)) continue;
    return {
      headerRow: index,
      date,
      description: findColumn(headers, DESCRIPTION_HEADERS),
      reference: findColumn(headers, REFERENCE_HEADERS),
      debit,
      credit,
      amount: debit !== null && credit !== null ? null : amount,
      kind: debit !== null && credit !== null ? null : findColumn(headers, KIND_HEADERS),
      balance: findColumn(headers, BALANCE_HEADERS),
    };
  }
  return null;
}

/**
 * Monto chileno a entero: "$ 1.234.567", "-1.234", "(1.234)", "1.234,50",
 * "1234567" o un número de Excel ("1234.5"). `null` si la celda está vacía o
 * no es un monto.
 */
export function parseClpAmount(raw: string | null | undefined): number | null {
  let value = (raw ?? '').trim();
  if (!value || value === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/\$|clp|\s/gi, '');
  if (value.startsWith('-')) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.endsWith('-')) {
    negative = !negative;
    value = value.slice(0, -1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  if (!/^[\d.,]+$/.test(value)) return null;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastComma > lastDot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, '') : value;
  } else if (lastComma >= 0) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, '') : value.replace(',', '.');
  } else {
    normalized = value;
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  return negative ? -rounded : rounded;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Fecha de cartola a YYYY-MM-DD: "15/09/2026", "15-09-26", "2026-09-15",
 * "15/09" (sin año: se toma el de `reference`, o el anterior si el mes aún no
 * llega) o "15.09.2026".
 */
export function parseStatementDate(raw: string | null | undefined, reference: Date = new Date()): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(value);
  if (match) {
    const year = match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{1,2})[/.-](\d{1,2})$/.exec(value);
  if (match) {
    const month = Number(match[2]);
    const refYear = reference.getUTCFullYear();
    const year = month > reference.getUTCMonth() + 1 ? refYear - 1 : refYear;
    return validDate(year, month, Number(match[1]));
  }
  return null;
}

/** Signo según la columna de tipo: cargo/débito/giro resta; abono/crédito/depósito suma. */
function kindSign(raw: string): 1 | -1 | null {
  const value = key(raw);
  if (!value) return null;
  if (/^(cargo|deb|giro|retiro|c$|d$)/.test(value)) return -1;
  if (/^(abono|cred|dep|a$)/.test(value)) return 1;
  return null;
}

export function parseStatement(rows: readonly (readonly string[])[], reference: Date = new Date()): ParseStatementResult {
  const columns = detectColumns(rows);
  if (!columns) {
    throw new Error('No se reconocen las columnas de la cartola: se necesita una columna de fecha y una de monto (o de cargos y abonos)');
  }
  const lines: ParsedStatementLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(columns.headerRow + 1)) {
    const cell = (index: number | null) => (index === null ? '' : (row[index] ?? '').trim());
    const date = parseStatementDate(cell(columns.date), reference);
    let amount: number | null;
    if (columns.amount !== null) {
      amount = parseClpAmount(cell(columns.amount));
      const sign = columns.kind === null ? null : kindSign(cell(columns.kind));
      if (amount !== null && sign !== null) amount = sign * Math.abs(amount);
    } else {
      const debit = parseClpAmount(cell(columns.debit));
      const credit = parseClpAmount(cell(columns.credit));
      amount = debit === null && credit === null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date || amount === null || amount === 0) {
      if (row.some((value) => (value ?? '').trim() !== '')) skipped += 1;
      continue;
    }
    const description = cell(columns.description).replace(/\s+/g, ' ') || 'Movimiento sin descripción';
    lines.push({
      date,
      description: description.slice(0, 300),
      reference: cell(columns.reference).slice(0, 80) || null,
      amount,
      balance: columns.balance === null ? null : parseClpAmount(cell(columns.balance)),
    });
  }
  return { lines, columns, skipped };
}

/**
 * Clave estable de un movimiento para no duplicarlo al reimportar una cartola
 * que se traslapa con otra. Dos movimientos idénticos el mismo día (dos
 * transferencias iguales) se distinguen por su orden de aparición.
 */
export function lineFingerprints(lines: readonly ParsedStatementLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = [line.date, line.amount, key(line.description), (line.reference ?? '').trim()].join('|');
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return `${base}|${occurrence}`;
  });
}
