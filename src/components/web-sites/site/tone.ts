import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import { contrastRatio, type WebSiteTheme } from '@/lib/web-sites/theme';
import { safeImageSrc } from '@/lib/web-sites/urls';

/**
 * "Tonos" de una franja: el fondo y los colores que se derivan de él (texto,
 * texto apagado, líneas, tarjetas, botón). Cada tono es una clase CSS
 * (`ws-tone-*`) que define las variables locales `--s-*`; todo lo que vive
 * dentro las usa, así que el mismo componente se ve bien sobre fondo claro,
 * de color, oscuro o sobre una foto.
 */

export type Tone = 'default' | 'muted' | 'primary' | 'accent' | 'dark';

/** Fondo oscuro fijo del tono "oscuro" y de las fotos con velo. */
export const DARK_BG = '#0f1420';
export const DARK_FG = '#f3f4f6';

/** Contraste mínimo (WCAG, elementos gráficos y texto grande) para usar el color de acento como botón. */
const MIN_ACCENT_CONTRAST = 3;

/**
 * Variables por tema que dependen del contraste entre los colores elegidos:
 * si el acento se pierde sobre el color principal (paleta "Blanco y negro"),
 * el botón sobre ese fondo se invierte en vez de quedar invisible. Todos los
 * valores son referencias a variables ya validadas o literales de esta lista.
 */
export function toneVariables(theme: WebSiteTheme): Record<string, string> {
  const accentOn = (background: string) => contrastRatio(theme.accent, background) >= MIN_ACCENT_CONTRAST;
  const primaryOnAccent = contrastRatio(theme.primary, theme.accent) >= MIN_ACCENT_CONTRAST;
  const onPage = accentOn(theme.background);
  const onPrimary = accentOn(theme.primary);
  const onDark = accentOn(DARK_BG);
  return {
    '--ws-dark': DARK_BG,
    '--ws-on-dark': DARK_FG,
    '--ws-mark-default': onPage ? 'var(--ws-accent)' : 'var(--ws-text)',
    '--ws-btn-default': onPage ? 'var(--ws-accent)' : 'var(--ws-text)',
    '--ws-btn-default-fg': onPage ? 'var(--ws-on-accent)' : 'var(--ws-bg)',
    '--ws-mark-primary': onPrimary ? 'var(--ws-accent)' : 'var(--ws-on-primary)',
    '--ws-btn-primary': onPrimary ? 'var(--ws-accent)' : 'var(--ws-on-primary)',
    '--ws-btn-primary-fg': onPrimary ? 'var(--ws-on-accent)' : 'var(--ws-primary)',
    '--ws-btn-accent': primaryOnAccent ? 'var(--ws-primary)' : 'var(--ws-on-accent)',
    '--ws-btn-accent-fg': primaryOnAccent ? 'var(--ws-on-primary)' : 'var(--ws-accent)',
    '--ws-mark-dark': onDark ? 'var(--ws-accent)' : 'var(--ws-on-dark)',
    '--ws-btn-dark': onDark ? 'var(--ws-accent)' : 'var(--ws-on-dark)',
    '--ws-btn-dark-fg': onDark ? 'var(--ws-on-accent)' : 'var(--ws-dark)',
  };
}

/** Efecto de fondo sobre el color de la franja: degradado de marca (sobre el principal) o tinte suave (sobre el de la página). */
export type SectionFx = 'gradient' | 'soft' | null;

export interface SectionLook {
  tone: Tone;
  /** Foto de fondo (ya validada) o `null`. */
  image: string | null;
  /** Oscurecimiento de la foto, 0–90. */
  overlay: number;
  fx: SectionFx;
}

/** Foto de fondo pedida en el estilo de la sección, si es válida. */
function styleImage(block: WebSiteBlock): string | null {
  return block.style.background === 'image' ? safeImageSrc(block.style.backgroundImage) : null;
}

/**
 * Fondo real de una sección. La portada y el llamado a la acción en banda
 * tienen un fondo propio cuando el estilo queda en "el de la página" (color
 * principal, o la foto de la portada); el resto respeta lo que se eligió.
 */
