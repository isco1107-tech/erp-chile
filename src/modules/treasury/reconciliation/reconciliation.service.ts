import 'server-only';

import crypto from 'crypto';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { BankStatementLine, BankStatementLineStatus, Payment, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { fingerprintLines, matchScore, parseBankStatement } from '@/lib/treasury/bank-statement';
import { postMoneyReclassification } from '@/modules/accounting/posting-rules/treasury-posting';
import { recordTreasuryMovement } from '../services/movements.service';
import { registerPurchasePaymentInTx, registerSalesPaymentInTx } from '../services/treasury.service';
import { STATEMENT_COUNTERPARTS, type StatementAction } from './schema';

/**
 * Conciliación bancaria: la cartola del banco contra lo registrado en
 * Tesorería. Cada línea de cartola termina enlazada a UN pago (existente o
 * creado desde la línea) o marcada como ignorada. Enlazar no cambia montos:
 * solo confirma que ese movimiento de Tesorería realmente pasó por el banco.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LINES = 5000;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const candidate = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => part.text).join('');
    if (candidate.text !== undefined) return String(candidate.text);
    if (candidate.result !== undefined) return cellText(candidate.result);
    return '';
  }
  return String(value).trim();
}

/** La cartola completa como grilla de texto, sin asumir dónde está el encabezado. */
async function readGrid(file: { name: string; buffer: Buffer }): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    // Muchas cartolas vienen en Latin-1: si el UTF-8 trae caracteres de
    // reemplazo, se relee como Latin-1 para no romper tildes y eñes.
    let text = file.buffer.toString('utf8');
    if (text.includes('�')) text = file.buffer.toString('latin1');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    return parsed.data.slice(0, MAX_LINES + 40).map((row) => row.map((cell) => String(cell ?? '').trim()));
  }
  if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('El archivo no contiene ninguna hoja');
    const grid: string[][] = [];
    const width = Math.min(sheet.columnCount, 30);
    for (let r = 1; r <= Math.min(sheet.rowCount, MAX_LINES + 40); r++) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= width; c++) values.push(cellText(row.getCell(c).value));
      grid.push(values);
    }
    return grid;
  }
  throw new Error('Formato no soportado: sube la cartola en .xlsx o .csv (en tu banco: "Descargar cartola en Excel")');
}

export interface ImportStatementResult {
  imported: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
  from: string | null;
  to: string | null;
}

