/**
 * Bancos de Chile con su código CMF (ex SBIF), que es el que piden las
 * nóminas de pago y el que traen las cartolas. Lista acotada a los que operan
 * cuentas corrientes/vista para empresas y personas.
 */
export const CHILEAN_BANKS = [
  { code: '001', name: 'Banco de Chile / Edwards' },
  { code: '009', name: 'Banco Internacional' },
  { code: '012', name: 'BancoEstado' },
  { code: '014', name: 'Scotiabank' },
  { code: '016', name: 'BCI' },
  { code: '028', name: 'Banco BICE' },
  { code: '031', name: 'HSBC Bank' },
  { code: '037', name: 'Banco Santander' },
  { code: '039', name: 'Banco Itaú' },
  { code: '049', name: 'Banco Security' },
  { code: '051', name: 'Banco Falabella' },
  { code: '053', name: 'Banco Ripley' },
  { code: '055', name: 'Banco Consorcio' },
  { code: '672', name: 'Coopeuch' },
] as const;

export type BankCode = (typeof CHILEAN_BANKS)[number]['code'];

export const BANK_CODES = CHILEAN_BANKS.map((bank) => bank.code) as [BankCode, ...BankCode[]];

export function bankName(code: string | null | undefined): string {
  return CHILEAN_BANKS.find((bank) => bank.code === code)?.name ?? (code ? `Banco ${code}` : '—');
}

export const BANK_ACCOUNT_TYPES = ['CUENTA_CORRIENTE', 'CUENTA_VISTA', 'CUENTA_AHORRO', 'CUENTA_RUT'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  CUENTA_CORRIENTE: 'Cuenta corriente',
  CUENTA_VISTA: 'Cuenta vista',
  CUENTA_AHORRO: 'Cuenta de ahorro',
  CUENTA_RUT: 'CuentaRUT',
};

/** Número de cuenta tal como lo aceptan los bancos: solo dígitos (y guion en algunos). */
export function normalizeAccountNumber(value: string): string {
  return value.replace(/[^\dkK-]/g, '').replace(/^-+|-+$/g, '').toUpperCase();
}