export function sectionLook(block: WebSiteBlock): SectionLook {
  const overlay = block.style.overlay;
  const background = block.style.background;
  const chosen: Tone = background === 'image' || background === 'gradient' ? 'primary' : background === 'soft' ? 'default' : background;
  const fx: SectionFx = background === 'gradient' ? 'gradient' : background === 'soft' ? 'soft' : null;
  const photo = styleImage(block);
  if (photo) return { tone: 'dark', image: photo, overlay, fx: null };

  if (block.type === 'hero') {
    if (block.variant === 'center' || block.variant === 'full' || block.variant === 'card') {
      const heroPhoto = safeImageSrc(block.imageUrl);
      if (heroPhoto) return { tone: 'dark', image: heroPhoto, overlay, fx: null };
      return { tone: chosen === 'default' && !fx ? 'primary' : chosen, image: null, overlay, fx };
    }
    if (block.variant === 'gradient') return { tone: chosen === 'default' && !fx ? 'primary' : chosen, image: null, overlay, fx: fx ?? (chosen === 'default' ? 'gradient' : null) };
    return { tone: chosen, image: null, overlay, fx };
  }
  if (block.type === 'cta' && block.variant === 'band') return { tone: chosen === 'default' && !fx ? 'accent' : chosen, image: null, overlay, fx };
  if (block.type === 'marquee' && block.variant !== 'big') return { tone: chosen === 'default' && !fx ? 'primary' : chosen, image: null, overlay, fx };
  return { tone: chosen, image: null, overlay, fx };
}

/** Tono del panel de un llamado a la acción en tarjeta: contrasta con la franja que lo rodea. */
export function ctaCardTone(sectionTone: Tone): Tone {
  return sectionTone === 'accent' ? 'primary' : 'accent';
}

export function spacingClass(block: WebSiteBlock): string {
  switch (block.style.spacing) {
    case 'none':
      return 'ws-sp-none';
    case 'sm':
      return 'ws-sp-sm';
    case 'md':
      return 'ws-sp-md';
    case 'lg':
      return 'ws-sp-lg';
    case 'auto':
      if (block.type === 'hero') return block.variant === 'minimal' ? 'ws-sp-md' : 'ws-sp-hero';
      if (block.type === 'divider') return 'ws-sp-none';
      if (block.type === 'marquee') return block.variant === 'big' ? 'ws-sp-sm' : 'ws-sp-xs';
      return 'ws-sp-md';
  }
}

export type Alignment = 'left' | 'center';

/** Alineación real del contenido: la elegida o la natural de cada tipo de sección. */
export function resolveAlign(block: WebSiteBlock): Alignment {
  if (block.style.align !== 'auto') return block.style.align;
  switch (block.type) {
    case 'hero':
      return block.variant === 'center' || block.variant === 'full' || block.variant === 'card' || block.variant === 'gradient' || block.variant === 'stacked' ? 'center' : 'left';
    case 'cta':
      return block.variant === 'split' || block.variant === 'banner' ? 'left' : 'center';
    case 'text':
      return block.variant === 'lead' ? 'center' : 'left';
    case 'stats':
      return block.variant === 'side' ? 'left' : 'center';
    case 'steps':
      return 'center';
    case 'quote':
      return block.variant === 'bar' || block.variant === 'photo' ? 'left' : 'center';
    case 'faq':
      return 'left';
    case 'links':
    case 'marquee':
    case 'comparison':
    case 'beforeafter':
    case 'tabs':
    case 'hours':
    case 'areas':
      return 'center';
    case 'timeline':
      return block.variant === 'alternating' ? 'center' : 'left';
    case 'embed':
      return block.variant === 'split' ? 'left' : 'center';
    case 'posts':
      return 'left';
    case 'pricing':
    case 'logos':
    case 'countdown':
    case 'divider':
      return 'center';
    case 'team':
      return block.variant === 'list' ? 'left' : 'center';
    case 'video':
      return block.variant === 'split' ? 'left' : 'center';
    case 'features':
      return block.variant === 'icons' ? 'center' : 'left';
    case 'gallery':
      return 'left';
    case 'split':
    case 'image':
    case 'testimonials':
    case 'map':
    case 'catalog':
    case 'schedule':
      return 'left';
    case 'pricelist':
      return block.variant === 'menu' ? 'center' : 'left';
    case 'contact':
      return block.variant === 'centered' ? 'center' : 'left';
  }
}

/** Texto del título principal de una sección (`''` si no tiene): decide cuál lleva el `<h1>` de la página. */
export function blockHeadingText(block: WebSiteBlock): string {
  switch (block.type) {
    case 'hero':
    case 'cta':
    case 'links':
      return block.title.trim();
    case 'quote':
    case 'image':
    case 'divider':
    case 'marquee':
      return '';
    default:
      return block.heading.trim();
  }
}