export async function importStatement(
  companyId: string,
  treasuryAccountId: string,
  file: { name: string; size: number; buffer: Buffer }
): Promise<ImportStatementResult> {
  if (file.size === 0) throw new Error('El archivo está vacío');
  if (file.size > MAX_FILE_BYTES) throw new Error('La cartola supera los 5 MB: descárgala por un rango de fechas más corto');
  const account = await prisma.treasuryAccount.findFirst({ where: { id: treasuryAccountId, companyId }, select: { id: true } });
  if (!account) throw new Error('La cuenta no existe en tu empresa');

  const parsed = parseBankStatement(await readGrid(file));
  if (parsed.lines.length === 0) throw new Error('La cartola no tiene movimientos con fecha y monto reconocibles');
  if (parsed.lines.length > MAX_LINES) throw new Error(`La cartola tiene más de ${MAX_LINES} movimientos: impórtala por partes`);

  const fingerprints = fingerprintLines(parsed.lines, (text) => crypto.createHash('sha256').update(text).digest('hex'));
  const importBatchId = crypto.randomUUID();
  const result = await prisma.bankStatementLine.createMany({
    data: parsed.lines.map((line, index) => ({
      companyId,
      treasuryAccountId,
      date: new Date(`${line.date}T12:00:00Z`),
      description: line.description,
      reference: line.reference,
      amount: line.amount,
      balance: line.balance,
      fingerprint: fingerprints[index]!,
      importBatchId,
    })),
    skipDuplicates: true,
  });

  const dates = parsed.lines.map((line) => line.date).sort();
  return {
    imported: result.count,
    duplicates: parsed.lines.length - result.count,
    errors: parsed.errors.slice(0, 20),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

export interface Suggestion {
  kind: 'PAYMENT' | 'SALES_DOCUMENT' | 'PURCHASE_DOCUMENT';
  id: string;
  label: string;
  detail: string;
  score: number;
}

export type StatementLineRow = BankStatementLine & {
  payment: (Pick<Payment, 'id' | 'type' | 'amount' | 'paymentDate' | 'description' | 'referenceNumber' | 'source'> & { contact: { razonSocial: string } | null }) | null;
  suggestions: Suggestion[];
};

export interface OpenDocumentOption {
  id: string;
  label: string;
  pending: number;
}

export interface ReconciliationBoard {
  lines: StatementLineRow[];
  counts: Record<BankStatementLineStatus, number>;
  unmatchedAmount: { income: number; expense: number };
  lastBalance: number | null;
  /** Facturas por cobrar / por pagar, para registrar un abono parcial desde la cartola. */
  openReceivables: OpenDocumentOption[];
  openPayables: OpenDocumentOption[];
}

const DAY_MS = 86_400_000;

export async function getReconciliationBoard(companyId: string, treasuryAccountId: string, status: BankStatementLineStatus): Promise<ReconciliationBoard> {
  const account = await prisma.treasuryAccount.findFirst({ where: { id: treasuryAccountId, companyId }, select: { id: true } });
  if (!account) throw new Error('La cuenta no existe en tu empresa');

  const [lines, grouped, lastWithBalance] = await Promise.all([
    prisma.bankStatementLine.findMany({
      where: { companyId, treasuryAccountId, status },
      include: {
        payment: {
          select: { id: true, type: true, amount: true, paymentDate: true, description: true, referenceNumber: true, source: true, contact: { select: { razonSocial: true } } },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 400,
    }),
    prisma.bankStatementLine.groupBy({ by: ['status'], where: { companyId, treasuryAccountId }, _count: { _all: true } }),
    prisma.bankStatementLine.findFirst({ where: { companyId, treasuryAccountId, balance: { not: null } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { balance: true } }),
  ]);

  const counts: Record<BankStatementLineStatus, number> = { UNMATCHED: 0, MATCHED: 0, IGNORED: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;

  const unmatched = status === 'UNMATCHED' ? lines : [];
  const suggestions = unmatched.length > 0 ? await buildSuggestions(companyId, treasuryAccountId, unmatched) : new Map<string, Suggestion[]>();

  const [pendingTotals, receivables, payables] = await Promise.all([
    prisma.bankStatementLine.findMany({ where: { companyId, treasuryAccountId, status: 'UNMATCHED' }, select: { amount: true } }),
    status === 'UNMATCHED'
      ? prisma.salesDocument.findMany({
          where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { notIn: ['COTIZACION', 'GUIA_DESPACHO_52', 'NOTA_CREDITO_61'] } },
          select: { id: true, folio: true, totalAmount: true, paidAmount: true, contact: { select: { razonSocial: true } } },
          orderBy: { issueDate: 'desc' },
          take: 300,
        })
      : Promise.resolve([]),
    status === 'UNMATCHED'
      ? prisma.purchaseDocument.findMany({
          where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
          select: { id: true, folio: true, totalAmount: true, paidAmount: true, contact: { select: { razonSocial: true } } },
          orderBy: { issueDate: 'desc' },
          take: 300,
        })
      : Promise.resolve([]),
  ]);
  const toOption = (doc: { id: string; folio: number | string | null; totalAmount: number; paidAmount: number; contact: { razonSocial: string } }): OpenDocumentOption => ({
    id: doc.id,
    label: `N° ${doc.folio ?? '—'} · ${doc.contact.razonSocial}`,
    pending: doc.totalAmount - doc.paidAmount,
  });
  return {
    openReceivables: receivables.map(toOption),
    openPayables: payables.map(toOption),
    lines: lines.map((line) => ({ ...line, suggestions: suggestions.get(line.id) ?? [] })),
    counts,
    unmatchedAmount: {
      income: pendingTotals.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0),
      expense: pendingTotals.filter((l) => l.amount < 0).reduce((sum, l) => sum - l.amount, 0),
    },
    lastBalance: lastWithBalance?.balance ?? null,
  };
}

/**
 * Hasta 3 sugerencias por línea: pagos ya registrados que calzan (mismo
 * sentido, monto exacto, fecha cercana) y, si no hay, documentos por cobrar o
 * por pagar con ese mismo saldo pendiente.
 */
async function buildSuggestions(companyId: string, treasuryAccountId: string, lines: BankStatementLine[]): Promise<Map<string, Suggestion[]>> {
  const amounts = [...new Set(lines.map((line) => Math.abs(line.amount)))];
  const minDate = new Date(Math.min(...lines.map((l) => l.date.getTime())) - 7 * DAY_MS);
  const maxDate = new Date(Math.max(...lines.map((l) => l.date.getTime())) + 7 * DAY_MS);

  const [payments, receivables, payables] = await Promise.all([
    prisma.payment.findMany({
      where: { companyId, amount: { in: amounts }, paymentDate: { gte: minDate, lte: maxDate }, bankStatementLine: null, OR: [{ treasuryAccountId }, { treasuryAccountId: null }] },
      select: { id: true, type: true, amount: true, paymentDate: true, referenceNumber: true, treasuryAccountId: true, description: true, contact: { select: { razonSocial: true } }, salesDocument: { select: { folio: true } }, purchaseDocument: { select: { folio: true } } },
      take: 2000,
    }),
    prisma.salesDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' }, dteType: { notIn: ['COTIZACION', 'GUIA_DESPACHO_52', 'NOTA_CREDITO_61'] } },
      select: { id: true, folio: true, totalAmount: true, paidAmount: true, contact: { select: { razonSocial: true } } },
      take: 2000,
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, status: 'ISSUED', paymentStatus: { not: 'PAID' } },
      select: { id: true, folio: true, totalAmount: true, paidAmount: true, contact: { select: { razonSocial: true } } },
      take: 2000,
    }),
  ]);

  const result = new Map<string, Suggestion[]>();
  for (const line of lines) {
    const found: Suggestion[] = [];
    for (const payment of payments) {
      const score = matchScore({ amount: line.amount, date: line.date, reference: line.reference, description: line.description, treasuryAccountId }, payment);
      if (score === null) continue;
      const doc = payment.salesDocument ? `Venta N° ${payment.salesDocument.folio ?? '—'}` : payment.purchaseDocument ? `Compra N° ${payment.purchaseDocument.folio}` : (payment.description ?? 'Movimiento');
      found.push({
        kind: 'PAYMENT',
        id: payment.id,
        label: `${doc}${payment.contact ? ` · ${payment.contact.razonSocial}` : ''}`,
        detail: `Registrado el ${payment.paymentDate.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`,
        score,
      });
    }
    if (found.length === 0) {
      const pending = Math.abs(line.amount);
      const docs = line.amount > 0 ? receivables : payables;
      for (const doc of docs) {
        if (doc.totalAmount - doc.paidAmount !== pending) continue;
        found.push({
          kind: line.amount > 0 ? 'SALES_DOCUMENT' : 'PURCHASE_DOCUMENT',
          id: doc.id,
          label: `${line.amount > 0 ? 'Cobrar factura' : 'Pagar factura'} N° ${doc.folio ?? '—'} · ${doc.contact.razonSocial}`,
          detail: 'Saldo pendiente exacto',
          score: 30,
        });
      }
    }
    result.set(line.id, found.sort((a, b) => b.score - a.score).slice(0, 3));
  }
  return result;
}

async function lockLine(tx: Prisma.TransactionClient, companyId: string, lineId: string): Promise<BankStatementLine> {
  await tx.$queryRaw`SELECT id FROM "BankStatementLine" WHERE id = ${lineId} AND "companyId" = ${companyId} FOR UPDATE`;
  const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } });
  if (!line) throw new Error('El movimiento de cartola no existe');
  return line;
}

