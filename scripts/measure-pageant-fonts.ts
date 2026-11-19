/**
 * Mide las fuentes que puede elegir el micrositio del certamen y genera
 * `src/lib/events/pageant-font-metrics.ts` (altura de la x y ancho promedio
 * de un texto en español, en `em`). Con esa tabla `pageantTypographyCss`
 * compensa una fuente más ancha que la de fábrica (`font-size-adjust`) para
 * que ocupe lo mismo y nada desborde en un teléfono.
 *
 *   npx tsx scripts/measure-pageant-fonts.ts
 *
 * Baja cada fuente de Google Fonts (la misma que autoaloja `next/font`) con
 * `curl`. Las tres «del sistema» del constructor de sitios (Moderna, Clásica,
 * Editorial) no tienen archivo: se miden con su equivalente métrico libre
 * (Arimo ≈ Arial, Tinos ≈ Times, Gelasio ≈ Georgia). Correrlo de nuevo solo
 * hace falta al sumar una fuente a `FONT_OPTIONS`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { measurerFor, parseFontMetrics } from '../src/lib/posters/font-metrics';
import { PAGEANT_FONT_KEYS, type PageantFontKey } from '../src/lib/events/pageant-typography';

const GOOGLE_FAMILY: Record<PageantFontKey, string> = {
  italiana: 'Italiana',
  cormorant: 'Cormorant Garamond',
  karla: 'Karla',
  sans: 'Arimo',
  serif: 'Tinos',
  display: 'Gelasio',
  inter: 'Inter',
  poppins: 'Poppins',
  montserrat: 'Montserrat',
  nunito: 'Nunito',
  raleway: 'Raleway',
  'space-grotesk': 'Space Grotesk',
  josefin: 'Josefin Sans',
  oswald: 'Oswald',
  playfair: 'Playfair Display',
  lora: 'Lora',
  'dm-serif': 'DM Serif Display',
  'dm-sans': 'DM Sans',
  manrope: 'Manrope',
  outfit: 'Outfit',
  jakarta: 'Plus Jakarta Sans',
  'work-sans': 'Work Sans',
  rubik: 'Rubik',
  figtree: 'Figtree',
  quicksand: 'Quicksand',
  merriweather: 'Merriweather',
  'libre-baskerville': 'Libre Baskerville',
  'eb-garamond': 'EB Garamond',
  fraunces: 'Fraunces',
  bebas: 'Bebas Neue',
  syne: 'Syne',
  unbounded: 'Unbounded',
  'instrument-serif': 'Instrument Serif',
  anton: 'Anton',
  cinzel: 'Cinzel',
  abril: 'Abril Fatface',
  caveat: 'Caveat',
  dancing: 'Dancing Script',
};

/** Texto corrido y títulos (minúsculas con algunas mayúsculas y tildes). */
const TEXT_SAMPLE = 'Fiesta de la Primavera Temuco. Postula y sé la próxima reina del certamen: candidatas, diciembre, Valentina Rojas, preguntas frecuentes y auspiciadores.';
/** Etiquetas y títulos en mayúsculas. */
const CAPS_SAMPLE = 'EL CERTAMEN · CANDIDATAS · INSCRIPCIÓN · AUSPICIOS · MISS UNIVERSO · LA GALA';
/** Cifras: cuenta regresiva, precios, votos, años. */
const DIGIT_SAMPLE = '0123456789 $450.000 12:30 2026';

