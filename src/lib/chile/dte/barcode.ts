import 'server-only';
import { toSVG, type RenderOptions } from 'bwip-js/node';
import { tedBarcodePayload } from './ted';

/** Todos los caracteres caben en un byte ISO-8859-1. */
function isLatin1(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

/**
 * Timbre electrónico impreso: el `<TED>` codificado como PDF417, tal como
 * exige el SII en la representación impresa de un DTE.
 *
 * - Nivel de corrección de errores 5 (obligatorio según el formato del SII).
 * - El TED viaja en ISO-8859-1: todos sus caracteres caben en un byte, que es
 *   exactamente lo que bwip-js codifica por cada carácter de la cadena.
 * - Se genera como SVG para que imprima nítido a cualquier escala, sin
 *   depender de la resolución de pantalla.
 *
 * - 14 columnas × rowmult 3: con un TED real (~850-1.000 caracteres) da una
 *   proporción ~2,4:1, que impreso a 8 cm de ancho queda en ~3,3 cm de alto,
 *   dentro del rango del SII (5–9 cm de ancho, 2–4 cm de alto).
 *
 * Devuelve `null` si el TED no se puede codificar fielmente: bwip-js no rechaza
 * caracteres fuera de ISO-8859-1, los codificaría mal en silencio y el timbre
 * impreso no verificaría. Mejor sin código de barras que con uno inválido.
 */
export function tedPdf417DataUri(tedXml: string): string | null {
  const payload = tedBarcodePayload(tedXml);
  if (!isLatin1(payload)) return null;
  try {
    // Las opciones propias del PDF417 (eclevel, columns, rowmult) no están en
    // los tipos de bwip-js, pero sí las acepta en tiempo de ejecución.
    const options: RenderOptions & { eclevel: number; columns: number; rowmult: number } = {
      bcid: 'pdf417',
      text: payload,
      eclevel: 5,
      columns: 14,
      rowmult: 3,
    };
    const svg = toSVG(options);
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  } catch {
    return null;
  }
}
