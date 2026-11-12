/**
 * Panel de trazabilidad: reglas puras que convierten los conteos de la base en
 * «qué atender». Sin base de datos y sin números inventados: una alerta solo
 * existe si el dato que la sostiene existe.
 */

export type AttentionTone = 'danger' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  /** Pantalla donde se resuelve. */
  href: string;
}

export interface OverviewFacts {
  expiredLots: number;
  expiredUnits: number;
  soonLots: number;
  /** Productos con lotes que tienen existencias en «SIN-LOTE». */
  unlotProducts: number;
  unlotUnits: number;
  /** Bodegas/producto donde las series no calzan con el stock. */
  serialMismatches: number;
  overdueOrders: number;
  lostSerials30d: number;
  /** Unidades vendidas en 30 días de productos con serie a las que no se les asignó serie. */
  unassignedSerialSales: number;
  /** Movimientos de venta y compra de los últimos 30 días y cuántos traen documento enlazado. */
  linkableMovements30d: number;
  linkedMovements30d: number;
  expiryDays: number;
}

/** Mínimo de movimientos para opinar sobre el enlace: con pocos, el porcentaje no dice nada. */
export const MIN_MOVEMENTS_FOR_LINK_RATE = 20;
export const LINK_RATE_TARGET = 95;

export function linkRate(linked: number, total: number): number | null {
  if (total < MIN_MOVEMENTS_FOR_LINK_RATE) return null;
  return Math.min(100, Math.round((linked / total) * 1000) / 10);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

const SEVERITY: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };

export function buildAttention(facts: OverviewFacts): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (facts.expiredLots > 0) {
    items.push({
      id: 'expired-lots',
      tone: 'danger',
      title: `${plural(facts.expiredLots, 'lote vencido', 'lotes vencidos')} con saldo`,
      detail: `${plural(facts.expiredUnits, 'unidad', 'unidades')} que no deberían venderse. Retíralas o dalas de baja.`,
      href: '/dashboard/inventory/lots',
    });
  }
  if (facts.soonLots > 0) {
    items.push({
      id: 'soon-lots',
      tone: 'warning',
      title: `${plural(facts.soonLots, 'lote vence', 'lotes vencen')} en ${facts.expiryDays} días`,
      detail: 'Priorízalos en la venta antes de que se pierdan.',
      href: '/dashboard/inventory/lots',
    });
  }
  if (facts.unlotProducts > 0) {
    items.push({
      id: 'unlot',
      tone: 'warning',
      title: `${plural(facts.unlotProducts, 'producto con lotes tiene', 'productos con lotes tienen')} stock sin lote`,
      detail: `${plural(facts.unlotUnits, 'unidad', 'unidades')} en «SIN-LOTE»: si hay un retiro no se sabe de qué proveedor vinieron.`,
      href: '/dashboard/inventory/lots',
    });
  }
  if (facts.serialMismatches > 0) {
    items.push({
      id: 'serial-mismatch',
      tone: 'warning',
      title: `${plural(facts.serialMismatches, 'bodega con series que no calzan', 'bodegas con series que no calzan')} con el stock`,
      detail: 'Hay más o menos series en bodega que unidades en el stock. Revisa las series o el stock.',
      href: '/dashboard/inventory/trazabilidad',
    });
  }
  if (facts.overdueOrders > 0) {
    items.push({
      id: 'overdue-orders',
      tone: 'warning',
      title: `${plural(facts.overdueOrders, 'orden de compra atrasada', 'órdenes de compra atrasadas')}`,
      detail: 'Pasó la fecha esperada y aún no llega completa.',
      href: '/dashboard/purchases/orders',
    });
  }
  if (facts.unassignedSerialSales > 0) {
    items.push({
      id: 'unassigned-serial-sales',
      tone: 'warning',
      title: `${plural(facts.unassignedSerialSales, 'unidad vendida', 'unidades vendidas')} sin serie asignada`,
      detail: 'Son productos que se controlan por serie. Asígnalas en la vista Series (Marcar vendida) para tener su garantía y su recorrido.',
      href: '/dashboard/inventory/trazabilidad',
    });
  }
  if (facts.lostSerials30d > 0) {
    items.push({
      id: 'lost-serials',
      tone: 'info',
      title: `${plural(facts.lostSerials30d, 'serie dada de baja', 'series dadas de baja')} como pérdida en 30 días`,
      detail: 'Revisa qué pasó con cada una en la vista de series.',
      href: '/dashboard/inventory/trazabilidad',
    });
  }
  const rate = linkRate(facts.linkedMovements30d, facts.linkableMovements30d);
  if (rate !== null && rate < LINK_RATE_TARGET) {
    items.push({
      id: 'link-rate',
      tone: 'info',
      title: `${rate.toLocaleString('es-CL')}% de las ventas y llegadas tiene documento enlazado`,
      detail: 'Lo que no tiene documento no se puede seguir hasta el cliente o el proveedor en un retiro de lote.',
      href: '/dashboard/inventory/movements',
    });
  }
  return items.sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone]);
}
