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

/**
 * Referencia a un objeto del bucket PRIVADO de R2 (ver `putPrivate` en
 * `storage/blob.ts`). No es una URL abrible: solo el servidor la resuelve.
 */
export const PRIVATE_REF_PREFIX = 'r2private:///';

export function isPrivateRef(value: string): boolean {
  return privateKeyFromRef(value) !== null;
}

/** Clave del objeto dentro del bucket privado, o `null` si no es una referencia privada válida. */
export function privateKeyFromRef(value: string): string | null {
  if (!value.startsWith(PRIVATE_REF_PREFIX)) return null;
  const key = value.slice(PRIVATE_REF_PREFIX.length);
  return key.length > 0 && !key.split('/').includes('..') ? key : null;
}

/** Valor aceptable como `fileUrl` guardado: URL de nuestro storage público o referencia privada. */
export function isAllowedStoredFile(value: string): boolean {
  return isPrivateRef(value) || isAllowedBlobUrl(value);
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

/**
 * `isAllowedBlobUrl` solo valida el HOST — un archivo de otra candidata o de
 * otra empresa, subido al mismo storage compartido, también lo pasa. Esto
 * verifica además que el PATHNAME empiece con el prefijo que la propia ruta
 * de subida generó (p. ej. `candidates/{companyId}/documents/{candidateId}-`),
 * el mismo dato que ya queda codificado en el nombre del objeto tanto para R2
 * como para blobs legacy de Vercel (mismo pathname detrás de hosts
 * distintos — ver `storage/blob.ts`). Usarlo para cerrar SEG-04: que
 * "asociar" un documento no baste con conocer/copiar la URL de un archivo
 * ajeno.
 */
export function blobPathnameStartsWith(value: string, prefix: string): boolean {
  const privateKey = privateKeyFromRef(value);
  if (privateKey) return privateKey.startsWith(prefix);
  try {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, '').startsWith(prefix);
  } catch {
    return false;
  }
}
