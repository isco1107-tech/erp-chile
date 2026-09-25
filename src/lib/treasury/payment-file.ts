import { bankName, normalizeAccountNumber } from './banks';

/**
 * Nómina de pago a proveedores: las filas que se suben al portal empresas del
 * banco. Cada banco tiene su plantilla, pero todos piden los mismos datos
 * (RUT, nombre, banco, tipo y número de cuenta, monto, correo y glosa): se
 * genera ese formato genérico, en CSV con `;` (lo que abre bien Excel en
 * español) o en planilla.
 */

export interface PaymentFileItem {
  rut: string;
  name: string;
  bankCode: string | null;
  accountType: string | null;
  accountNumber: string | null;
  email: string | null;
  amount: number;
  detail: string;
}

export interface PaymentFileIssue {
  name: string;
  problem: string;
}

/** Proveedores a los que les faltan datos para transferirles. */
export function paymentFileIssues(items: readonly PaymentFileItem[]): PaymentFileIssue[] {
  const issues: PaymentFileIssue[] = [];
  for (const item of items) {
    const missing: string[] = [];
    if (!item.bankCode) missing.push('banco');
    if (!item.accountType) missing.push('tipo de cuenta');
    if (!item.accountNumber || normalizeAccountNumber(item.accountNumber).length < 4) missing.push('número de cuenta');
    if (missing.length > 0) issues.push({ name: item.name, problem: `falta ${missing.join(', ')}` });
    if (item.amount <= 0) issues.push({ name: item.name, problem: 'monto en cero' });
  }
  return issues;
}

export const PAYMENT_FILE_HEADERS = [
  'RUT beneficiario',
  'Nombre beneficiario',
  'Código banco',
  'Banco',
  'Tipo de cuenta',
  'Número de cuenta',
  'Monto',
  'Correo aviso',
  'Glosa',
] as const;

const ACCOUNT_TYPE_CODES: Record<string, string> = {
  CUENTA_CORRIENTE: 'CTE',
  CUENTA_VISTA: 'VISTA',
  CUENTA_AHORRO: 'AHORRO',
  CUENTA_RUT: 'RUT',
};

/** RUT sin puntos, con guion: el formato que aceptan los portales bancarios. */
export function rutForBank(rut: string): string {
  const clean = rut.replace(/[^\dkK]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export function paymentFileRows(items: readonly PaymentFileItem[]): string[][] {
  return items.map((item) => [
    rutForBank(item.rut),
    item.name.slice(0, 60),
    item.bankCode ?? '',
    bankName(item.bankCode),
    ACCOUNT_TYPE_CODES[item.accountType ?? ''] ?? '',
    normalizeAccountNumber(item.accountNumber ?? ''),
    String(Math.round(item.amount)),
    item.email ?? '',
    item.detail.slice(0, 60),
  ]);
}

function csvCell(value: string): string {
  // Evita inyección de fórmulas al abrir el CSV en Excel.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function paymentFileCsv(items: readonly PaymentFileItem[]): string {
  const lines = [PAYMENT_FILE_HEADERS.join(';'), ...paymentFileRows(items).map((row) => row.map(csvCell).join(';'))];
  return `${lines.join('\r\n')}\r\n`;
}
