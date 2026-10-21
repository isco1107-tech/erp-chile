/**
 * Descarga una fuente de Google Fonts recortada solo a los caracteres que se
 * van a dibujar (`text=`), para que `ImageResponse` (satori) la use en vez de
 * su fuente por defecto. Si Google Fonts no responde, `null`: la imagen se
 * genera igual, con la fuente de reserva — nunca falla por esto.
 *
 * Las descargas buenas quedan en memoria mientras viva la instancia: al
 * cambiar de color o de formato en la vista previa, el texto es el mismo y
 * la fuente no se vuelve a pedir.
 */
const FONT_CACHE_LIMIT = 80;
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

async function downloadFont(cssUrl: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(cssUrl)).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export function fetchGoogleFontSubset(family: string, text: string, variant: { weight?: number; italic?: boolean } = {}): Promise<ArrayBuffer | null> {
  // Google recorta los espacios de los extremos de `text=`: el espacio va en medio, o la fuente quedaría sin él.
  const unique = Array.from(new Set(Array.from(text))).sort().filter((char) => char.trim() !== '');
  const chars = /\s/.test(text) ? [unique[0] ?? '', ' ', ...unique.slice(1)].join('') : unique.join('');
  const axis = variant.weight !== undefined || variant.italic ? `:ital,wght@${variant.italic ? 1 : 0},${variant.weight ?? 400}` : '';
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${axis}&text=${encodeURIComponent(chars)}`;
  const cached = fontCache.get(cssUrl);
  if (cached) return cached;
  const pending = downloadFont(cssUrl).then((font) => {
    if (!font) fontCache.delete(cssUrl);
    return font;
  });
  if (fontCache.size >= FONT_CACHE_LIMIT) fontCache.delete(fontCache.keys().next().value!);
  fontCache.set(cssUrl, pending);
  return pending;
}

/**
 * Trae una imagen propia (portada, foto) como `data:` URL para incrustarla en
 * una `ImageResponse`: satori no siempre puede resolver una URL externa por
 * su cuenta. Si la descarga falla o el tipo no es una imagen conocida,
 * `null` — la imagen se genera igual, sin ese elemento.
 */
export async function fetchImageAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}
