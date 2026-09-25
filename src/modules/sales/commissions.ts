import type { CommissionBasis, DteType } from '@prisma/client';

/**
 * Comisiones de vendedores, como funciones puras. La base es la venta NETA
 * (neto + exento, sin IVA): el IVA no es ingreso de la empresa.
 */

/** Documentos que cuentan como venta para comisión; la nota de crédito resta. */
const COMMISSIONABLE: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41', 'NOTA_DEBITO_56', 'NOTA_CREDITO_61'];

export interface CommissionDocument {
  sellerId: string | null;
  dteType: DteType;
  netAmount: number;
  exemptAmount: number;
  totalAmount: number;
}

export interface CommissionPayment {
  sellerId: string | null;
  /** Monto cobrado (con IVA). */
  amount: number;
  /** Del documento cobrado, para sacar el IVA en la misma proporción. */
  documentNet: number;
  documentTotal: number;
}

export interface SellerCommission {
  sellerId: string;
  basis: CommissionBasis;
  rateBps: number;
  /** Venta neta (o cobro neto) del período que sirve de base. */
  base: number;
  documents: number;
  commission: number;
}

export function netSale(doc: Pick<CommissionDocument, 'dteType' | 'netAmount' | 'exemptAmount'>): number {
  if (!COMMISSIONABLE.includes(doc.dteType)) return 0;
  const net = doc.netAmount + doc.exemptAmount;
  return doc.dteType === 'NOTA_CREDITO_61' ? -net : net;
}

/** Parte neta (sin IVA) de un cobro, en la misma proporción que el documento. */
export function netOfPayment(payment: Pick<CommissionPayment, 'amount' | 'documentNet' | 'documentTotal'>): number {
  if (payment.documentTotal <= 0) return 0;
  return Math.round(payment.amount * (payment.documentNet / payment.documentTotal));
}

export function commissionFor(base: number, rateBps: number): number {
  return Math.round((Math.max(0, base) * rateBps) / 10_000);
}

/**
 * Comisión por vendedor. Los vendedores sin tasa configurada aparecen con
 * tasa 0 (se ve cuánto vendieron aunque no comisionen).
 */
export function computeCommissions(
  documents: readonly CommissionDocument[],
  payments: readonly CommissionPayment[],
  rates: ReadonlyMap<string, { rateBps: number; basis: CommissionBasis }>
): SellerCommission[] {
  const sellers = new Set<string>();
  for (const doc of documents) if (doc.sellerId) sellers.add(doc.sellerId);
  for (const payment of payments) if (payment.sellerId) sellers.add(payment.sellerId);
  for (const sellerId of rates.keys()) sellers.add(sellerId);

  return [...sellers]
    .map((sellerId) => {
      const rate = rates.get(sellerId) ?? { rateBps: 0, basis: 'ISSUED' as const };
      let base = 0;
      let count = 0;
      if (rate.basis === 'ISSUED') {
        for (const doc of documents) {
          if (doc.sellerId !== sellerId) continue;
          const value = netSale(doc);
          if (value === 0) continue;
          base += value;
          count += 1;
        }
      } else {
        for (const payment of payments) {
          if (payment.sellerId !== sellerId) continue;
          base += netOfPayment(payment);
          count += 1;
        }
      }
      return { sellerId, basis: rate.basis, rateBps: rate.rateBps, base, documents: count, commission: commissionFor(base, rate.rateBps) };
    })
    .sort((a, b) => b.base - a.base);
}

/** "2,5%" a partir de puntos base. */
export function formatRate(rateBps: number): string {
  return `${(rateBps / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
}
