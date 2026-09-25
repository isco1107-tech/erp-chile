/**
 * Conciliación bancaria como funciones puras: sugerir qué cobro/pago del
 * sistema corresponde a cada movimiento de la cartola, conciliar solo lo
 * inequívoco, y armar la cuadratura clásica "saldo según banco → saldo según
 * libros".
 */

export interface ReconLine {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  description: string;
  reference: string | null;
}

export interface ReconPayment {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Con signo: + cobro (INCOME), − pago (EXPENSE). */
  amount: number;
  referenceNumber: string | null;
  contactName: string;
  /** Un cheque puede cobrarse semanas después de registrado. */
  isCheque: boolean;
}

export interface MatchSuggestion {
  paymentId: string;
  score: number;
  reasons: string[];
}

const DAY_MS = 86_400_000;

function dayDiff(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

/** Palabras significativas de un nombre (sin sufijos societarios). */
function nameTokens(name: string): string[] {
  const stop = new Set(['SPA', 'LTDA', 'LIMITADA', 'SA', 'EIRL', 'Y', 'DE', 'DEL', 'LA', 'LOS', 'LAS', 'CIA', 'COMERCIAL', 'SOCIEDAD']);
  return normalize(name)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

/** Puntaje de un pago candidato para un movimiento. Monto exacto y mismo signo son obligatorios. */
export function scoreMatch(line: ReconLine, payment: ReconPayment): MatchSuggestion | null {
  if (line.amount !== payment.amount) return null;
  const days = dayDiff(line.date, payment.date);
  const window = payment.isCheque ? 45 : 10;
  if (days > window) return null;

  const reasons: string[] = ['Mismo monto'];
  let score = 40;
  if (days === 0) {
    score += 30;
    reasons.push('Misma fecha');
  } else if (days <= 2) {
    score += 22;
    reasons.push(`${days} ${days === 1 ? 'día' : 'días'} de diferencia`);
  } else if (days <= 5) {
    score += 12;
    reasons.push(`${days} días de diferencia`);
  } else {
    score += 4;
    reasons.push(`${days} días de diferencia`);
  }

  const haystack = normalize(`${line.description} ${line.reference ?? ''}`);
  const ref = (payment.referenceNumber ?? '').replace(/\D/g, '');
  const digitGroups = haystack.replace(/\D/g, ' ').split(/\s+/);
  if (ref.length >= 3 && digitGroups.some((digits) => (digits.length >= ref.length && digits.endsWith(ref)) || (digits.length >= 5 && ref.endsWith(digits)))) {
    score += 25;
    reasons.push('Coincide la referencia');
  }
  const tokens = nameTokens(payment.contactName);
  if (tokens.length > 0 && tokens.some((token) => haystack.includes(token))) {
    score += 15;
    reasons.push('Menciona al cliente/proveedor');
  }
  return { paymentId: payment.id, score: Math.min(score, 100), reasons };
}

export function suggestMatches(line: ReconLine, payments: readonly ReconPayment[], limit = 5): MatchSuggestion[] {
  return payments
    .map((payment) => scoreMatch(line, payment))
    .filter((suggestion): suggestion is MatchSuggestion => suggestion !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Umbral de confianza para conciliar sin preguntar. */
export const AUTO_MATCH_MIN_SCORE = 62;

/**
 * Concilia automáticamente solo lo inequívoco: el mejor candidato supera el
 * umbral y le saca al segundo al menos 15 puntos. Cada pago se usa una vez;
 * se resuelven primero los pares de mayor puntaje.
 */
export function autoMatch(lines: readonly ReconLine[], payments: readonly ReconPayment[]): Array<{ lineId: string; paymentId: string; score: number }> {
  const candidates: Array<{ lineId: string; paymentId: string; score: number; margin: number }> = [];
  for (const line of lines) {
    const suggestions = suggestMatches(line, payments, 2);
    const best = suggestions[0];
    if (!best || best.score < AUTO_MATCH_MIN_SCORE) continue;
    const margin = best.score - (suggestions[1]?.score ?? 0);
    if (margin < 15) continue;
    candidates.push({ lineId: line.id, paymentId: best.paymentId, score: best.score, margin });
  }
  candidates.sort((a, b) => b.score - a.score || b.margin - a.margin);
  const usedPayments = new Set<string>();
  const usedLines = new Set<string>();
  const result: Array<{ lineId: string; paymentId: string; score: number }> = [];
  for (const candidate of candidates) {
    if (usedPayments.has(candidate.paymentId) || usedLines.has(candidate.lineId)) continue;
    usedPayments.add(candidate.paymentId);
    usedLines.add(candidate.lineId);
    result.push({ lineId: candidate.lineId, paymentId: candidate.paymentId, score: candidate.score });
  }
  return result;
}

export interface ReconciliationSummary {
  /** Saldo inicial + todos los movimientos importados. */
  bankBalance: number;
  /** Saldo inicial + cobros − pagos registrados en esta cuenta. */
  bookBalance: number;
  /** Cobros registrados que el banco aún no muestra (depósitos en tránsito). */
  depositsInTransit: number;
  /** Pagos registrados que el banco aún no muestra (cheques girados no cobrados, etc.). */
  outstandingPayments: number;
  /** Movimientos del banco sin registro en libros (abonos + cargos, con signo). */
  unrecordedBankMovements: number;
  /** Debe ser 0: banco + tránsito − pendientes − no registrados = libros. */
  difference: number;
}

/**
 * Cuadratura clásica. `payments` son los de la cuenta (con signo) marcando si
 * ya están conciliados; `lines` los movimientos con su estado.
 */
export function reconciliationSummary(input: {
  openingBalance: number;
  lines: ReadonlyArray<{ amount: number; status: 'UNMATCHED' | 'MATCHED' | 'IGNORED' }>;
  payments: ReadonlyArray<{ amount: number; reconciled: boolean }>;
}): ReconciliationSummary {
  const bankBalance = input.openingBalance + input.lines.reduce((sum, line) => sum + line.amount, 0);
  const bookBalance = input.openingBalance + input.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const depositsInTransit = input.payments.filter((p) => !p.reconciled && p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
  const outstandingPayments = input.payments.filter((p) => !p.reconciled && p.amount < 0).reduce((sum, p) => sum - p.amount, 0);
  const unrecordedBankMovements = input.lines.filter((line) => line.status !== 'MATCHED').reduce((sum, line) => sum + line.amount, 0);
  const expectedBook = bankBalance + depositsInTransit - outstandingPayments - unrecordedBankMovements;
  return {
    bankBalance,
    bookBalance,
    depositsInTransit,
    outstandingPayments,
    unrecordedBankMovements,
    difference: bookBalance - expectedBook,
  };
}
