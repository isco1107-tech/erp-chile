import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { BankAccount, BankLineStatus, DteType, PaymentMethodType, Prisma, PurchaseDocumentType } from '@prisma/client';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { lineFingerprints, parseStatement } from '@/lib/treasury/bank-statement';
import {
  autoMatch,
  reconciliationSummary,
  suggestMatches,
  type MatchSuggestion,
  type ReconciliationSummary,
  type ReconLine,
  type ReconPayment,
} from '@/lib/treasury/reconciliation';
import { registerPurchasePayment, registerSalesPayment } from './treasury.service';

const MAX_STATEMENT_ROWS = 5000;

// ─── Cuentas bancarias ───────────────────────────────────────────────────────

export interface BankAccountInput {
  name: string;
  bankCode: string;
  accountType: string;
  accountNumber: string;
  openingBalance: number;
  openingDate?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface BankAccountRow extends BankAccount {
  bookBalance: number;
  bankBalance: number;
  unmatchedLines: number;
  lastStatementDate: Date | null;
}

function dateOnly(value: string | undefined): Date | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
}

function signed(type: 'INCOME' | 'EXPENSE', amount: number): number {
  return type === 'INCOME' ? amount : -amount;
}

export async function listBankAccounts(companyId: string, options: { includeInactive?: boolean } = {}): Promise<BankAccountRow[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { companyId, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  if (accounts.length === 0) return [];
  // Mismo criterio que la cuadratura: solo desde la fecha en que se empieza a
  // conciliar. Son pocas cuentas, así que se agrega cuenta por cuenta.
  return Promise.all(
    accounts.map(async (account) => {
      const since = account.openingDate;
      const [payments, lines, unmatched, last] = await Promise.all([
        prisma.payment.groupBy({
          by: ['type'],
          where: { companyId, bankAccountId: account.id, ...(since ? { paymentDate: { gte: since } } : {}) },
          _sum: { amount: true },
        }),
        prisma.bankStatementLine.aggregate({ where: { companyId, bankAccountId: account.id, ...(since ? { date: { gte: since } } : {}) }, _sum: { amount: true } }),
        prisma.bankStatementLine.count({ where: { companyId, bankAccountId: account.id, status: 'UNMATCHED', ...(since ? { date: { gte: since } } : {}) } }),
        prisma.bankStatementLine.aggregate({ where: { companyId, bankAccountId: account.id }, _max: { date: true } }),
      ]);
      const book = payments.reduce((sum, row) => sum + signed(row.type, row._sum.amount ?? 0), 0);
      return {
        ...account,
        bookBalance: account.openingBalance + book,
        bankBalance: account.openingBalance + (lines._sum.amount ?? 0),
        unmatchedLines: unmatched,
        lastStatementDate: last._max.date ?? null,
      };
    })
  );
}

export async function createBankAccount(companyId: string, input: BankAccountInput): Promise<BankAccount> {
  return prisma.$transaction(async (tx) => {
    const count = await tx.bankAccount.count({ where: { companyId } });
    const isDefault = input.isDefault || count === 0;
    if (isDefault) await tx.bankAccount.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
    return tx.bankAccount.create({
      data: {
        companyId,
        name: input.name,
        bankCode: input.bankCode,
        accountType: input.accountType,
        accountNumber: input.accountNumber,
        openingBalance: input.openingBalance,
        openingDate: dateOnly(input.openingDate),
        isDefault,
        isActive: input.isActive ?? true,
      },
    });
  });
}

export async function updateBankAccount(companyId: string, id: string, input: BankAccountInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.bankAccount.updateMany({ where: { companyId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const result = await tx.bankAccount.updateMany({
      where: { id, companyId },
      data: {
        name: input.name,
        bankCode: input.bankCode,
        accountType: input.accountType,
        accountNumber: input.accountNumber,
        openingBalance: input.openingBalance,
        openingDate: dateOnly(input.openingDate),
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
      },
    });
    if (result.count === 0) throw new Error('Cuenta bancaria no encontrada');
  });
}

// ─── Importación de cartolas ─────────────────────────────────────────────────

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

/** Todas las filas del archivo, incluido el preámbulo que los bancos ponen antes de los encabezados. */
export async function readStatementGrid(file: { name: string; buffer: Buffer }): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('El archivo no contiene ninguna hoja');
    const rows: string[][] = [];
    const lastRow = Math.min(sheet.rowCount, MAX_STATEMENT_ROWS + 40);
    for (let r = 1; r <= lastRow; r += 1) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c += 1) values.push(cellText(row.getCell(c).value));
      rows.push(values);
    }
    return rows;
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    // Varios bancos exportan en Latin-1: si no es UTF-8 válido, se relee así.
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      text = new TextDecoder('latin1').decode(file.buffer);
    }
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimiter: '' });
    return parsed.data.slice(0, MAX_STATEMENT_ROWS + 40).map((row) => row.map((cell) => String(cell ?? '').trim()));
  }
  throw new Error('Formato no soportado. Sube la cartola en .xlsx o .csv (desde el portal de tu banco)');
}

function fingerprintHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 40);
}

export interface ImportStatementResult {
  statementId: string;
  imported: number;
  duplicates: number;
  skipped: number;
  autoMatched: number;
}

export async function importStatement(
  companyId: string,
  userId: string,
  bankAccountId: string,
  file: { name: string; buffer: Buffer }
): Promise<ImportStatementResult> {
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: { id: true } });
  if (!account) throw new Error('Cuenta bancaria no encontrada');

  const grid = await readStatementGrid(file);
  const { lines, skipped } = parseStatement(grid);
  if (lines.length === 0) throw new Error('La cartola no tiene movimientos reconocibles');
  if (lines.length > MAX_STATEMENT_ROWS) throw new Error(`La cartola tiene más de ${MAX_STATEMENT_ROWS} movimientos: impórtala por meses`);

  const fingerprints = lineFingerprints(lines).map(fingerprintHash);
  const existing = await prisma.bankStatementLine.findMany({
    where: { bankAccountId, fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const known = new Set(existing.map((row) => row.fingerprint));
  const fresh = lines.map((line, index) => ({ line, fingerprint: fingerprints[index]! })).filter((row) => !known.has(row.fingerprint));
  const dates = lines.map((line) => line.date).sort();

  const statement = await prisma.$transaction(async (tx) => {
    const created = await tx.bankStatement.create({
      data: {
        companyId,
        bankAccountId,
        fileName: file.name.slice(0, 200),
        periodStart: dates[0] ? new Date(`${dates[0]}T12:00:00Z`) : null,
        periodEnd: dates.length ? new Date(`${dates[dates.length - 1]}T12:00:00Z`) : null,
        importedLines: fresh.length,
        skippedLines: skipped,
        importedById: userId,
      },
    });
    if (fresh.length > 0) {
      await tx.bankStatementLine.createMany({
        data: fresh.map(({ line, fingerprint }) => ({
          companyId,
          bankAccountId,
          statementId: created.id,
          date: new Date(`${line.date}T12:00:00Z`),
          description: line.description,
          reference: line.reference,
          amount: line.amount,
          balance: line.balance,
          fingerprint,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  }, LOCKING_TX_OPTIONS);

  const autoMatched = fresh.length > 0 ? await runAutoMatch(companyId, bankAccountId, userId) : 0;
  return { statementId: statement.id, imported: fresh.length, duplicates: lines.length - fresh.length, skipped, autoMatched };
}

// ─── Conciliación ────────────────────────────────────────────────────────────

const CANDIDATE_METHODS: PaymentMethodType[] = ['TRANSFERENCIA', 'CHEQUE', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'OTRO'];

/** Cobros/pagos aún sin conciliar que pueden corresponder a esta cuenta. */
async function candidatePayments(companyId: string, bankAccountId: string, since: Date | null): Promise<ReconPayment[]> {
  const payments = await prisma.payment.findMany({
    where: {
      companyId,
      bankStatementLineId: null,
      OR: [{ bankAccountId }, { bankAccountId: null, paymentMethod: { in: CANDIDATE_METHODS } }],
      ...(since ? { paymentDate: { gte: since } } : {}),
    },
    select: { id: true, type: true, amount: true, paymentDate: true, referenceNumber: true, paymentMethod: true, contact: { select: { razonSocial: true } } },
    orderBy: { paymentDate: 'desc' },
    take: 3000,
  });
  return payments.map((payment) => ({
    id: payment.id,
    date: payment.paymentDate.toISOString().slice(0, 10),
    amount: signed(payment.type, payment.amount),
    referenceNumber: payment.referenceNumber,
    contactName: payment.contact.razonSocial,
    isCheque: payment.paymentMethod === 'CHEQUE',
  }));
}

function toReconLine(line: { id: string; date: Date; amount: number; description: string; reference: string | null }): ReconLine {
  return { id: line.id, date: line.date.toISOString().slice(0, 10), amount: line.amount, description: line.description, reference: line.reference };
}

async function candidateWindowStart(companyId: string, bankAccountId: string): Promise<Date | null> {
  const oldest = await prisma.bankStatementLine.findFirst({
    where: { companyId, bankAccountId, status: 'UNMATCHED' },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return oldest ? new Date(oldest.date.getTime() - 60 * 86_400_000) : null;
}

/** Concilia lo inequívoco. Devuelve cuántos movimientos quedaron conciliados. */
export async function runAutoMatch(companyId: string, bankAccountId: string, userId: string): Promise<number> {
  const lines = await prisma.bankStatementLine.findMany({
    where: { companyId, bankAccountId, status: 'UNMATCHED' },
    select: { id: true, date: true, amount: true, description: true, reference: true },
    take: 3000,
  });
  if (lines.length === 0) return 0;
  const payments = await candidatePayments(companyId, bankAccountId, await candidateWindowStart(companyId, bankAccountId));
  const pairs = autoMatch(lines.map(toReconLine), payments);
  let matched = 0;
  for (const pair of pairs) {
    try {
      await applyMatch(companyId, bankAccountId, userId, pair.lineId, [pair.paymentId]);
      matched += 1;
    } catch {
      // Otro usuario lo concilió entre la lectura y la escritura: se omite.
    }
  }
  return matched;
}

async function applyMatch(companyId: string, bankAccountId: string, userId: string, lineId: string, paymentIds: readonly string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BankLine" WHERE id = ${lineId} AND "companyId" = ${companyId} FOR UPDATE`;
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId, bankAccountId } });
    if (!line) throw new Error('Movimiento no encontrado');
    if (line.status !== 'UNMATCHED') throw new Error('Este movimiento ya está conciliado o ignorado');
    const payments = await tx.payment.findMany({
      where: { companyId, id: { in: [...paymentIds] }, bankStatementLineId: null, OR: [{ bankAccountId }, { bankAccountId: null }] },
      select: { id: true, type: true, amount: true },
    });
    if (payments.length !== new Set(paymentIds).size) throw new Error('Alguno de los pagos ya fue conciliado o no corresponde a esta cuenta');
    const total = payments.reduce((sum, payment) => sum + signed(payment.type, payment.amount), 0);
    if (total !== line.amount) throw new Error('La suma de los pagos seleccionados no coincide con el monto del movimiento');
    await tx.payment.updateMany({
      where: { companyId, id: { in: payments.map((payment) => payment.id) } },
      data: { bankStatementLineId: line.id, bankAccountId },
    });
    await tx.bankStatementLine.updateMany({
      where: { id: line.id, companyId },
      data: { status: 'MATCHED', matchedAt: new Date(), matchedById: userId, ignoredReason: null },
    });
  }, LOCKING_TX_OPTIONS);
}

export async function matchLine(companyId: string, userId: string, lineId: string, paymentIds: readonly string[]): Promise<void> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, companyId }, select: { bankAccountId: true } });
  if (!line) throw new Error('Movimiento no encontrado');
  if (paymentIds.length === 0) throw new Error('Selecciona al menos un cobro o pago');
  await applyMatch(companyId, line.bankAccountId, userId, lineId, paymentIds);
}

export async function unmatchLine(companyId: string, lineId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } });
    if (!line) throw new Error('Movimiento no encontrado');
    await tx.payment.updateMany({ where: { companyId, bankStatementLineId: line.id }, data: { bankStatementLineId: null } });
    await tx.bankStatementLine.updateMany({
      where: { id: line.id, companyId },
      data: { status: 'UNMATCHED', matchedAt: null, matchedById: null, ignoredReason: null },
    });
  });
}

