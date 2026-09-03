import type { Account, JournalEntry, JournalLine, JournalSourceType, Prisma } from '@prisma/client';

/**
 * Motor de asientos contables.
 *
 * Principio rector: un hecho económico se registra una vez. El asiento nace
 * junto con el documento, dentro de la misma `$transaction`, o no nace
 * ninguno — por eso cada función de aquí recibe el cliente de transacción
 * como parámetro y NUNCA abre la suya propia. La base de datos (ver migración
 * `add_accounting_core`) fuerza cuadratura, signos, inmutabilidad de un
 * asiento POSTED y que solo cuentas hoja reciban líneas; las validaciones de
 * aquí son la primera línea de defensa, para fallar con un mensaje legible en
 * vez de una excepción cruda de Postgres.
 */

export type TxClient = Prisma.TransactionClient;

export interface JournalLineInput {
  accountId: string;
  /** Exactamente uno de `debit`/`credit` debe ser > 0; el otro, 0. */
  debit: number;
  credit: number;
  description?: string;
  customerId?: string;
  supplierId?: string;
  productId?: string;
  costCenterId?: string;
}

export interface CreateEntryInput {
  companyId: string;
  date: Date;
  description: string;
  sourceType: JournalSourceType;
  /** Trazabilidad al documento origen (SalesDocument.id, Payment.id, ...). */
  sourceId?: string;
  createdByUserId?: string;
  lines: JournalLineInput[];
}

export type JournalEntryWithLines = JournalEntry & { lines: JournalLine[] };

export class JournalError extends Error {}

/** Exportada para poder testear la regla de cuadratura/signos sin necesitar una base de datos. */
export function validateLinesShape(lines: JournalLineInput[]): void {
  if (lines.length === 0) throw new JournalError('Un asiento contable necesita al menos una línea');

  let totalDebit = 0;
  let totalCredit = 0;
  for (const [index, line] of lines.entries()) {
    if (line.debit < 0 || line.credit < 0) {
      throw new JournalError(`Línea ${index + 1}: los montos no pueden ser negativos`);
    }
    const hasDebit = line.debit > 0;
    const hasCredit = line.credit > 0;
    if (hasDebit === hasCredit) {
      throw new JournalError(`Línea ${index + 1}: debe cargarse a debe O a haber, nunca ambos ni ninguno`);
    }
    totalDebit += line.debit;
    totalCredit += line.credit;
  }
  if (totalDebit !== totalCredit) {
    throw new JournalError(`Asiento descuadrado: debe $${totalDebit} distinto de haber $${totalCredit}`);
  }
}

/** Busca el período contable de la fecha del asiento, o lo abre si es la primera vez que se usa ese mes. */
async function resolveOpenPeriod(tx: TxClient, companyId: string, date: Date): Promise<{ id: string }> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const period = await tx.accountingPeriod.upsert({
    where: { companyId_year_month: { companyId, year, month } },
    update: {},
    create: { companyId, year, month, status: 'OPEN' },
  });

  if (period.status !== 'OPEN') {
    throw new JournalError(
      `El período ${month}/${year} está ${period.status === 'CLOSED' ? 'cerrado' : 'bloqueado'}: no admite nuevos asientos`
    );
  }
  return period;
}

async function validateAccounts(tx: TxClient, companyId: string, lines: JournalLineInput[]): Promise<Map<string, Account>> {
  const accountIds = Array.from(new Set(lines.map((line) => line.accountId)));
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companyId } });

  if (accounts.length !== accountIds.length) {
    const found = new Set(accounts.map((account) => account.id));
    const missing = accountIds.filter((id) => !found.has(id));
    throw new JournalError(`Cuenta(s) no encontrada(s) en el plan de la empresa: ${missing.join(', ')}`);
  }
  for (const account of accounts) {
    if (!account.isPostable) throw new JournalError(`La cuenta ${account.code} — ${account.name} es agrupadora, no admite líneas`);
    if (!account.isActive) throw new JournalError(`La cuenta ${account.code} — ${account.name} está inactiva`);
  }
  return new Map(accounts.map((account) => [account.id, account]));
}

/** Correlativo por empresa y año, sin huecos: mismo patrón que `FolioSequence`. */
async function nextEntryNumber(tx: TxClient, companyId: string, year: number): Promise<number> {
  const sequence = await tx.journalEntrySequence.upsert({
    where: { companyId_year: { companyId, year } },
    update: { currentNumber: { increment: 1 } },
    create: { companyId, year, currentNumber: 1 },
  });
  return sequence.currentNumber;
}

