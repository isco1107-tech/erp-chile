import type { SupplierPortalRow } from '@/modules/inventory/services/supplier-portal.service';

/** Textos y formatos que comparten las tarjetas del portal del proveedor y del seller. */

export const STATUS: Record<SupplierPortalRow['status'], { label: string }> = {
  OUT: { label: 'Sin stock' },
  LOW: { label: 'Stock bajo' },
  OK: { label: 'Normal' },
};

/** Lo urgente primero: sin stock, luego bajo mínimo, luego el resto por nombre. */
export const URGENCY: Record<SupplierPortalRow['status'], number> = { OUT: 0, LOW: 1, OK: 2 };

export const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });

export function day(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}
