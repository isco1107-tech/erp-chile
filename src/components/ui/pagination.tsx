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

/**
 * Clases de override para que los botones `icon-sm` de `Button` (variant
 * "outline") dejen el estilo cian/HUD que traen por defecto y pasen a los
 * tokens neutros del tema claro. Se hace acá, en vez de tocar
 * `src/components/ui/button.tsx`, porque ese archivo es compartido por
 * decenas de pantallas fuera de alcance (POS, ventas, compras, etc.) que
 * todavía usan el tema oscuro — cambiarlo ahí las afectaría a todas.
 * `cn()` usa `tailwind-merge`, así que estas clases sí ganan sobre las del
 * variant por tratarse del mismo grupo de utilidad (bg-*, border-*, text-*).
 */
const NEUTRAL_ICON_BUTTON =
  'border-border bg-transparent text-muted-foreground shadow-none hover:border-border hover:bg-muted hover:text-foreground';

/** Barra de paginación con selector de filas por página, para el pie de una tabla. */
export function Pagination({ page, pageCount, pageSize, totalItems, onPageChange, onPageSizeChange }: PaginationProps) {
  if (totalItems === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>
          Mostrando {from}–{to} de {totalItems}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Filas por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-md border border-border bg-transparent px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
        <span className="min-w-[6rem] text-center text-xs text-muted-foreground">
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
    </div>
  );
}