/**
 * Crea un asiento en estado DRAFT con sus líneas. No lo contabiliza: usar
 * `postEntry` después, o `createAndPostEntry` para el caso común de nacer ya
 * contabilizado junto con el documento que lo origina.
 */
export async function createEntry(tx: TxClient, input: CreateEntryInput): Promise<JournalEntryWithLines> {
  validateLinesShape(input.lines);
  const period = await resolveOpenPeriod(tx, input.companyId, input.date);
  await validateAccounts(tx, input.companyId, input.lines);

  const year = input.date.getUTCFullYear();
  const entryNumber = await nextEntryNumber(tx, input.companyId, year);

  return tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      entryNumber,
      year,
      date: input.date,
      description: input.description,
      periodId: period.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdByUserId: input.createdByUserId,
      status: 'DRAFT',
      lines: {
        create: input.lines.map((line, index) => ({
          companyId: input.companyId,
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          lineNumber: index + 1,
          customerId: line.customerId,
          supplierId: line.supplierId,
          productId: line.productId,
          costCenterId: line.costCenterId,
        })),
      },
    },
    include: { lines: true },
  });
}

/** Contabiliza un asiento DRAFT. La base recalcula y verifica la cuadratura de forma independiente. */
export async function postEntry(tx: TxClient, entryId: string): Promise<JournalEntryWithLines> {
  const entry = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!entry) throw new JournalError('Asiento no encontrado');
  if (entry.status !== 'DRAFT') throw new JournalError(`El asiento ya está en estado ${entry.status}`);

  const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new JournalError(`Asiento descuadrado: debe $${totalDebit} distinto de haber $${totalCredit}`);
  }

  const posted = await tx.journalEntry.update({
    where: { id: entryId },
    data: { status: 'POSTED', postedAt: new Date() },
    include: { lines: true },
  });
  return posted;
}

/**
 * Crea y contabiliza en un solo paso. Es lo que las reglas de asiento de la
 * Fase C deberían llamar en la práctica: el documento y su asiento nacen
 * juntos, dentro de la misma `$transaction`.
 */
export async function createAndPostEntry(tx: TxClient, input: CreateEntryInput): Promise<JournalEntryWithLines> {
  const draft = await createEntry(tx, input);
  return postEntry(tx, draft.id);
}

/**
 * Reversa un asiento POSTED: crea uno nuevo con debe/haber invertidos,
 * enlazado vía `reversalOfId`, y marca el original como REVERSED. El asiento
 * original nunca se edita ni se borra — así lo exige el trigger de
 * inmutabilidad, y así lo pide el principio rector del módulo.
 */
export async function reverseEntry(
  tx: TxClient,
  entryId: string,
  reason: string,
  createdByUserId?: string
): Promise<JournalEntryWithLines> {
  const original = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!original) throw new JournalError('Asiento no encontrado');
  if (original.status !== 'POSTED') throw new JournalError('Solo se puede reversar un asiento contabilizado (POSTED)');

  const existingReversal = await tx.journalEntry.findFirst({ where: { reversalOfId: entryId } });
  if (existingReversal) throw new JournalError('Este asiento ya fue reversado');

  const reversal = await createAndPostEntry(tx, {
    companyId: original.companyId,
    date: new Date(),
    description: `Reverso de asiento #${original.entryNumber}/${original.year} — ${reason}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId ?? undefined,
    createdByUserId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      // Debe/haber invertidos: eso es lo que anula el efecto del original.
      debit: line.credit,
      credit: line.debit,
      description: line.description ?? undefined,
      customerId: line.customerId ?? undefined,
      supplierId: line.supplierId ?? undefined,
      productId: line.productId ?? undefined,
      costCenterId: line.costCenterId ?? undefined,
    })),
  });

  const linkedReversal = await tx.journalEntry.update({
    where: { id: reversal.id },
    data: { reversalOfId: entryId },
    include: { lines: true },
  });
  await tx.journalEntry.update({ where: { id: entryId }, data: { status: 'REVERSED' } });

  return linkedReversal;
}

/** Resuelve una cuenta por su clave semántica (`CAJA`, `CLIENTES`, ...) vía `AccountMapping`. */
export async function resolveMappedAccountId(tx: TxClient, companyId: string, key: string): Promise<string> {
  const mapping = await tx.accountMapping.findUnique({ where: { companyId_key: { companyId, key } } });
  if (!mapping) {
    throw new JournalError(
      `No hay una cuenta mapeada a "${key}" para esta empresa. Configúrala en el plan de cuentas antes de emitir documentos`
    );
  }
  return mapping.accountId;
}