export async function ignoreLine(companyId: string, userId: string, lineId: string, reason: string): Promise<void> {
  const result = await prisma.bankStatementLine.updateMany({
    where: { id: lineId, companyId, status: 'UNMATCHED' },
    data: { status: 'IGNORED', ignoredReason: reason, matchedAt: new Date(), matchedById: userId },
  });
  if (result.count === 0) throw new Error('Solo se puede marcar un movimiento pendiente');
}

/**
 * Registra en tesorería el cobro/pago que falta a partir del movimiento del
 * banco (un depósito de un cliente, una transferencia a un proveedor) y lo
 * deja conciliado. Un movimiento puede saldar varias facturas.
 */
export async function registerFromLine(
  companyId: string,
  userId: string,
  lineId: string,
  allocations: readonly { documentId: string; amount: number }[]
): Promise<number> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, companyId } });
  if (!line) throw new Error('Movimiento no encontrado');
  if (line.status !== 'UNMATCHED') throw new Error('Este movimiento ya está conciliado o ignorado');
  const total = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (total !== Math.abs(line.amount)) throw new Error('Lo asignado a documentos debe sumar exactamente el monto del movimiento');

  const paymentData = {
    paymentMethod: 'TRANSFERENCIA' as const,
    paymentDate: line.date.toISOString().slice(0, 10),
    referenceNumber: line.reference ?? undefined,
    bankAccountId: line.bankAccountId,
    notes: `Conciliación bancaria: ${line.description}`.slice(0, 300),
  };

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BankLine" WHERE id = ${lineId} AND "companyId" = ${companyId} FOR UPDATE`;
    const fresh = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId }, select: { status: true } });
    if (fresh?.status !== 'UNMATCHED') throw new Error('Este movimiento ya está conciliado o ignorado');
    const ids: string[] = [];
    for (const allocation of allocations) {
      const payment =
        line.amount > 0
          ? await registerSalesPayment(companyId, allocation.documentId, { ...paymentData, amount: allocation.amount }, tx)
          : await registerPurchasePayment(companyId, allocation.documentId, { ...paymentData, amount: allocation.amount }, tx);
      ids.push(payment.id);
    }
    await tx.payment.updateMany({ where: { companyId, id: { in: ids } }, data: { bankStatementLineId: line.id } });
    await tx.bankStatementLine.updateMany({
      where: { id: line.id, companyId },
      data: { status: 'MATCHED', matchedAt: new Date(), matchedById: userId },
    });
  }, LOCKING_TX_OPTIONS);
  return allocations.length;
}

