/**
 * Deriva el set completo de tokens de `.theme-saas-light` (src/app/globals.css)
 * a partir de hasta 3 colores de marca extraídos del logo (`extractBrandPalette`),
 * asignando un ROL de diseño distinto a cada uno en vez de repetir un solo
 * matiz en todos lados:
 *  - el color más oscuro de los 3 → texto (recortado a luminosidad ≤25% SIEMPRE,
 *    sin importar cuán claro viniera, para garantizar contraste real)
 *  - el más vívido (mayor saturación) → acento principal (botones, sidebar)
 *  - el restante → acento secundario (chips, segunda serie de gráfico)
 *
 * Los fondos/superficies (`background/card/popover/muted/border/input`) siguen
 * siendo un único tinte muy claro del matiz del acento principal — mezclar los
 * 3 matices en el fondo se vería "ruidoso" y arriesgaría contraste; la paleta
 * se expresa en texto + acentos + gráficos, no en las superficies base.
 *
 * A propósito NO recolorea los colores semánticos `success/warning/danger/info`
 * (verde=éxito, rojo=error tienen significado propio, no estético) ni fuerza
 * más de 2 colores de gráfico desde la marca — `chart-3..6` completan con la
 * paleta fija de siempre en vez de inventar más tonos sintéticos.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex2(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = ln * 255;
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: hueToRgb(p, q, hn + 1 / 3) * 255,
    g: hueToRgb(p, q, hn) * 255,
    b: hueToRgb(p, q, hn - 1 / 3) * 255,
  };
}

/** Construye un hex directo a partir de matiz/saturación/luminosidad. */
function hslHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s, l }));
}

function channelLuminance(c: number): number {
  const cn = c / 255;
  return cn <= 0.03928 ? cn / 12.92 : ((cn + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** Ratio de contraste WCAG entre dos colores hex (1 a 21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Blanco o negro, el que dé mayor contraste real contra `bgHex`. */
export function pickForeground(bgHex: string): '#ffffff' | '#000000' {
  return contrastRatio(bgHex, '#ffffff') >= contrastRatio(bgHex, '#000000') ? '#ffffff' : '#000000';
}

/** Umbral bajo el cual un color se considera "sin matiz útil" (grises/blanco/negro). */
const MIN_USEFUL_SATURATION = 12;

/** Paleta fija de gráficos de `.theme-saas-light`, usada para completar `chart-3..6` cuando la marca solo aporta 1-2 acentos. */
const FALLBACK_CHART_COLORS = ['#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

interface PaletteEntry {
  hex: string;
  h: number;
  s: number;
  l: number;
}

/**
 * Deriva el subconjunto de tokens de `.theme-saas-light` a sobreescribir para
 * que el panel adopte la paleta del logo. Devuelve `null` si ningún color de
 * `brandHexes` tiene suficiente saturación para verse intencional (logo en
 * blanco y negro / escala de grises) — en ese caso el llamador debe mantener
 * el tema por defecto en vez de forzar una paleta gris "de marca".
 */
export function deriveThemeFromPalette(brandHexes: string[]): Record<string, string> | null {
  const entries: PaletteEntry[] = [];
  for (const hex of brandHexes) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const { h, s, l } = rgbToHsl(rgb);
    if (s < MIN_USEFUL_SATURATION) continue;
    entries.push({ hex, h, s, l });
  }
  if (entries.length === 0) return null;

  // Rol 1: acento principal = el más vívido (mayor saturación).
  const primarySource = entries.reduce((best, e) => (e.s > best.s ? e : best), entries[0]);
  // Rol 2: texto = el más oscuro (menor luminosidad) — recortado a ≤25% SIEMPRE.
  const textSource = entries.reduce((best, e) => (e.l < best.l ? e : best), entries[0]);
  // Rol 3: acento secundario = el que sobra; si solo hay 1-2 colores, reusa el principal.
  const secondarySource = entries.find((e) => e !== primarySource && e !== textSource) ?? primarySource;

  const primary = hslHex(primarySource.h, clamp(primarySource.s, 55, 85), clamp(primarySource.l, 38, 52));
  const primaryForeground = pickForeground(primary);
  const sidebar = hslHex(primarySource.h, clamp(primarySource.s, 40, 70), 10);

  // Texto: conserva el matiz, pero la luminosidad NUNCA supera 25% — es un
  // recorte de seguridad de contraste, no una sugerencia del logo.
  const textColor = hslHex(textSource.h, clamp(textSource.s, 0, 55), Math.min(textSource.l, 25));
  const mutedForeground = hslHex(textSource.h, Math.min(textSource.s, 20), 45);
  const textSecondary = hslHex(textSource.h, Math.min(textSource.s, 15), 32);

  const secondaryAccent = hslHex(secondarySource.h, clamp(secondarySource.s, 55, 85), clamp(secondarySource.l, 30, 45));

  return {
    background: hslHex(primarySource.h, Math.min(primarySource.s, 20), 97),
    foreground: textColor,
    card: hslHex(primarySource.h, Math.min(primarySource.s, 12), 99),
    'card-foreground': textColor,
    popover: hslHex(primarySource.h, Math.min(primarySource.s, 12), 99),
    'popover-foreground': textColor,
    primary,
    'primary-foreground': primaryForeground,
    secondary: hslHex(primarySource.h, Math.min(primarySource.s, 15), 95),
    'secondary-foreground': textColor,
    muted: hslHex(primarySource.h, Math.min(primarySource.s, 15), 95),
    'muted-foreground': mutedForeground,
    accent: hslHex(primarySource.h, Math.min(primarySource.s, 30), 95),
    'accent-foreground': secondaryAccent,
    'accent-soft': hslHex(primarySource.h, Math.min(primarySource.s, 30), 95),
    'accent-hover': secondaryAccent,
    'text-secondary': textSecondary,
    border: hslHex(primarySource.h, Math.min(primarySource.s, 15), 91),
    input: hslHex(primarySource.h, Math.min(primarySource.s, 15), 91),
    ring: primary,
    sidebar,
    'sidebar-foreground': hslHex(primarySource.h, Math.min(primarySource.s, 15), 65),
    'sidebar-primary': primary,
    'sidebar-primary-foreground': primaryForeground,
    'sidebar-ring': primary,
    'chart-1': primary,
    'chart-2': secondaryAccent,
    'chart-3': FALLBACK_CHART_COLORS[0],
    'chart-4': FALLBACK_CHART_COLORS[1],
    'chart-5': FALLBACK_CHART_COLORS[2],
    'chart-6': FALLBACK_CHART_COLORS[3],
  };
}
