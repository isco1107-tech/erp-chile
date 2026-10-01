import type { CSSProperties, ReactNode } from 'react';
import type { Measurer } from '../font-metrics';
import type { PhotoPosition, PosterContent } from '../pieces';
import type { PosterFormat } from '../formats';
import type { PosterPalette } from '../palettes';
import type { FontRole, PosterStyle } from '../styles';
import { readImageSize } from '@/lib/images/dimensions';
import { fitText, type FitOptions, type FitResult } from '../text-fit';

/**
 * Piezas comunes de dibujo de los estilos. El renderizador (satori, detrás de
 * `ImageResponse`) acepta un subconjunto de CSS: todo nodo con hijos lleva
 * `display: flex`, no hay `conic-gradient` ni `-webkit-text-stroke`, y el
 * texto se dibuja por líneas ya cortadas por `text-fit.ts` (cada línea en
 * `nowrap`), para que el ajuste medido sea exactamente lo que se ve.
 */

export interface PosterTypeKit {
  measure: Record<FontRole, Measurer>;
  font: Record<FontRole, { family: string; weight: number; italic: boolean }>;
}

export interface PosterImages {
  background: string | null;
  portrait: string | null;
  /** Alineado con `hero.tiles` cuando la pieza central es un mosaico. */
  tiles: Array<string | null>;
  /** Logo del estudio (PNG con transparencia), si se subió. */
  logo: string | null;
  /** Logos de auspiciadores que se pudieron cargar, en orden. */
  sponsorLogos: string[];
}

export interface PosterRenderInput {
  content: PosterContent;
  format: PosterFormat;
  style: PosterStyle;
  palette: PosterPalette;
  type: PosterTypeKit;
  images: PosterImages;
  qrDataUrl: string | null;
  /** Si viene, el estilo anota aquí los bloques que no cupieron en el formato (para avisar en el estudio). */
  report?: PosterReport;
}

export interface PosterReport {
  omitted: string[];
}

/** Anota los bloques que el reparto vertical tuvo que dejar fuera. */
export function reportOmitted(report: PosterReport | undefined, stack: Array<{ key: string }>, kept: Set<string>): void {
  if (!report) return;
  for (const block of stack) if (block.key !== 'hero' && !kept.has(block.key) && !report.omitted.includes(block.key)) report.omitted.push(block.key);
}

/** El renderizador falla con una propiedad CSS en `undefined`: se quitan antes de pasarle el estilo. */
export function css(style: Record<string, unknown>): CSSProperties {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as CSSProperties;
}

export function fontOf(type: PosterTypeKit, role: FontRole): CSSProperties {
  const font = type.font[role];
  return { fontFamily: font.family, fontWeight: font.weight, fontStyle: font.italic ? 'italic' : 'normal' };
}

export function fit(type: PosterTypeKit, role: FontRole, text: string, options: FitOptions): FitResult {
  return fitText(text, type.measure[role], options);
}

export interface LinesProps {
  fit: FitResult;
  type: PosterTypeKit;
  role: FontRole;
  color: string;
  /** Degradado del texto (se dibuja recortado a las letras). */
  gradient?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacingEm?: number;
  shadow?: string;
  style?: CSSProperties;
}