export interface ReconLineView {
  id: string;
  date: Date;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: BankLineStatus;
  ignoredReason: string | null;
  matchedPayments: { id: string; amount: number; contactName: string; label: string }[];
  suggestions: (MatchSuggestion & { amount: number; date: string; contactName: string; label: string })[];
}

export interface OpenPaymentView {
  id: string;
  date: string;
  amount: number;
  contactName: string;
  label: string;
  method: PaymentMethodType;
}

export interface ReconciliationView {
  account: BankAccount;
  lines: ReconLineView[];
  openPayments: OpenPaymentView[];
  summary: ReconciliationSummary;
  counts: Record<BankLineStatus, number>;
  lastStatementBalance: number | null;
}

function salesDocLabel(dteType: DteType, folio: number | null): string {
  return `${DTE_TYPE_LABELS[dteType as keyof typeof DTE_TYPE_LABELS] ?? dteType} N° ${folio ?? 's/n'}`;
}

function purchaseDocLabel(documentType: PurchaseDocumentType, folio: string): string {
  return `${PURCHASE_DOCUMENT_TYPE_LABELS[documentType as keyof typeof PURCHASE_DOCUMENT_TYPE_LABELS] ?? documentType} N° ${folio}`;
}

function paymentLabel(payment: {
  type: 'INCOME' | 'EXPENSE';
  salesDocument: { dteType: DteType; folio: number | null } | null;
  purchaseDocument: { documentType: PurchaseDocumentType; folio: string } | null;
  referenceNumber: string | null;
}): string {
  if (payment.salesDocument) return `${payment.type === 'INCOME' ? 'Cobro' : 'Devolución'} ${salesDocLabel(payment.salesDocument.dteType, payment.salesDocument.folio)}`;
  if (payment.purchaseDocument) return `${payment.type === 'EXPENSE' ? 'Pago' : 'Reverso'} ${purchaseDocLabel(payment.purchaseDocument.documentType, payment.purchaseDocument.folio)}`;
  return `${payment.type === 'INCOME' ? 'Ingreso' : 'Egreso'}${payment.referenceNumber ? ` ref. ${payment.referenceNumber}` : ''}`;
}

