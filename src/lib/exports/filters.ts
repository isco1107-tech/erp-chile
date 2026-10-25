import type { DteType } from '@prisma/client';
import { isLogKind, type LogKind } from '@/lib/inventory/movement-kinds';
import { rangeFromParams, type CalendarDay, type DayRange, type RangePresetId } from './ranges';

/**
 * Filtros de «Exportar datos», leídos de la dirección (pantalla y descarga usan
 * exactamente los mismos, así el archivo trae lo que se ve). Nada se confía de
 * más: lo desconocido cae al valor por defecto y los textos se acotan.
 */

export type ParamReader = (key: string) => string | undefined;

/** Grupos de documentos de venta. `COTIZACION` no entra nunca: no es una venta. */
export const SALES_GROUPS = ['BOLETAS', 'FACTURAS', 'NOTAS', 'GUIAS', 'ALL'] as const;
export type SalesGroup = (typeof SALES_GROUPS)[number];

export const SALES_GROUP_LABELS: Record<SalesGroup, string> = {
  BOLETAS: 'Boletas',
  FACTURAS: 'Facturas',
  NOTAS: 'Notas de crédito y débito',
  GUIAS: 'Guías de despacho',
  ALL: 'Todos los documentos de venta',
};

export const SALES_GROUP_TYPES: Record<SalesGroup, DteType[]> = {
  BOLETAS: ['BOLETA_39', 'BOLETA_EXENTA_41'],
  FACTURAS: ['FACTURA_33', 'FACTURA_EXENTA_34'],
  NOTAS: ['NOTA_CREDITO_61', 'NOTA_DEBITO_56'],
  GUIAS: ['GUIA_DESPACHO_52'],
  ALL: ['BOLETA_39', 'BOLETA_EXENTA_41', 'FACTURA_33', 'FACTURA_EXENTA_34', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56', 'GUIA_DESPACHO_52'],
};

/** Los borradores nunca se exportan: todavía no son un documento. */
export const SALES_STATUSES = ['ISSUED', 'CANCELLED', 'BOTH'] as const;
export type SalesStatusFilter = (typeof SALES_STATUSES)[number];

export const SALES_STATUS_LABELS: Record<SalesStatusFilter, string> = {
  ISSUED: 'Emitidos',
  CANCELLED: 'Anulados',
  BOTH: 'Emitidos y anulados',
};

export interface SalesExportFilter extends DayRange {
  group: SalesGroup;
  status: SalesStatusFilter;
  warehouseId?: string;
  /** Folio, o parte del nombre o del RUT del cliente. */
  q?: string;
}

export interface MovementsExportFilter extends DayRange {
  kind: LogKind;
  /** Sin valor = todas las bodegas. */
  warehouseId?: string;
  /** Producto: nombre, SKU o marca. */
  q?: string;
}

const MAX_TEXT = 80;

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim().slice(0, MAX_TEXT);
  return trimmed || undefined;
}

function oneOf<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return (options as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

export interface ResolvedRange extends DayRange {
  preset: RangePresetId | 'custom';
}

export function readRange(read: ParamReader, today: CalendarDay): ResolvedRange {
  return rangeFromParams({ rango: read('rango'), desde: read('desde'), hasta: read('hasta') }, today);
}

export function readSalesFilter(read: ParamReader, today: CalendarDay): SalesExportFilter {
  const { from, to } = readRange(read, today);
  return {
    from,
    to,
    group: oneOf(SALES_GROUPS, read('tipo'), 'BOLETAS'),
    status: oneOf(SALES_STATUSES, read('estado'), 'ISSUED'),
    warehouseId: text(read('bodega')),
    q: text(read('q')),
  };
}

export function readMovementsFilter(read: ParamReader, today: CalendarDay): MovementsExportFilter {
  const { from, to } = readRange(read, today);
  const kind = read('tipo');
  return {
    from,
    to,
    kind: isLogKind(kind) ? kind : 'ALL',
    warehouseId: text(read('bodega')),
    q: text(read('q')),
  };
}

/** Los mismos filtros como dirección (para el botón de descarga y los enlaces de paginación). */
export function filterQuery(filter: Partial<Record<string, string | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
  return params.toString();
}

/** Parámetros de dirección de un filtro de ventas, con el rango siempre explícito. */
export function salesQuery(filter: SalesExportFilter): string {
  return filterQuery({
    tipo: filter.group,
    estado: filter.status,
    bodega: filter.warehouseId,
    q: filter.q,
    desde: filter.from,
    hasta: filter.to,
    // Sin fechas, la dirección no dice nada y se leería como «este mes»: «todo el historial» se pide con rango=todo.
    ...(filter.from || filter.to ? {} : { rango: 'todo' }),
  });
}

export function movementsQuery(filter: MovementsExportFilter): string {
  return filterQuery({
    tipo: filter.kind === 'ALL' ? undefined : filter.kind,
    bodega: filter.warehouseId,
    q: filter.q,
    desde: filter.from,
    hasta: filter.to,
    ...(filter.from || filter.to ? {} : { rango: 'todo' }),
  });
}
