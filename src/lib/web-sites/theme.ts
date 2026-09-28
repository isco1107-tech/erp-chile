import { z } from 'zod';

/**
 * Apariencia de un sitio: pocos controles a propósito (dos colores, tipografía,
 * redondeo) para que un sitio armado por alguien sin ojo de diseñador se vea
 * bien igual. Todo valor que llega al CSS sale de una lista cerrada o de un hex
 * validado: el tema nunca puede inyectar CSS arbitrario.
 */

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const FONT_OPTIONS = ['sans', 'serif', 'display'] as const;
export type SiteFont = (typeof FONT_OPTIONS)[number];

export const FONT_STACKS: Record<SiteFont, { label: string; description: string; css: string }> = {
  sans: {
    label: 'Moderna',
    description: 'Limpia y neutra; sirve para casi todo.',
    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  serif: {
    label: 'Clásica',
    description: 'Con serifa; transmite tradición y seriedad.',
    css: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  display: {
    label: 'Editorial',
    description: 'Títulos con más presencia; buena para eventos y marcas personales.',
    css: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  },
};

export const RADIUS_OPTIONS = ['none', 'soft', 'round'] as const;
export type SiteRadius = (typeof RADIUS_OPTIONS)[number];
export const RADIUS_VALUES: Record<SiteRadius, { label: string; px: number }> = {
  none: { label: 'Rectas', px: 0 },
  soft: { label: 'Suaves', px: 10 },
  round: { label: 'Redondeadas', px: 24 },
};

const hex = z.string().regex(HEX_COLOR_RE, 'Color inválido');

export const themeSchema = z.object({
  primary: hex.default('#12161f'),
  accent: hex.default('#a98530'),
  background: hex.default('#ffffff'),
  text: hex.default('#1f2933'),
  font: z.enum(FONT_OPTIONS).default('sans'),
  radius: z.enum(RADIUS_OPTIONS).default('soft'),
  /** Barra superior con el logo y los enlaces a cada sección. */
  showNav: z.boolean().default(true),
  footerText: z.string().trim().max(200).default(''),
});

export type WebSiteTheme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: WebSiteTheme = themeSchema.parse({});

/** Tema guardado → tema completo. Un valor inválido cae al de fábrica, campo por campo. */
export function parseTheme(raw: unknown): WebSiteTheme {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const whole = themeSchema.safeParse(source);
  if (whole.success) return whole.data;
  const fixed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const single = themeSchema.shape[key as keyof typeof themeSchema.shape]?.safeParse(value);
    if (single?.success) fixed[key] = value;
  }
  return themeSchema.parse(fixed);
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Razón de contraste WCAG entre dos colores `#rrggbb` (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  if (!HEX_COLOR_RE.test(a) || !HEX_COLOR_RE.test(b)) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto legible (blanco o casi negro) sobre un fondo dado. */
export function readableOn(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background) ? '#ffffff' : '#111111';
}

/** Variables CSS del tema; se aplican en el contenedor raíz del sitio. */
export function themeVariables(theme: WebSiteTheme): Record<string, string> {
  return {
    '--ws-primary': theme.primary,
    '--ws-on-primary': readableOn(theme.primary),
    '--ws-accent': theme.accent,
    '--ws-on-accent': readableOn(theme.accent),
    '--ws-bg': theme.background,
    '--ws-text': theme.text,
    '--ws-muted': theme.text + 'b3',
    '--ws-radius': `${RADIUS_VALUES[theme.radius].px}px`,
    '--ws-font': FONT_STACKS[theme.font].css,
  };
}

/** Problemas de legibilidad del tema, en español. Vacío si está bien. */
export function themeProblems(theme: WebSiteTheme): string[] {
  const problems: string[] = [];
  if (contrastRatio(theme.text, theme.background) < 4.5) problems.push('El texto casi no se distingue del fondo. Elige un texto más oscuro sobre fondo claro (o al revés).');
  if (contrastRatio(theme.accent, theme.background) < 3) problems.push('El color de acento se pierde sobre el fondo; los botones y títulos destacados costarán de leer.');
  return problems;
}
