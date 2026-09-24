import type { Payslip } from '@prisma/client';
import { resolveOrCreateMappedAccountId } from '../chart-of-accounts';
import { createAndPostEntry, JournalError, type TxClient } from '../services/journal.service';
import { isLedgerActive, reverseDocumentEntries } from './shared';

/**
 * Asientos de devengo de los módulos de personas: remuneraciones, boletas de
 * honorarios y rendiciones de gastos. El pago posterior (sueldos, cotizaciones,
 * honorarios, reembolso) NO se contabiliza acá: pasa por Tesorería
 * (`recordTreasuryMovement`), que carga el pasivo que estas reglas abonan.
 *
 * Las funciones `build*Lines` son puras (claves semánticas + montos) para
 * poder testear la cuadratura sin base de datos; las `post*` resuelven las
 * claves al plan de cuentas de la empresa y contabilizan.
 */

export interface KeyedLine {
  key: string;
  debit: number;
  credit: number;
  description: string;
}

function assertNonNegative(lines: KeyedLine[]): void {
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new JournalError(`Monto negativo en "${line.description}": revisa el cálculo antes de contabilizar`);
    }
  }
}

/** Quita las líneas en cero: un asiento no lleva líneas sin monto (lo exige también la base). */
function nonZero(lines: KeyedLine[]): KeyedLine[] {
  return lines.filter((line) => line.debit > 0 || line.credit > 0);
}

export type PayslipAmounts = Pick<
  Payslip,
  | 'taxableIncome'
  | 'mealAllowance'
  | 'transportAllowance'
  | 'pensionAmount'
  | 'healthAmount'
  | 'unemploymentEmployee'
  | 'incomeTax'
  | 'advances'
  | 'otherDeductions'
  | 'netPay'
  | 'employerSis'
  | 'employerUnemployment'
  | 'employerMutual'
  | 'employerPension'
>;

export interface PayrollTotals {
  gross: number;
  employerContributions: number;
  workerContributions: number;
  incomeTax: number;
  advances: number;
  otherDeductions: number;
  netPay: number;
}

export function sumPayroll(payslips: PayslipAmounts[]): PayrollTotals {
  const totals: PayrollTotals = { gross: 0, employerContributions: 0, workerContributions: 0, incomeTax: 0, advances: 0, otherDeductions: 0, netPay: 0 };
  for (const slip of payslips) {
    totals.gross += slip.taxableIncome + slip.mealAllowance + slip.transportAllowance;
    totals.employerContributions += slip.employerSis + slip.employerUnemployment + slip.employerMutual + slip.employerPension;
    totals.workerContributions += slip.pensionAmount + slip.healthAmount + slip.unemploymentEmployee;
    totals.incomeTax += slip.incomeTax;
    totals.advances += slip.advances;
    totals.otherDeductions += slip.otherDeductions;
    totals.netPay += slip.netPay;
  }
  return totals;
}

/**
 * Centralización de remuneraciones del mes:
 *
 *   Remuneraciones (gasto)          total haberes
 *   Aportes patronales (gasto)      SIS + cesantía empleador + mutual + aporte empleador
 *        a Cotizaciones por pagar   AFP + salud + cesantía trabajador + aportes patronales
 *        a Impuesto único por pagar
 *        a Anticipos al personal    (anticipos ya entregados en el mes)
 *        a Descuentos por enterar   (otros descuentos retenidos)
 *        a Remuneraciones por pagar líquido a pagar
 *
 * Cuadra por construcción: líquido = haberes − descuentos (ver `computePayslip`).
 */
export function buildPayrollLines(totals: PayrollTotals, label: string): KeyedLine[] {
  const lines: KeyedLine[] = [
    { key: 'REMUNERACIONES_GASTO', debit: totals.gross, credit: 0, description: `Remuneraciones ${label}` },
    { key: 'APORTES_PATRONALES', debit: totals.employerContributions, credit: 0, description: `Aportes patronales ${label}` },
    { key: 'COTIZACIONES_POR_PAGAR', debit: 0, credit: totals.workerContributions + totals.employerContributions, description: `Cotizaciones ${label}` },
    { key: 'IMPUESTO_UNICO_POR_PAGAR', debit: 0, credit: totals.incomeTax, description: `Impuesto único ${label}` },
    { key: 'ANTICIPOS_PERSONAL', debit: 0, credit: totals.advances, description: `Anticipos descontados ${label}` },
    { key: 'DESCUENTOS_PERSONAL', debit: 0, credit: totals.otherDeductions, description: `Otros descuentos ${label}` },
    { key: 'REMUNERACIONES_POR_PAGAR', debit: 0, credit: totals.netPay, description: `Líquidos por pagar ${label}` },
  ];
  assertNonNegative(lines);
  return nonZero(lines);
}

