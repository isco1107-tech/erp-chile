import { privateKeyFromRef, PRIVATE_REF_PREFIX } from '@/lib/security/blob-url';
import { del } from '@/lib/storage/blob';
import { quoteIdent, type Tx } from './core';

/**
 * Archivos subidos por una empresa (fotos de productos, adjuntos, logos,
 * respaldos de documentos…): viven en Cloudflare R2 (o en Vercel Blob los más
 * antiguos) y en la base solo queda su dirección. Al ELIMINAR la empresa se
 * buscan esas direcciones en sus filas, ANTES de borrarlas, y después de que la
 * transacción confirme se borran los archivos.
 *
 * Solo se borra lo que es inequívocamente de la empresa: toda subida se guarda
 * como `<carpeta>/<companyId>/…`, así que una dirección sin el id de la empresa
 * en ese lugar (un recurso compartido, una foto de otra empresa copiada por una
 * plantilla) se deja intacta y se cuenta aparte.
 */

const VERCEL_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/** Caracteres que terminan una dirección dentro de un texto, un JSON o un HTML. */
const URL_STOP = String.raw`[:space:]"'\\<>(){}\[\],`;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function r2Host(): string | null {
  try {
    return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).host : null;
  } catch {
    return null;
  }
}

/** Patrón (sintaxis de expresión regular de Postgres) que reconoce una referencia a nuestro almacenamiento. */
export function storedFilePattern(): string {
  const host = r2Host();
  const hosts = [`[^/${URL_STOP}]*${escapeRegex(VERCEL_BLOB_HOST_SUFFIX)}`, ...(host ? [escapeRegex(host)] : [])].join('|');
  return `(https://(?:${hosts})/[^${URL_STOP}]+|${escapeRegex(PRIVATE_REF_PREFIX)}[^${URL_STOP}]+)`;
}

/** ¿Es una dirección de nuestro almacenamiento (público de R2, Vercel Blob antiguo o privado)? */
export function isStoredFileRef(value: string): boolean {
  if (privateKeyFromRef(value)) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = r2Host();
    return url.hostname.endsWith(VERCEL_BLOB_HOST_SUFFIX) || (host !== null && url.host === host);
  } catch {
    return false;
  }
}

/** Ruta del objeto dentro del almacenamiento, o `null` si no es una referencia nuestra. */
export function storedFilePath(ref: string): string | null {
  const privateKey = privateKeyFromRef(ref);
  if (privateKey) return privateKey;
  if (!isStoredFileRef(ref)) return null;
  try {
    return decodeURIComponent(new URL(ref).pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

/** `<carpeta>/<companyId>/…`: la convención de todas las subidas de la aplicación. */
export function belongsToCompany(ref: string, companyId: string): boolean {
  const path = storedFilePath(ref);
  if (!path) return false;
  const segments = path.split('/');
  return segments.length >= 3 && segments[1] === companyId && !segments.includes('..');
}

export interface FileScan {
  /** Direcciones de la empresa, sin repetir: lo que se borra. */
  own: string[];
  /** Direcciones a nuestro almacenamiento que NO llevan el id de la empresa: se dejan. */
  foreign: string[];
}

export function splitRefs(refs: Iterable<string>, companyId: string): FileScan {
  const own = new Set<string>();
  const foreign = new Set<string>();
  for (const ref of refs) {
    if (!isStoredFileRef(ref)) continue;
    (belongsToCompany(ref, companyId) ? own : foreign).add(ref);
  }
  return { own: [...own].sort(), foreign: [...foreign].sort() };
}

/**
 * Busca, en todas las filas de la empresa de las tablas dadas, direcciones a nuestro almacenamiento
 * (en columnas de texto y dentro de JSON: bloques de sitios, contenido de la academia, diseños).
 * Solo lee.
 */
export async function scanStoredFileRefs(db: Tx, tables: readonly string[], companyId: string): Promise<FileScan> {
  const pattern = storedFilePattern();
  const found = new Set<string>();
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe<Array<{ ref: string }>>(
      `SELECT DISTINCT m[1] AS ref FROM ${quoteIdent(table)} t, LATERAL regexp_matches(row_to_json(t)::text, $2, 'g') AS m WHERE t."companyId" = $1`,
      companyId,
      pattern
    );
    for (const row of rows) found.add(row.ref);
  }
  return splitRefs(found, companyId);
}

export interface FileDeletion {
  requested: number;
  deleted: number;
  failed: string[];
}

const CHUNK = 50;

/** Borra los archivos; un lote que falla se reintenta de a uno para saber cuáles no se pudieron. Nunca lanza. */
export async function deleteStoredFiles(refs: readonly string[]): Promise<FileDeletion> {
  const failed: string[] = [];
  let deleted = 0;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    try {
      await del(chunk);
      deleted += chunk.length;
    } catch {
      for (const ref of chunk) {
        try {
          await del(ref);
          deleted += 1;
        } catch {
          failed.push(ref);
        }
      }
    }
  }
  return { requested: refs.length, deleted, failed };
}
