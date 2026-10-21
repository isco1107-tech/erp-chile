import { CASH_PAYMENT_METHODS } from './schema';

/**
 * Aritmética del arqueo y utilidades puras de caja de supermercado, sin
 * dependencias de servidor para que sean 100% testeables.
 */

export interface CashDrawerInput {
  initialAmount: number;
  cashSales: number;
  inflows: number;
  outflows: number;
}

/**
 * Efectivo que debería haber físicamente en el cajón.
 *
 * Solo entra lo que se pagó en efectivo: débito, crédito y transferencia se
 * concilian contra el banco. Sumarlos aquí haría que toda caja apareciera con
 * un faltante gigante igual al monto cobrado con tarjeta.
 */
export function computeExpectedAmount(input: CashDrawerInput): number {
  return input.initialAmount + input.cashSales + input.inflows - input.outflows;
}

/**
 * Descuadre: positivo es sobrante, negativo es faltante.
 * Siempre contado − esperado, nunca al revés: el signo es lo que distingue
 * "sobró plata" de "falta plata" en la bitácora.
 */
export function computeDifference(actualAmount: number, expectedAmount: number): number {
  return actualAmount - expectedAmount;
}

export interface PaymentTotal {
  method: string;
  total: number;
}

/** Suma solo lo cobrado en medios que entran al cajón. */
export function sumCashPayments(totals: PaymentTotal[]): number {
  return totals
    .filter((row) => (CASH_PAYMENT_METHODS as readonly string[]).includes(row.method))
    .reduce((sum, row) => sum + row.total, 0);
}

/** Vuelto a entregar. Nunca negativo: si falta dinero, la venta no debe cerrarse. */
export function computeChange(cashReceived: number, totalAmount: number): number {
  return Math.max(0, cashReceived - totalAmount);
}

export function isPaymentSufficient(cashReceived: number, totalAmount: number): boolean {
  return cashReceived >= totalAmount;
}

// ─── Supermercado: Ley de Redondeo en Efectivo (Ley N° 20.956, Art. 13) ──────

/**
 * Redondea un monto en pesos enteros a la decena según la Ley N° 20.956 de
 * Chile (Banco Central / SII Res. Ex. N° 101/2017 para pagos en efectivo):
 * - Terminados en 1, 2, 3, 4 y 5 se redondean hacia abajo a la decena inferior (0).
 * - Terminados en 6, 7, 8 y 9 se redondean hacia arriba a la decena superior (10).
 *
 * El total tributario del DTE (`totalAmount`) NO se modifica; el redondeo solo
 * aplica al cobro físico en efectivo y al cálculo del vuelto.
 */
export function roundCashChile(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const intAmount = Math.round(amount);
  const remainder = intAmount % 10;
  if (remainder === 0) return intAmount;
  if (remainder <= 5) return intAmount - remainder;
  return intAmount + (10 - remainder);
}

/**
 * Diferencia por redondeo Ley 20.956 (`redondeado - total`):
 * entre `-5` (a favor del cliente) y `+4` (ajuste a la decena superior).
 */
export function computeCashRoundingDiff(totalAmount: number): number {
  const intAmount = Math.max(0, Math.round(totalAmount));
  return roundCashChile(intAmount) - intAmount;
}

/** Vuelto en efectivo aplicando el redondeo legal chileno a la decena. */
export function computeCashChangeChile(cashReceived: number, totalAmount: number): number {
  return Math.max(0, Math.round(cashReceived) - roundCashChile(totalAmount));
}

/** En efectivo basta cubrir el monto redondeado según Ley 20.956. */
export function isCashPaymentSufficientChile(cashReceived: number, totalAmount: number): boolean {
  return Math.round(cashReceived) >= roundCashChile(totalAmount);
}

// ─── Supermercado: Códigos de Barras de Balanza (EAN-13 Prefijos 20–29) ──────

export interface ScaleBarcodeReading {
  raw: string;
  prefix: string;
  /** Código interno de 5 dígitos del producto (PLU) impreso por la balanza. */
  plu: string;
  /** PLU numérico sin ceros a la izquierda (ej. `01234` -> `1234`). */
  pluNumber: number;
  mode: 'WEIGHT' | 'PRICE';
  /** Peso en kilogramos (ej. 0.45 para 450 gramos) cuando `mode === 'WEIGHT'`. */
  weightKg: number | null;
  /** Precio total en CLP impreso en la etiqueta cuando `mode === 'PRICE'`. */
  totalPriceClp: number | null;
}

/** Valida el dígito verificador estándar de un código EAN-13 de 13 dígitos. */
export function isValidEan13CheckDigit(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return Number(code[12]) === expected;
}

