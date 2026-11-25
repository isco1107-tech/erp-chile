'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './button';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const NEUTRAL_ICON_BUTTON =
  'size-9 border-border bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground pointer-coarse:size-11';

/** Barra de paginación con selector de filas por página, para el pie de una tabla. */
export function Pagination({ page, pageCount, pageSize, totalItems, onPageChange, onPageSizeChange }: PaginationProps) {
  if (totalItems === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-3 text-sm sm:gap-3 sm:px-4">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span role="status">
          Mostrando {from}–{to} de {totalItems}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only sm:not-sr-only">Filas por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-transparent px-2 text-base text-foreground sm:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={NEUTRAL_ICON_BUTTON}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          aria-label="Primera página"
        >
          <ChevronsLeft className="size-3.5" strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={NEUTRAL_ICON_BUTTON}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
        </Button>
        <span className="px-1 text-center text-xs text-muted-foreground">
          Página {page} de {pageCount}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={NEUTRAL_ICON_BUTTON}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-3.5" strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={NEUTRAL_ICON_BUTTON}
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
          aria-label="Última página"
        >
          <ChevronsRight className="size-3.5" strokeWidth={1.75} />
        </Button>
      </div>
    </nav>
  );
}
