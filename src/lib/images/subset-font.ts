/**
 * Descarga una fuente de Google Fonts recortada solo a los caracteres que se
 * van a dibujar (`text=`), para que `ImageResponse` (satori) la use en vez de
 * su fuente por defecto. Si Google Fonts no responde, `null`: la imagen se
 * genera igual, con la fuente de reserva — nunca falla por esto.
 */
export async function fetchGoogleFontSubset(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`)).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
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