/**
 * Interpreta una etiqueta EAN-13 de balanza de supermercado (fiambrería,
 * carnicería, panadería, verdulería):
 * - Prefijos `20` a `25` y `27` a `29`: `2P CCCCC WWWWW K` -> `WWWWW` gramos (`WW.WWW` kg).
 * - Prefijo `26`: `26 CCCCC PPPPP K` -> `PPPPP` pesos chilenos de importe total.
 *
 * Exige que el dígito verificador EAN-13 sea válido para no confundir tipeos
 * manuales con lecturas reales de balanza.
 */
export function parseScaleBarcode(rawCode: string): ScaleBarcodeReading | null {
  const code = rawCode.trim();
  if (!/^2[0-9]\d{11}$/.test(code)) return null;
  if (!isValidEan13CheckDigit(code)) return null;

  const prefix = code.slice(0, 2);
  const plu = code.slice(2, 7);
  const pluNumber = Number(plu);
  const valueRaw = Number(code.slice(7, 12));
  if (!Number.isFinite(valueRaw) || valueRaw <= 0) return null;

  if (prefix === '26') {
    return {
      raw: code,
      prefix,
      plu,
      pluNumber,
      mode: 'PRICE',
      weightKg: null,
      totalPriceClp: valueRaw,
    };
  }

  return {
    raw: code,
    prefix,
    plu,
    pluNumber,
    mode: 'WEIGHT',
    weightKg: Math.round(valueRaw) / 1000,
    totalPriceClp: null,
  };
}

function normalizePluCandidate(sku: string): string {
  return sku.trim().replace(/^plu[-_\s]*/i, '').replace(/^0+/, '') || '0';
}

/**
 * Cruza la lectura de una etiqueta de balanza EAN-13 contra el catálogo del
 * supermercado por:
 * 1. SKU exacto igual al PLU de 5 dígitos (`01234`) o sin ceros (`1234`, `PLU-1234`),
 * 2. Prefijo de 7 dígitos (`2PCCCCC`) en el código de barras base del producto
 *    (ej. `2001234000000`).
 */
export function matchScaleBarcodeToProduct<
  T extends { sku: string; barcode: string | null }
>(reading: ScaleBarcodeReading, products: readonly T[]): T | undefined {
  const prefix7 = `${reading.prefix}${reading.plu}`;
  const pluStripped = String(reading.pluNumber);

  return (
    products.find((p) => p.sku.trim() === reading.plu) ??
    products.find((p) => normalizePluCandidate(p.sku) === pluStripped) ??
    products.find((p) => p.barcode !== null && p.barcode.startsWith(prefix7)) ??
    products.find(
      (p) => p.barcode !== null && /^2[0-9]/.test(p.barcode) && p.barcode.slice(2, 7) === reading.plu
    )
  );
}

// ─── Supermercado: Multiplicador Rápido de Escáner (`12*CODIGO` o `12*`) ─────

export interface ParsedScannerInput {
  multiplier: number | null;
  code: string;
}

/**
 * Permite al cajero digitar `12*` + Enter (fija el multiplicador para el
 * próximo escaneo) o `12*7801234567890` / `0,45*pan` en una sola pasada.
 */
export function parseScannerInput(raw: string): ParsedScannerInput {
  const trimmed = raw.trim();
  const match = /^(\d+(?:[.,]\d{1,3})?)\s*[*xX]\s*(.*)$/.exec(trimmed);
  if (match) {
    const mult = Number(match[1]!.replace(',', '.'));
    const code = match[2]!.trim();
    if (Number.isFinite(mult) && mult > 0 && mult <= 10_000) {
      return {
        multiplier: Math.round(mult * 1000) / 1000,
        code,
      };
    }
  }
  return { multiplier: null, code: trimmed };
}

// ─── Supermercado: Contador de Billetes y Monedas (Arqueo de Caja) ───────────

export interface CashDenominationDef {
  value: number;
  label: string;
  kind: 'BILL' | 'COIN';
}

export const CHILE_CASH_DENOMINATIONS: readonly CashDenominationDef[] = [
  { value: 20000, label: '$20.000', kind: 'BILL' },
  { value: 10000, label: '$10.000', kind: 'BILL' },
  { value: 5000, label: '$5.000', kind: 'BILL' },
  { value: 2000, label: '$2.000', kind: 'BILL' },
  { value: 1000, label: '$1.000', kind: 'BILL' },
  { value: 500, label: '$500', kind: 'COIN' },
  { value: 100, label: '$100', kind: 'COIN' },
  { value: 50, label: '$50', kind: 'COIN' },
  { value: 10, label: '$10', kind: 'COIN' },
] as const;

/** Suma el total físico en caja a partir del conteo de billetes y monedas. */
export function sumCashDenominations(counts: Partial<Record<number, number>>): number {
  let total = 0;
  for (const denom of CHILE_CASH_DENOMINATIONS) {
    const qty = counts[denom.value];
    if (typeof qty === 'number' && Number.isFinite(qty) && qty > 0) {
      total += denom.value * Math.floor(qty);
    }
  }
  return total;
}
