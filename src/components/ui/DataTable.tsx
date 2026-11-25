'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from './pagination';
import { Skeleton } from './skeleton';
import { EmptyState } from './EmptyState';
import { TONE_SOFT_BG, TONE_TEXT, type Tone } from './tone';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export interface DataTablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Acciones al final de cada fila. Omitir si la tabla no tiene acciones. */
  rowActions?: (row: T) => React.ReactNode;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Slots de la barra superior: buscador, chips de filtro, botón exportar. */
  searchSlot?: React.ReactNode;
  filterSlot?: React.ReactNode;
  exportSlot?: React.ReactNode;
  pagination?: DataTablePaginationProps;
  className?: string;
}

/**
 * Tabla genérica de datos con el estilo del brief (sección 4: DataTable). No
 * usa @tanstack/react-table: aunque es una dependencia del proyecto, no hay
 * ningún uso existente en el código y la versión instalada (9.x) tiene una
 * API nueva/no documentada localmente — se optó por una tabla tipada simple
 * en vez de arriesgar una integración a ciegas contra una API desconocida.
 * Si un módulo necesita sorting/filtering con estado complejo más adelante,
 * ahí sí vale la pena adoptar TanStack Table sobre esta base.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  rowActions,
  loading,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  searchSlot,
  filterSlot,
  exportSlot,
  pagination,
  className,
}: DataTableProps<T>) {
  const hasToolbar = Boolean(searchSlot || filterSlot || exportSlot);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollHintId = useId();
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const container = scrollRef.current;
    const table = tableRef.current;
    if (!container || !table) return;
    const observer = new ResizeObserver(() => setOverflowing(container.scrollWidth > container.clientWidth));
    observer.observe(container);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn('min-w-0 rounded-2xl border border-border bg-card shadow-card', className)}>
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
          {searchSlot}
          {filterSlot && <div className="flex flex-wrap items-center gap-2">{filterSlot}</div>}
          {exportSlot && <div className="ml-auto">{exportSlot}</div>}
        </div>
      )}

      {overflowing && (
        <p id={scrollHintId} className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground print:hidden">
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden="true" /> Desplázate para ver más columnas
        </p>
      )}
      <div
        ref={scrollRef}
        role={overflowing ? 'region' : undefined}
        aria-label={overflowing ? 'Tabla con desplazamiento horizontal' : undefined}
        aria-describedby={overflowing ? scrollHintId : undefined}
        tabIndex={overflowing ? 0 : undefined}
        className="overflow-x-auto rounded-[inherit] overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <table ref={tableRef} aria-busy={loading} className="w-full min-w-[30rem] border-collapse text-left md:min-w-[40rem]">
          <thead>
            <tr className="h-11 bg-muted">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    'px-3 text-xs font-semibold text-muted-foreground sm:px-4',
                    column.align === 'right' && 'text-right',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
              {rowActions && <th scope="col" className="w-10 px-3"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr key={rowIndex} className="h-14 border-b border-border">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                  {rowActions && <td className="px-4" />}
                </tr>
              ))}

            {!loading &&
              data.map((row) => (
                <tr key={getRowId(row)} className="h-14 border-b border-border transition-colors last:border-b-0 hover:bg-muted/60 focus-within:bg-muted/60">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn('px-3 py-2 text-sm text-foreground sm:px-4', column.align === 'right' && 'text-right tabular-nums', column.className)}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-3 text-right">{rowActions(row)}</td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && data.length === 0 && (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </div>

      {pagination && !loading && data.length > 0 && (
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}

/** Botón "···" estándar para `rowActions`. El menú desplegable lo arma cada caller (Dropdown/Popover propio). */
export function DataTableRowMenuTrigger({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Más acciones"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 pointer-coarse:size-11',
        className
      )}
    >
      <MoreHorizontal className="size-4" strokeWidth={1.75} />
    </button>
  );
}

/** Celda "identidad" estándar: ícono tintado + título 14/600 + subtítulo 12 muted, para la primera columna. */
export function DataTablePrimaryCell({
  icon: Icon,
  title,
  subtitle,
  tone = 'accent',
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: Tone;
}) {
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', TONE_SOFT_BG[tone])}>
          <Icon className={cn('size-4', TONE_TEXT[tone])} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
