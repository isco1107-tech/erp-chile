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
  if (!Number.isFinite(inactiveAfterDays) || inactiveAfterDays < 1) return [];
  const byContact = new Map<string, { last: Date; count: number; total: number }>();
  for (const row of rows) {
    if (row.rutClean.startsWith(GENERIC_CONSUMER_RUT_PREFIX)) continue;
    const current = byContact.get(row.contactId);
    if (!current) {
      byContact.set(row.contactId, { last: row.issueDate, count: 1, total: row.totalAmount });
    } else {
      if (row.issueDate > current.last) current.last = row.issueDate;
      current.count += 1;
      current.total += row.totalAmount;
    }
  }
  const result: InactiveCustomer[] = [];
  for (const [contactId, info] of byContact) {
    const daysSince = Math.floor((now.getTime() - info.last.getTime()) / DAY_MS);
    if (daysSince >= inactiveAfterDays) {
      result.push({ contactId, lastPurchaseAt: info.last, daysSince, purchaseCount: info.count, totalSpent: info.total });
    }
  }
  return result.sort((a, b) => b.totalSpent - a.totalSpent || b.daysSince - a.daysSince);
}
