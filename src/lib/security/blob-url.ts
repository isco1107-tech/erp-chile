/**
 * Allowlist de origen para URLs de archivo que el servidor va a `fetch()` en
 * nombre del usuario (ruta de descarga de documentos de candidata). Sin esto,
 * `documentCreateSchema.fileUrl` acepta cualquier string de un usuario con
 * `candidates:write`, y la ruta de descarga la reenvía tal cual — un SSRF
 * clásico (ej. apuntar a `http://169.254.169.254/...`) usando la propia ruta
 * autenticada como oráculo para exfiltrar contenido interno.
 *
 * Se acepta el dominio legacy de Vercel Blob (archivos subidos antes de la
 * migración a Cloudflare R2, ver `src/lib/storage/blob.ts`) y el host público
 * de R2 configurado en `R2_PUBLIC_URL` — nunca cualquier `https:` arbitrario.
 */
const ALLOWED_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

function r2PublicHost(): string | null {
  if (!process.env.R2_PUBLIC_URL) return null;
  try {
    return new URL(process.env.R2_PUBLIC_URL).host;
  } catch {
    return null;
  }
}

export function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname.endsWith(ALLOWED_BLOB_HOST_SUFFIX)) return true;
    const r2Host = r2PublicHost();
    return r2Host !== null && url.host === r2Host;
  } catch {
    return false;
  }
}
