/**
 * Allowlist de origen para URLs de archivo que el servidor va a `fetch()` en
 * nombre del usuario (ruta de descarga de documentos de candidata). Sin esto,
 * `documentCreateSchema.fileUrl` acepta cualquier string de un usuario con
 * `candidates:write`, y la ruta de descarga la reenvía tal cual — un SSRF
 * clásico (ej. apuntar a `http://169.254.169.254/...`) usando la propia ruta
 * autenticada como oráculo para exfiltrar contenido interno.
 *
 * Solo se acepta el dominio real que usa Vercel Blob para blobs públicos.
 */
const ALLOWED_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith(ALLOWED_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}