/**
 * Aplica una decisión sobre una línea de cartola. Todo ocurre en una
 * transacción con lock sobre la línea: dos personas conciliando a la vez no
 * pueden enlazar la misma línea a dos pagos ni crear el cobro dos veces.
 * Devuelve el pago creado (si se creó uno) para disparar automatizaciones.
 */
export async function applyStatementAction(companyId: string, lineId: string, action: StatementAction, userId: string): Promise<Payment | null> {
  return prisma.$transaction(async (tx) => {
    const line = await lockLine(tx, companyId, lineId);
    const direction = line.amount > 0 ? 'INCOME' : 'EXPENSE';
    const amount = Math.abs(line.amount);

    if (action.kind === 'UNDO') {
      await tx.bankStatementLine.updateMany({ where: { id: line.id, companyId }, data: { status: 'UNMATCHED', paymentId: null, matchedAt: null, matchedByUserId: null } });
      return null;
    }
    if (line.status !== 'UNMATCHED') throw new Error('Este movimiento ya fue conciliado o ignorado');

    if (action.kind === 'IGNORE') {
      await tx.bankStatementLine.updateMany({ where: { id: line.id, companyId }, data: { status: 'IGNORED', matchedAt: new Date(), matchedByUserId: userId } });
      return null;
    }

    let payment: Payment;
    let created = true;
    const moneyData = {
      amount,
      paymentMethod: 'TRANSFERENCIA' as const,
      paymentDate: line.date.toISOString(),
      referenceNumber: line.reference ?? undefined,
      treasuryAccountId: line.treasuryAccountId,
      notes: `Conciliado desde cartola: ${line.description}`.slice(0, 300),
    };

    if (action.kind === 'MATCH') {
      created = false;
      const existing = await tx.payment.findFirst({ where: { id: action.paymentId, companyId }, include: { bankStatementLine: { select: { id: true } } } });
      if (!existing) throw new Error('El movimiento de Tesorería no existe');
      if (existing.bankStatementLine) throw new Error('Ese movimiento de Tesorería ya está conciliado con otra línea');
      if (existing.type !== direction || existing.amount !== amount) throw new Error('El monto o el sentido no coinciden con la cartola');
      if (existing.treasuryAccountId && existing.treasuryAccountId !== line.treasuryAccountId) throw new Error('Ese movimiento está registrado en otra cuenta');
      if (!existing.treasuryAccountId) {
        // Si la cuenta de la cartola tiene otra cuenta contable que la que
        // se usó al registrar el pago, el asiento se corrige con un traspaso.
        await postMoneyReclassification(tx, companyId, existing, line.treasuryAccountId, { createdByUserId: userId });
        await tx.payment.updateMany({ where: { id: existing.id, companyId }, data: { treasuryAccountId: line.treasuryAccountId } });
      }
      payment = existing;
    } else if (action.kind === 'SALES_DOCUMENT') {
      if (direction !== 'INCOME') throw new Error('Un cargo en la cartola no puede ser el cobro de una venta');
      payment = await registerSalesPaymentInTx(tx, companyId, action.salesDocumentId, moneyData);
    } else if (action.kind === 'PURCHASE_DOCUMENT') {
      if (direction !== 'EXPENSE') throw new Error('Un abono en la cartola no puede ser el pago de una compra');
      payment = await registerPurchasePaymentInTx(tx, companyId, action.purchaseDocumentId, moneyData);
    } else {
      const counterpart = STATEMENT_COUNTERPARTS[action.counterpart];
      if (counterpart.direction !== direction) throw new Error(`"${counterpart.label}" no corresponde a un ${direction === 'INCOME' ? 'abono' : 'cargo'}`);
      payment = await recordTreasuryMovement(tx, {
        companyId,
        direction,
        amount,
        method: 'TRANSFERENCIA',
        date: line.date,
        source: 'BANK_STATEMENT',
        sourceId: line.id,
        description: (action.description || line.description).slice(0, 200),
        counterpartKey: action.counterpart,
        treasuryAccountId: line.treasuryAccountId,
        referenceNumber: line.reference,
        createdByUserId: userId,
      });
    }

    await tx.bankStatementLine.updateMany({
      where: { id: line.id, companyId },
      data: { status: 'MATCHED', paymentId: payment.id, matchedAt: new Date(), matchedByUserId: userId },
    });
    return created ? payment : null;
  }, LOCKING_TX_OPTIONS);
}

/**
 * Concilia de una vez todas las líneas pendientes cuya mejor sugerencia es un
 * pago ya registrado con calce claro (monto exacto, fecha ±2 días). No crea
 * pagos nuevos: solo enlaza lo que ya existía.
 */
export async function autoMatch(companyId: string, treasuryAccountId: string, userId: string): Promise<number> {
  const board = await getReconciliationBoard(companyId, treasuryAccountId, 'UNMATCHED');
  const usedPayments = new Set<string>();
  let matched = 0;
  for (const line of board.lines) {
    const best = line.suggestions[0];
    // 50 base + (7 - días) * 5 ≥ 75 ⇔ días ≤ 2.
    if (!best || best.kind !== 'PAYMENT' || best.score < 75 || usedPayments.has(best.id)) continue;
    const second = line.suggestions[1];
    if (second && second.kind === 'PAYMENT' && second.score === best.score) continue; // ambiguo: que decida una persona
    try {
      await applyStatementAction(companyId, line.id, { kind: 'MATCH', paymentId: best.id }, userId);
      usedPayments.add(best.id);
      matched++;
    } catch {
      // Otra persona lo concilió entre medio: se sigue con el resto.
    }
  }
  return matched;
}
