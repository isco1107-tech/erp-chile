/** Receptores de boleta sin RUT (POS): no son un "cliente" que se pueda llamar. */
const GENERIC_CONSUMER_RUT_PREFIX = '66666666';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurchaseRow {
  contactId: string;
  rutClean: string;
  issueDate: Date;
  totalAmount: number;
}

export interface InactiveCustomer {
  contactId: string;
  lastPurchaseAt: Date;
  daysSince: number;
  purchaseCount: number;
  /** CLP entero: total comprado en el período considerado. */
  totalSpent: number;
}

/**
 * Clientes que compraron alguna vez pero llevan `inactiveAfterDays` o más sin
 * hacerlo. Los más valiosos (mayor total comprado) primero: si hay poco
 * tiempo para llamar, se llama a esos. El consumidor final genérico no cuenta.
 */
export function findInactiveCustomers(rows: PurchaseRow[], now: Date, inactiveAfterDays: number): InactiveCustomer[] {
  const byContact = new Map<string, PurchaseSummary>();
  for (const row of rows) {
    const current = byContact.get(row.contactId);
    if (!current) {
      byContact.set(row.contactId, { contactId: row.contactId, rutClean: row.rutClean, lastPurchaseAt: row.issueDate, purchaseCount: 1, totalSpent: row.totalAmount });
    } else {
      if (row.issueDate > current.lastPurchaseAt) current.lastPurchaseAt = row.issueDate;
      current.purchaseCount += 1;
      current.totalSpent += row.totalAmount;
    }
  }
  return findInactiveFromSummaries([...byContact.values()], now, inactiveAfterDays);
}

/** Compras de un cliente ya agregadas (una fila por cliente, p. ej. un `GROUP BY` en la base). */
export interface PurchaseSummary {
  contactId: string;
  rutClean: string;
  lastPurchaseAt: Date;
  purchaseCount: number;
  totalSpent: number;
}

/**
 * Misma regla que `findInactiveCustomers`, sobre compras ya agregadas por
 * cliente: así la base puede devolver una fila por cliente en vez de todas
 * las ventas de la historia (con 150.000 ventas, el panel de Fidelización
 * tardaba 2 s solo en traerlas — auditoría de estrés 2026-10-05).
 */
export function findInactiveFromSummaries(summaries: PurchaseSummary[], now: Date, inactiveAfterDays: number): InactiveCustomer[] {
  if (!Number.isFinite(inactiveAfterDays) || inactiveAfterDays < 1) return [];
  const result: InactiveCustomer[] = [];
  for (const summary of summaries) {
    if (summary.rutClean.startsWith(GENERIC_CONSUMER_RUT_PREFIX)) continue;
    const daysSince = Math.floor((now.getTime() - summary.lastPurchaseAt.getTime()) / DAY_MS);
    if (daysSince >= inactiveAfterDays) {
      result.push({ contactId: summary.contactId, lastPurchaseAt: summary.lastPurchaseAt, daysSince, purchaseCount: summary.purchaseCount, totalSpent: summary.totalSpent });
    }
  }
  return result.sort((a, b) => b.totalSpent - a.totalSpent || b.daysSince - a.daysSince);
}