/** Boleta de honorarios recibida: gasto bruto, retención por enterar y líquido por pagar al prestador. */
export function buildFeeDocumentLines(input: { grossAmount: number; retentionAmount: number; netToPay: number; folio: string }): KeyedLine[] {
  if (input.retentionAmount + input.netToPay !== input.grossAmount) {
    throw new JournalError(`La boleta de honorarios N° ${input.folio} no cuadra: bruto distinto de retención + líquido`);
  }
  const lines: KeyedLine[] = [
    { key: 'HONORARIOS_GASTO', debit: input.grossAmount, credit: 0, description: `Honorarios BHE N° ${input.folio}` },
    { key: 'RETENCION_HONORARIOS', debit: 0, credit: input.retentionAmount, description: `Retención BHE N° ${input.folio}` },
    { key: 'HONORARIOS_POR_PAGAR', debit: 0, credit: input.netToPay, description: `Líquido BHE N° ${input.folio}` },
  ];
  assertNonNegative(lines);
  return nonZero(lines);
}

/**
 * Rendición aprobada: el gasto se reconoce contra la deuda con quien rindió.
 * Se contabiliza por el total pagado (IVA incluido) a propósito: una factura
 * rendida por un colaborador no entra al Registro de Compras por sí sola, así
 * que su IVA no se puede usar como crédito fiscal sin registrarla aparte en
 * Compras.
 */
export function buildExpenseReportLines(input: { totalAmount: number; title: string }): KeyedLine[] {
  const lines: KeyedLine[] = [
    { key: 'GASTOS_RENDIDOS', debit: input.totalAmount, credit: 0, description: `Rendición: ${input.title}` },
    { key: 'RENDICIONES_POR_PAGAR', debit: 0, credit: input.totalAmount, description: `Por reembolsar: ${input.title}` },
  ];
  assertNonNegative(lines);
  return nonZero(lines);
}

async function postKeyedLines(
  tx: TxClient,
  companyId: string,
  entry: {
    date: Date;
    description: string;
    sourceType: 'PAYROLL' | 'FEE_DOCUMENT' | 'EXPENSE_REPORT';
    sourceId: string;
    createdByUserId?: string;
    supplierId?: string;
  },
  lines: KeyedLine[]
): Promise<void> {
  if (lines.length === 0) return;
  // Secuencial a propósito: `resolveOrCreateMappedAccountId` puede crear
  // cuentas y dos creaciones en paralelo sobre el mismo grupo competirían por
  // el mismo código libre.
  const resolved = [];
  for (const line of lines) {
    const accountId = await resolveOrCreateMappedAccountId(tx, companyId, line.key);
    resolved.push({ accountId, debit: line.debit, credit: line.credit, description: line.description, supplierId: entry.supplierId });
  }
  await createAndPostEntry(tx, {
    companyId,
    date: entry.date,
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    createdByUserId: entry.createdByUserId,
    lines: resolved,
  });
}

/** Último día del mes (UTC), fecha contable de la centralización de remuneraciones. */
export function payrollEntryDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 12));
}

type AccrualSource = 'PAYROLL' | 'FEE_DOCUMENT' | 'EXPENSE_REPORT';

async function hasAccrualEntry(tx: TxClient, companyId: string, sourceType: AccrualSource, sourceId: string): Promise<boolean> {
  const entry = await tx.journalEntry.findFirst({
    where: { companyId, sourceType, sourceId, status: 'POSTED', reversalOfId: null },
    select: { id: true },
  });
  return entry !== null;
}

/** La fecha original si su mes contable sigue abierto (o aún no existe); si no, hoy. */
async function regularizationDate(tx: TxClient, companyId: string, original: Date): Promise<Date> {
  const period = await tx.accountingPeriod.findUnique({
    where: { companyId_year_month: { companyId, year: original.getUTCFullYear(), month: original.getUTCMonth() + 1 } },
    select: { status: true },
  });
  return !period || period.status === 'OPEN' ? original : new Date();
}