const paymentViewSelect = {
  id: true,
  type: true,
  amount: true,
  paymentDate: true,
  paymentMethod: true,
  referenceNumber: true,
  bankStatementLineId: true,
  contact: { select: { razonSocial: true } },
  salesDocument: { select: { dteType: true, folio: true } },
  purchaseDocument: { select: { documentType: true, folio: true } },
} satisfies Prisma.PaymentSelect;

export async function getReconciliation(
  companyId: string,
  bankAccountId: string,
  options: { status?: BankLineStatus | 'ALL' } = {}
): Promise<ReconciliationView | null> {
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } });
  if (!account) return null;
  const since = account.openingDate;
  const lineWhere: Prisma.BankStatementLineWhereInput = { companyId, bankAccountId, ...(since ? { date: { gte: since } } : {}) };

  const [allLines, bookPayments, statusCounts, lastWithBalance] = await Promise.all([
    prisma.bankStatementLine.findMany({ where: lineWhere, select: { amount: true, status: true } }),
    prisma.payment.findMany({ where: { companyId, bankAccountId, ...(since ? { paymentDate: { gte: since } } : {}) }, select: { type: true, amount: true, bankStatementLineId: true } }),
    prisma.bankStatementLine.groupBy({ by: ['status'], where: lineWhere, _count: { _all: true } }),
    prisma.bankStatementLine.findFirst({ where: { ...lineWhere, balance: { not: null } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], select: { balance: true } }),
  ]);

  const summary = reconciliationSummary({
    openingBalance: account.openingBalance,
    lines: allLines,
    payments: bookPayments.map((payment) => ({ amount: signed(payment.type, payment.amount), reconciled: payment.bankStatementLineId !== null })),
  });

  const status = options.status ?? 'UNMATCHED';
  const lines = await prisma.bankStatementLine.findMany({
    where: { ...lineWhere, ...(status === 'ALL' ? {} : { status }) },
    include: { payments: { select: paymentViewSelect } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  });

  const unmatched = lines.filter((line) => line.status === 'UNMATCHED');
  const window = await candidateWindowStart(companyId, bankAccountId);
  const candidates = unmatched.length > 0 ? await candidatePayments(companyId, bankAccountId, window) : [];
  const candidateDetails =
    candidates.length > 0
      ? await prisma.payment.findMany({ where: { companyId, id: { in: candidates.map((c) => c.id) } }, select: paymentViewSelect })
      : [];
  const detailById = new Map(candidateDetails.map((payment) => [payment.id, payment]));

  const openPayments = await prisma.payment.findMany({
    where: { companyId, bankAccountId, bankStatementLineId: null, ...(since ? { paymentDate: { gte: since } } : {}) },
    select: paymentViewSelect,
    orderBy: { paymentDate: 'desc' },
    take: 200,
  });

  return {
    account,
    summary,
    lastStatementBalance: lastWithBalance?.balance ?? null,
    counts: {
      UNMATCHED: statusCounts.find((row) => row.status === 'UNMATCHED')?._count._all ?? 0,
      MATCHED: statusCounts.find((row) => row.status === 'MATCHED')?._count._all ?? 0,
      IGNORED: statusCounts.find((row) => row.status === 'IGNORED')?._count._all ?? 0,
    },
    openPayments: openPayments.map((payment) => ({
      id: payment.id,
      date: payment.paymentDate.toISOString().slice(0, 10),
      amount: signed(payment.type, payment.amount),
      contactName: payment.contact.razonSocial,
      label: paymentLabel(payment),
      method: payment.paymentMethod,
    })),
    lines: lines.map((line) => ({
      id: line.id,
      date: line.date,
      description: line.description,
      reference: line.reference,
      amount: line.amount,
      balance: line.balance,
      status: line.status,
      ignoredReason: line.ignoredReason,
      matchedPayments: line.payments.map((payment) => ({
        id: payment.id,
        amount: signed(payment.type, payment.amount),
        contactName: payment.contact.razonSocial,
        label: paymentLabel(payment),
      })),
      suggestions:
        line.status === 'UNMATCHED'
          ? suggestMatches(toReconLine(line), candidates).flatMap((suggestion) => {
              const detail = detailById.get(suggestion.paymentId);
              if (!detail) return [];
              return [{ ...suggestion, amount: signed(detail.type, detail.amount), date: detail.paymentDate.toISOString().slice(0, 10), contactName: detail.contact.razonSocial, label: paymentLabel(detail) }];
            })
          : [],
    })),
  };
}

