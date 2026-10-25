import Link from 'next/link';
import { Download } from 'lucide-react';
import { RANGE_PRESETS, type RangePresetId } from '@/lib/exports/ranges';

export const FIELD_CLASS = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';

export const BASE_PATH = '/dashboard/exports';

/** Misma pantalla con otros parámetros; lo vacío se omite. */
export function exportsHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `${BASE_PATH}?${query.toString()}`;
}

/** Atajos de fechas: cada uno conserva el resto de los filtros. */
export function RangePresets({ active, hrefFor }: { active: RangePresetId | 'custom'; hrefFor: (preset: RangePresetId) => string }) {
  return (
    <nav aria-label="Atajos de fechas" className="flex flex-wrap gap-2">
      {RANGE_PRESETS.map((preset) => (
        <Link
          key={preset.id}
          href={hrefFor(preset.id)}
          aria-current={active === preset.id ? 'true' : undefined}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium ${active === preset.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
        >
          {preset.label}
        </Link>
      ))}
    </nav>
  );
}

export function DownloadButton({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/40 px-4 text-sm font-medium text-primary-foreground">
        <Download className="size-4" aria-hidden="true" /> {label}
      </span>
    );
  }
  return (
    <a href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
      <Download className="size-4" aria-hidden="true" /> {label}
    </a>
  );
}

/** «Mostrando 1–50 de 1.234» con Anterior / Siguiente. */
export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pages = Math.ceil(total / pageSize);
  const button = 'inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted';
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando {first.toLocaleString('es-CL')}–{last.toLocaleString('es-CL')} de {total.toLocaleString('es-CL')}
      </p>
      <div className="flex gap-2">
        {page > 1 && <Link href={hrefFor(page - 1)} className={button}>Anterior</Link>}
        {page < pages && <Link href={hrefFor(page + 1)} className={button}>Siguiente</Link>}
      </div>
    </div>
  );
}

export function clampPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1;
}
