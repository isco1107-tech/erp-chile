import type { ReactNode } from 'react';
import type { BlockOf, BlockType } from '@/lib/web-sites/blocks';
import { resolveIn, type RenderCtx } from '../context';
import { cx } from '../parts';
import SiteLink from '../SiteLink';

export interface SectionProps<T extends BlockType> {
  block: BlockOf<T>;
  ctx: RenderCtx;
  /** Contenido centrado (según la alineación elegida o la natural del tipo). */
  center: boolean;
}

interface ButtonSpec {
  label: string;
  href: string;
}

/** Botón principal y secundario de una sección; un botón sin texto o sin destino válido no se pinta. */
export function ActionButtons({ ctx, center, primary, secondary, className }: { ctx: RenderCtx; center: boolean; primary?: ButtonSpec; secondary?: ButtonSpec; className?: string }) {
  const first = primary?.label ? resolveIn(ctx, primary.href) : null;
  const second = secondary?.label ? resolveIn(ctx, secondary.href) : null;
  if (!first && !second) return null;
  return (
    <div className={cx('mt-8 flex flex-wrap gap-3', center && 'justify-center', className)}>
      {first && primary && (
        <SiteLink ctx={ctx} link={first} className="ws-btn ws-btn-main">
          {primary.label}
        </SiteLink>
      )}
      {second && secondary && (
        <SiteLink ctx={ctx} link={second} className="ws-btn ws-btn-alt">
          {secondary.label}
        </SiteLink>
      )}
    </div>
  );
}

/** Columnas de una cuadrícula: nunca más columnas que elementos. */
export function gridColumns(count: number, wanted: number): string {
  const cols = Math.max(1, Math.min(wanted, count));
  if (cols === 1) return 'grid-cols-1 mx-auto max-w-xl';
  if (cols === 2) return '@md:grid-cols-2';
  if (cols === 3) return '@md:grid-cols-2 @3xl:grid-cols-3';
  return '@md:grid-cols-2 @4xl:grid-cols-4';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

export function Avatar({ name, className, children }: { name: string; className?: string; children?: ReactNode }) {
  return (
    <span aria-hidden="true" className={cx('ws-icon-tile shrink-0 rounded-full font-bold', className)}>
      {children ?? initials(name)}
    </span>
  );
}