/**
 * Boletas, rendiciones y remuneraciones registradas antes de que existieran
 * estos asientos de devengo (o mientras la Contabilidad estaba apagada) no
 * tienen el suyo: pagarlas cargaría un pasivo que nadie abonó y el gasto
 * nunca aparecería. Por eso cada pago llama primero a su `ensure*Accrual`:
 * si la Contabilidad está activa y el registro no tiene asiento vigente, lo
 * contabiliza en su fecha original si ese mes sigue abierto, o hoy si ya se
 * cerró. Idempotente; el llamador ya tiene el lock sobre el registro.
 */
async function needsAccrual(tx: TxClient, companyId: string, sourceType: AccrualSource, sourceId: string): Promise<boolean> {
  if (!(await isLedgerActive(tx, companyId))) return false;
  return !(await hasAccrualEntry(tx, companyId, sourceType, sourceId));
}

export async function ensurePayrollAccrual(
  tx: TxClient,
  companyId: string,
  period: { id: string; year: number; month: number; label: string },
  payslips: PayslipAmounts[],
  createdByUserId?: string
): Promise<void> {
  if (!(await needsAccrual(tx, companyId, 'PAYROLL', period.id))) return;
  const date = await regularizationDate(tx, companyId, payrollEntryDate(period.year, period.month));
  await postPayrollClosing(tx, companyId, period, payslips, createdByUserId, date);
}

export async function ensureFeeDocumentAccrual(
  tx: TxClient,
  companyId: string,
  fee: Parameters<typeof postFeeDocumentRegistered>[2],
  createdByUserId?: string
): Promise<void> {
  if (!(await needsAccrual(tx, companyId, 'FEE_DOCUMENT', fee.id))) return;
  const date = await regularizationDate(tx, companyId, fee.issueDate);
  await postFeeDocumentRegistered(tx, companyId, { ...fee, issueDate: date }, createdByUserId);
}

export async function ensureExpenseReportAccrual(
  tx: TxClient,
  companyId: string,
  report: Parameters<typeof postExpenseReportApproved>[2],
  createdByUserId?: string
): Promise<void> {
  if (!(await needsAccrual(tx, companyId, 'EXPENSE_REPORT', report.id))) return;
  const date = await regularizationDate(tx, companyId, report.approvedAt);
  await postExpenseReportApproved(tx, companyId, { ...report, approvedAt: date }, createdByUserId);
}

export async function postPayrollClosing(
  tx: TxClient,
  companyId: string,
  period: { id: string; year: number; month: number; label: string },
  payslips: PayslipAmounts[],
  createdByUserId?: string,
  date: Date = payrollEntryDate(period.year, period.month)
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  await postKeyedLines(
    tx,
    companyId,
    {
      date,
      description: `Centralización de remuneraciones ${period.label}`,
      sourceType: 'PAYROLL',
      sourceId: period.id,
      createdByUserId,
    },
    buildPayrollLines(sumPayroll(payslips), period.label)
  );
}

export async function postFeeDocumentRegistered(
  tx: TxClient,
  companyId: string,
  fee: { id: string; contactId: string; issueDate: Date; folioNumber: string; grossAmount: number; retentionAmount: number; netToPay: number },
  createdByUserId?: string
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  await postKeyedLines(
    tx,
    companyId,
    {
      date: fee.issueDate,
      description: `Boleta de honorarios N° ${fee.folioNumber}`,
      sourceType: 'FEE_DOCUMENT',
      sourceId: fee.id,
      createdByUserId,
      supplierId: fee.contactId,
    },
    buildFeeDocumentLines({ grossAmount: fee.grossAmount, retentionAmount: fee.retentionAmount, netToPay: fee.netToPay, folio: fee.folioNumber })
  );
}

export async function reverseFeeDocumentPosting(tx: TxClient, companyId: string, feeId: string, reason: string, userId?: string): Promise<void> {
  await reverseDocumentEntries(tx, companyId, 'FEE_DOCUMENT', feeId, reason, userId);
}

export async function postExpenseReportApproved(
  tx: TxClient,
  companyId: string,
  report: { id: string; title: string; totalAmount: number; approvedAt: Date },
  createdByUserId?: string
): Promise<void> {
  if (!(await isLedgerActive(tx, companyId))) return;
  await postKeyedLines(
    tx,
    companyId,
    {
      date: report.approvedAt,
      description: `Rendición de gastos aprobada: ${report.title}`,
      sourceType: 'EXPENSE_REPORT',
      sourceId: report.id,
      createdByUserId,
    },
    buildExpenseReportLines({ totalAmount: report.totalAmount, title: report.title })
  );
}
