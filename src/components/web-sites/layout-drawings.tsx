import type { FOOTER_LAYOUTS, FOOTER_STYLES, HeaderLayout, HeaderStyle } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';

/**
 * Dibujos pequeños para elegir el diseño del encabezado y del pie: se entiende
 * de un vistazo sin leer. Solo usan los colores del panel (nunca los del sitio),
 * porque son una guía y no la vista previa.
 */

type FooterLayout = (typeof FOOTER_LAYOUTS)[number];
type FooterStyle = (typeof FOOTER_STYLES)[number];

const bar = 'block rounded-full';

/** Encabezado en miniatura: `layout` cambia la disposición y `style` el fondo. */
export function HeaderDrawing({ layout, style = 'light' }: { layout: HeaderLayout; style?: HeaderStyle }) {
  const onPrimary = style === 'primary' || style === 'dark';
  const strong = onPrimary ? 'bg-primary-foreground' : 'bg-foreground/70';
  const soft = onPrimary ? 'bg-primary-foreground/50' : 'bg-foreground/25';
  return (
    <span className={cn('relative block h-14 w-full overflow-hidden rounded-md border border-border', style === 'transparent' ? 'bg-muted-foreground/30' : 'bg-muted')}>
      <span
        className={cn(
          'block px-2',
          style === 'light' && 'bg-card',
          style === 'primary' && 'bg-primary',
          style === 'dark' && 'bg-foreground',
          style === 'transparent' && 'bg-transparent',
          style === 'floating' && 'mx-1.5 mt-1.5 rounded-full border border-border bg-card shadow-sm',
          layout === 'centered' ? 'py-1.5' : style === 'floating' ? 'py-1' : 'py-2'
        )}
      >
        {layout === 'classic' ? (
          <span className="flex items-center justify-between">
            <span className={cn(bar, 'h-2 w-5', strong)} />
            <span className="flex items-center gap-1">
              <span className={cn(bar, 'h-1 w-3', soft)} />
              <span className={cn(bar, 'h-1 w-3', soft)} />
              <span className={cn(bar, 'h-1 w-3', soft)} />
            </span>
          </span>
        ) : null}
        {layout === 'centered' ? (
          <span className="flex flex-col items-center gap-1">
            <span className={cn(bar, 'h-2 w-5', strong)} />
            <span className="flex items-center gap-1">
              <span className={cn(bar, 'h-1 w-3', soft)} />
              <span className={cn(bar, 'h-1 w-3', soft)} />
              <span className={cn(bar, 'h-1 w-3', soft)} />
            </span>
          </span>
        ) : null}
        {layout === 'split' ? (
          <span className="grid grid-cols-3 items-center">
            <span className="flex items-center gap-1">
              <span className={cn(bar, 'h-1 w-2.5', soft)} />
              <span className={cn(bar, 'h-1 w-2.5', soft)} />
            </span>
            <span className={cn(bar, 'h-2 w-5 justify-self-center', strong)} />
            <span className={cn(bar, 'h-1.5 w-5 justify-self-end bg-accent-foreground/70')} />
          </span>
        ) : null}
        {layout === 'minimal' ? (
          <span className="flex items-center justify-between">
            <span className={cn(bar, 'h-2 w-5', strong)} />
            <span className="flex flex-col gap-0.5">
              <span className={cn(bar, 'h-0.5 w-3', strong)} />
              <span className={cn(bar, 'h-0.5 w-3', strong)} />
              <span className={cn(bar, 'h-0.5 w-3', strong)} />
            </span>
          </span>
        ) : null}
      </span>
      <span className="mx-2 mt-2 block space-y-1">
        <span className={cn(bar, 'h-1.5 w-2/3', style === 'transparent' ? 'bg-card/80' : 'bg-foreground/20')} />
        <span className={cn(bar, 'h-1 w-1/2', style === 'transparent' ? 'bg-card/60' : 'bg-foreground/10')} />
      </span>
    </span>
  );
}

/** Pie en miniatura. */
export function FooterDrawing({ layout, style = 'light' }: { layout: FooterLayout; style?: FooterStyle }) {
  const dark = style === 'dark' || style === 'primary';
  const strong = dark ? 'bg-background/80' : 'bg-foreground/60';
  const soft = dark ? 'bg-background/40' : 'bg-foreground/20';
  return (
    <span className="relative flex h-14 w-full flex-col justify-end overflow-hidden rounded-md border border-border bg-muted">
      <span className="mx-2 mb-1.5 block space-y-1">
        <span className={cn(bar, 'h-1.5 w-1/2 bg-foreground/15')} />
      </span>
      <span className={cn('block px-2 py-1.5', style === 'light' && 'bg-card', style === 'muted' && 'bg-secondary', style === 'dark' && 'bg-foreground', style === 'primary' && 'bg-primary')}>
        {layout === 'simple' || layout === 'centered' ? (
          <span className="flex flex-col items-center gap-1">
            {layout === 'centered' ? <span className={cn('block size-2 rounded-full', strong)} /> : null}
            <span className={cn(bar, 'h-1 w-10', strong)} />
            <span className={cn(bar, 'h-1 w-6', soft)} />
          </span>
        ) : layout === 'big' ? (
          <span className="block space-y-1">
            <span className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((column) => (
                <span key={column} className={cn(bar, 'h-1 w-4/5', soft)} />
              ))}
            </span>
            <span className={cn('block h-3 w-full rounded-[2px]', strong)} />
          </span>
        ) : (
          <span className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((column) => (
              <span key={column} className="block space-y-1">
                <span className={cn(bar, 'h-1 w-4/5', strong)} />
                <span className={cn(bar, 'h-1 w-full', soft)} />
                <span className={cn(bar, 'h-1 w-2/3', soft)} />
              </span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

/** Franja de anuncio en miniatura (tres estilos). */
export function AnnouncementDrawing({ style }: { style: 'accent' | 'primary' | 'dark' }) {
  return (
    <span className="block overflow-hidden rounded-md border border-border bg-muted">
      <span className={cn('flex items-center justify-center gap-1 py-1', style === 'accent' && 'bg-accent-foreground', style === 'primary' && 'bg-primary', style === 'dark' && 'bg-foreground')}>
        <span className={cn(bar, 'h-1 w-10 bg-background/80')} />
        <span className={cn(bar, 'h-1 w-4 bg-background/50')} />
      </span>
      <span className="block h-6 space-y-1 p-2">
        <span className={cn(bar, 'h-1 w-1/2 bg-foreground/20')} />
        <span className={cn(bar, 'h-1 w-1/3 bg-foreground/10')} />
      </span>
    </span>
  );
}