/** Texto ya ajustado: una línea por fila, sin que el renderizador vuelva a cortarlo. */
export function Lines({ fit: fitted, type, role, color, gradient, align = 'center', lineHeight = 1.05, letterSpacingEm = 0, shadow, style }: LinesProps) {
  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justify, ...style }}>
      {fitted.lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          style={css({
            display: 'flex',
            whiteSpace: 'pre',
            ...fontOf(type, role),
            fontSize: fitted.fontSize,
            lineHeight,
            height: fitted.fontSize * lineHeight,
            letterSpacing: letterSpacingEm ? `${letterSpacingEm}em` : undefined,
            color: gradient ? 'transparent' : color,
            backgroundImage: gradient,
            backgroundClip: gradient ? 'text' : undefined,
            textShadow: shadow,
          })}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

export function Box({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', ...style }}>{children}</div>;
}

/** Corona de líneas finas, dibujada (no es un glifo: no depende de la fuente). */
export function Crown({ width, color }: { width: number; color: string }) {
  const height = width * 0.62;
  return (
    <svg width={width} height={height} viewBox="0 0 100 62">
      <path d="M8 52 L4 16 L28 34 L50 6 L72 34 L96 16 L92 52 Z" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M10 58 L90 58" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="4" cy="14" r="3.4" fill={color} />
      <circle cx="50" cy="4" r="3.8" fill={color} />
      <circle cx="96" cy="14" r="3.4" fill={color} />
      <circle cx="50" cy="40" r="4.2" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

/** Destello de cuatro puntas. */
export function Sparkle({ size, color, opacity = 1 }: { size: number; color: string; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ opacity }}>
      <path d="M10 0 C10.8 6.5 13.5 9.2 20 10 C13.5 10.8 10.8 13.5 10 20 C9.2 13.5 6.5 10.8 0 10 C6.5 9.2 9.2 6.5 10 0 Z" fill={color} />
    </svg>
  );
}

export function Diamond({ size, color }: { size: number; color: string }) {
  return <div style={{ display: 'flex', width: size, height: size, background: color, transform: 'rotate(45deg)' }} />;
}

export function Arrow({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 40 24">
      <path d="M2 12 H36 M26 2 L37 12 L26 22" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 12.5 L9.5 18 L20 6" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tarjeta blanca con el QR y su indicación: blanca siempre, para que cualquier lector la lea. */
export function QrCard({ src, size, caption, type, ink, radius }: { src: string; size: number; caption: string; type: PosterTypeKit; ink: string; radius: number }) {
  const pad = Math.round(size * 0.09);
  const captionFit = fit(type, 'sansBold', caption.toLocaleUpperCase('es-CL'), {
    maxWidth: size,
    maxLines: 2,
    maxSize: Math.round(size * 0.085),
    minSize: 10,
    letterSpacingEm: 0.08,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: pad, paddingBottom: pad * 0.8, background: '#ffffff', borderRadius: radius }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <Lines fit={captionFit} type={type} role="sansBold" color={ink} letterSpacingEm={0.08} lineHeight={1.2} style={{ marginTop: pad * 0.6 }} />
    </div>
  );
}

/** Alto que ocupa la tarjeta QR para un tamaño de código dado (para el reparto vertical). */
export function qrCardHeight(size: number): number {
  const pad = Math.round(size * 0.09);
  return size + pad * 1.8 + pad * 0.6 + Math.round(size * 0.085) * 1.2 * 2;
}

export function upper(text: string): string {
  return text.toLocaleUpperCase('es-CL');
}

/** Líneas centradas de nombres con separador, a un tamaño dado. */
export function NameLines({ lines, type, role, size, color, separator, separatorColor, lineHeight = 1.35, align = 'center', letterSpacingEm = 0 }: { lines: string[][]; type: PosterTypeKit; role: FontRole; size: number; color: string; separator: string; separatorColor: string; lineHeight?: number; align?: 'left' | 'center'; letterSpacingEm?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'center' }}>
      {lines.map((line, index) => (
        <div key={index} style={css({ display: 'flex', whiteSpace: 'pre', ...fontOf(type, role), fontSize: size, lineHeight, height: size * lineHeight, color, letterSpacing: letterSpacingEm ? `${letterSpacingEm}em` : undefined })}>
          {line.map((item, i) => (
            <div key={i} style={{ display: 'flex' }}>
              {i > 0 && <span style={{ color: separatorColor }}>{separator}</span>}
              <span>{item}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Encuadre vertical de la foto: el que eligió el usuario o el del estilo. */
export function photoObjectPosition(position: PhotoPosition | null, fallback: string): string {
  if (position === 'top') return 'center 0%';
  if (position === 'bottom') return 'center 100%';
  if (position === 'center') return 'center 50%';
  return fallback;
}

/** Imagen contenida (logo): entra completa en la caja, sin recortarse ni deformarse. */
export function ContainedImage({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={width} height={height} style={{ width, height, objectFit: 'contain' }} />
  );
}

/** Alto de la franja de logos de auspiciadores (rótulo + una o dos filas). */
export function sponsorStripHeight(count: number, width: number, u: number): number {
  if (count === 0) return 0;
  const { rows, cellH } = sponsorStripGrid(count, width, u);
  return 18 * u * 1.4 + 12 * u + rows * cellH + (rows - 1) * 12 * u + 28 * u;
}

function sponsorStripGrid(count: number, width: number, u: number) {
  const rows = count > 5 ? 2 : 1;
  const perRow = Math.ceil(count / rows);
  const inner = width - 40 * u;
  const cellW = (inner - (perRow - 1) * 18 * u) / perRow;
  const cellH = Math.min(66 * u, cellW * 0.5);
  return { rows, perRow, cellW, cellH };
}

/**
 * Franja de logos de auspiciadores sobre un panel claro: los logos suelen
 * venir en colores pensados para fondo blanco, y sobre un fondo oscuro un
 * logo negro desaparecería.
 */
export function SponsorStrip({ logos, width, u, type, label, labelColor, panel, radius }: { logos: string[]; width: number; u: number; type: PosterTypeKit; label: string; labelColor: string; panel: string; radius: number }) {
  const { perRow, cellW, cellH } = sponsorStripGrid(logos.length, width, u);
  const rows: string[][] = [];
  for (let i = 0; i < logos.length; i += perRow) rows.push(logos.slice(i, i + perRow));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width, padding: `${12 * u}px ${20 * u}px ${16 * u}px`, background: panel, borderRadius: radius }}>
      <div style={{ display: 'flex', ...fontOf(type, 'sansBold'), fontSize: 18 * u, lineHeight: 1.4, letterSpacing: '0.28em', color: labelColor, marginBottom: 12 * u }}>{label}</div>
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', justifyContent: 'center', gap: 18 * u, marginTop: index === 0 ? 0 : 12 * u }}>
          {row.map((src, i) => (
            <ContainedImage key={i} src={src} width={cellW} height={cellH} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Tamaño con que se dibuja un logo dentro de `maxWidth` × `maxHeight`,
 * respetando su proporción real (leída de la cabecera de la imagen): así un
 * logo alineado a la izquierda queda pegado al margen y no centrado en una
 * caja más ancha que él.
 */
export function logoBox(dataUrl: string, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const size = readImageSize(Uint8Array.from(Buffer.from(base64.slice(0, 200_000), 'base64')));
  if (!size || size.width === 0 || size.height === 0) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) };
}
