/**
 * Lee el cuerpo de una solicitud como texto con un tope REAL de bytes.
 * `content-length` solo es lo que declara el cliente (y un envío `chunked` no lo
 * trae), así que se cuenta mientras se lee y se corta apenas lo supera: nunca
 * se carga entero en memoria un cuerpo enorme. `null` = demasiado grande.
 */
export async function readTextWithLimit(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