function download(family: string, italic: boolean, weight = 400): ArrayBuffer | null {
  const spec = italic ? `${family.replace(/ /g, '+')}:ital,wght@1,${weight}` : `${family.replace(/ /g, '+')}:wght@${weight}`;
  // Sin «User-Agent» de navegador, Google Fonts responde con TTF (el lector no descomprime WOFF2).
  const css = execFileSync('curl', ['-sS', '-m', '30', `https://fonts.googleapis.com/css2?family=${spec}`], { encoding: 'utf8' });
  const url = /url\((https:[^)]+)\)/.exec(css)?.[1];
  // Una familia de un solo grosor no tiene 700: el navegador la engrosa sin cambiar los anchos.
  if (!url && weight !== 400) return null;
  if (!url) throw new Error(`Sin archivo para ${family}: ${css.slice(0, 200)}`);
  const buffer = execFileSync('curl', ['-sS', '-m', '60', url]);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/** Altura de la x (OS/2 sxHeight, versión ≥ 2) en `em`: lo que usa `font-size-adjust` con un número. */
function xHeight(data: ArrayBuffer): number {
  const view = new DataView(data);
  const numTables = view.getUint16(4);
  let head = -1;
  let os2 = -1;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
    if (tag === 'head') head = view.getUint32(record + 8);
    if (tag === 'OS/2') os2 = view.getUint32(record + 8);
  }
  if (head < 0 || os2 < 0 || view.getUint16(os2) < 2) throw new Error('Fuente sin OS/2 sxHeight');
  return view.getInt16(os2 + 86) / view.getUint16(head + 18);
}

function measure(data: ArrayBuffer) {
  const metrics = parseFontMetrics(data);
  const width = measurerFor(metrics);
  const perChar = (sample: string) => Number((width(sample, 1) / [...sample].length).toFixed(4));
  return { xHeight: Number(xHeight(data).toFixed(4)), text: perChar(TEXT_SAMPLE), caps: perChar(CAPS_SAMPLE), digits: perChar(DIGIT_SAMPLE) };
}

function required(data: ArrayBuffer | null): ArrayBuffer {
  if (!data) throw new Error('Fuente sin archivo');
  return data;
}

const rows: string[] = [];
for (const key of PAGEANT_FONT_KEYS) {
  const m = measure(required(download(GOOGLE_FAMILY[key], false)));
  const boldFile = download(GOOGLE_FAMILY[key], false, 700);
  const b = boldFile ? measure(boldFile) : m;
  rows.push(`  ${/^[a-z]+$/.test(key) ? key : `'${key}'`}: { xHeight: ${m.xHeight}, text: ${m.text}, caps: ${m.caps}, digits: ${m.digits}, bold: { text: ${b.text}, caps: ${b.caps}, digits: ${b.digits} } },`);
  console.log(key.padEnd(18), m, boldFile ? 'negrita' : 'sin negrita', b.text, b.caps);
}
const italic = measure(required(download('Cormorant Garamond', true)));
console.log('cormorant cursiva  ', italic);

const out = `// Generado por scripts/measure-pageant-fonts.ts: no editar a mano.
import type { PageantFontKey } from './pageant-typography';

/**
 * Métricas reales (en \`em\`) de cada fuente que puede elegir el micrositio:
 * altura de la x y ancho promedio por carácter de un texto en español, de
 * uno en mayúsculas y de cifras, en regular y en negrita.
 */
export interface PageantWidths {
  text: number;
  caps: number;
  digits: number;
}

export interface PageantFontMetric extends PageantWidths {
  xHeight: number;
  /** Anchos en negrita (700); una familia sin negrita repite los regulares. */
  bold: PageantWidths;
}

export const PAGEANT_FONT_METRICS: Record<PageantFontKey, PageantFontMetric> = {
${rows.join('\n')}
};

/** Cormorant Garamond en cursiva real (frase principal, palabras destacadas): más angosta que la recta. */
export const CORMORANT_ITALIC_METRIC: PageantFontMetric = { xHeight: ${italic.xHeight}, text: ${italic.text}, caps: ${italic.caps}, digits: ${italic.digits}, bold: { text: ${italic.text}, caps: ${italic.caps}, digits: ${italic.digits} } };
`;
fs.writeFileSync(path.join(process.cwd(), 'src/lib/events/pageant-font-metrics.ts'), out);
console.log('Escrito src/lib/events/pageant-font-metrics.ts');