export interface OpenDocumentOption {
  id: string;
  label: string;
  contactName: string;
  pending: number;
  dueDate: Date | null;
}

/** Documentos con saldo que un movimiento puede estar pagando (cobros si es abono, pagos si es cargo). */
export async function listOpenDocumentsForLine(companyId: string, lineId: string, query?: string): Promise<OpenDocumentOption[]> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, companyId }, select: { amount: true } });
  if (!line) throw new Error('Movimiento no encontrado');
  const term = query?.trim();
  if (line.amount > 0) {
    const docs = await prisma.salesDocument.findMany({
      where: {
        companyId,
        status: 'ISSUED',
        paymentStatus: { not: 'PAID' },
        dteType: { notIn: ['GUIA_DESPACHO_52', 'COTIZACION', 'NOTA_CREDITO_61'] },
        ...(term ? { OR: [{ contact: { razonSocial: { contains: term, mode: 'insensitive' } } }, { contact: { rut: { contains: term } } }, ...(/^\d+$/.test(term) ? [{ folio: Number(term) }] : [])] } : {}),
      },
      select: { id: true, dteType: true, folio: true, totalAmount: true, paidAmount: true, dueDate: true, contact: { select: { razonSocial: true } } },
      orderBy: { issueDate: 'desc' },
      take: 300,
    });
    return docs
      .map((doc) => ({ id: doc.id, label: salesDocLabel(doc.dteType, doc.folio), contactName: doc.contact.razonSocial, pending: doc.totalAmount - doc.paidAmount, dueDate: doc.dueDate }))
      .sort((a, b) => Math.abs(a.pending - line.amount) - Math.abs(b.pending - line.amount))
      .slice(0, 30);
  }
  const docs = await prisma.purchaseDocument.findMany({
    where: {
      companyId,
      status: 'ISSUED',
      paymentStatus: { not: 'PAID' },
      documentType: { notIn: ['NOTA_CREDITO', 'GUIA_DESPACHO'] },
      ...(term ? { OR: [{ contact: { razonSocial: { contains: term, mode: 'insensitive' } } }, { contact: { rut: { contains: term } } }, { folio: { contains: term } }] } : {}),
    },
    select: { id: true, documentType: true, folio: true, totalAmount: true, paidAmount: true, dueDate: true, contact: { select: { razonSocial: true } } },
    orderBy: { issueDate: 'desc' },
    take: 300,
  });
  const target = Math.abs(line.amount);
  return docs
    .map((doc) => ({ id: doc.id, label: purchaseDocLabel(doc.documentType, doc.folio), contactName: doc.contact.razonSocial, pending: doc.totalAmount - doc.paidAmount, dueDate: doc.dueDate }))
    .sort((a, b) => Math.abs(a.pending - target) - Math.abs(b.pending - target))
    .slice(0, 30);
}

/**
 * Cobros/pagos del mismo signo cercanos en fecha, para conciliar un
 * movimiento contra varios (un depósito que paga tres facturas).
 */
export async function listPaymentCandidatesForLine(companyId: string, lineId: string): Promise<OpenPaymentView[]> {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, companyId }, select: { bankAccountId: true, amount: true, date: true } });
  if (!line) throw new Error('Movimiento no encontrado');
  const from = new Date(line.date.getTime() - 45 * 86_400_000);
  const to = new Date(line.date.getTime() + 10 * 86_400_000);
  const payments = await prisma.payment.findMany({
    where: {
      companyId,
      bankStatementLineId: null,
      type: line.amount > 0 ? 'INCOME' : 'EXPENSE',
      paymentDate: { gte: from, lte: to },
      OR: [{ bankAccountId: line.bankAccountId }, { bankAccountId: null, paymentMethod: { in: CANDIDATE_METHODS } }],
    },
    select: paymentViewSelect,
    take: 150,
  });
  const target = line.date.getTime();
  return payments
    .sort((a, b) => Math.abs(a.paymentDate.getTime() - target) - Math.abs(b.paymentDate.getTime() - target))
    .map((payment) => ({
      id: payment.id,
      date: payment.paymentDate.toISOString().slice(0, 10),
      amount: signed(payment.type, payment.amount),
      contactName: payment.contact.razonSocial,
      label: paymentLabel(payment),
      method: payment.paymentMethod,
    }));
}
