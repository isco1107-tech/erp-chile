import type { MovementType } from '@prisma/client';

/**
 * Tipos de movimiento de inventario que se pueden filtrar y el nombre con que
 * se muestran. Puro (sin base de datos): lo usan el registro por bodega
 * (`movement-log.service.ts`) y «Exportar datos».
 */

export const LOG_KINDS = ['ALL', 'ARRIVALS', 'ADJUST_IN', 'OUTFLOWS', 'SALES', 'TRANSFERS'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABELS: Record<LogKind, string> = {
  ALL: 'Todos los movimientos',
  ARRIVALS: 'Llegadas de mercadería',
  ADJUST_IN: 'Ajustes de entrada (sobrantes, devoluciones)',
  OUTFLOWS: 'Salidas y mermas',
  SALES: 'Ventas',
  TRANSFERS: 'Traslados',
};

export const KIND_TYPES: Record<Exclude<LogKind, 'ALL'>, MovementType[]> = {
  ARRIVALS: ['PURCHASE_IN'],
  ADJUST_IN: ['ADJUSTMENT_IN'],
  OUTFLOWS: ['ADJUSTMENT_OUT'],
  SALES: ['SALE_OUT'],
  TRANSFERS: ['TRANSFER'],
};

/** Nombre de cada tipo de movimiento tal como se ve en pantallas y archivos. */
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE_IN: 'Llegada',
  ADJUSTMENT_IN: 'Ajuste de entrada',
  SALE_OUT: 'Venta',
  ADJUSTMENT_OUT: 'Salida / merma',
  TRANSFER: 'Traslado',
};

export function isLogKind(value: string | undefined): value is LogKind {
  return (LOG_KINDS as readonly string[]).includes(value ?? '');
}
