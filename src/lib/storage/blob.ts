/**
 * Reemplazo drop-in de `@vercel/blob` respaldado por Cloudflare R2.
 *
 * Por qué existe: la app usaba Vercel Blob para todo archivo subido (fotos de
 * candidatas, logos, contratos PDF, adjuntos de mensajería, comprobantes de
 * auspicio...). R2 es compatible con la API de S3 y no cobra por salida de
 * datos (egress), así que migrar solo el storage de archivos — sin tocar
 * hosting (sigue en Vercel) ni base de datos (sigue en Neon) — es el cambio
 * de menor riesgo para conseguir más almacenamiento.
 *
 * Por qué mismo nombre de funciones que `@vercel/blob`: los 14 call-sites que
 * subían/borraban archivos usaban exactamente `put(pathname, body, { access,
 * contentType, addRandomSuffix })` y `del(urlOrUrls)`. Replicar esa firma
 * exacta convierte la migración en un cambio de una sola línea por archivo
 * (el `import`), en vez de reescribir cada Route Handler.
 *
 * Periodo de transición: los archivos subidos ANTES de este cambio siguen
 * viviendo en Vercel Blob (sus URLs ya guardadas en la base apuntan ahí, y
 * no se migran solas). `del()` distingue por el dominio de la URL: si es una
 * URL de R2 (`R2_PUBLIC_URL`) borra ahí; si es una URL vieja de Vercel Blob
 * (`*.public.blob.vercel-storage.com`), delega en `@vercel/blob` — que sigue
 * instalado y sigue funcionando mientras `BLOB_READ_WRITE_TOKEN` exista.
 * Así ningún archivo viejo queda huérfano solo por el cambio de proveedor.
 */
import { DeleteObjectCommand, DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { captureException, captureMessage } from '@/lib/observability';

const VERCEL_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export interface PutBlobOptions {
  /** Aceptado por compatibilidad de firma con `@vercel/blob`; ignorado. El
   *  acceso público en R2 lo da la configuración del bucket, no un parámetro
   *  por objeto — pasar `'private'` acá no haría nada. */
  access: 'public';
  contentType: string;
  /** Aceptado por compatibilidad de firma con `@vercel/blob`; esta implementación
   *  siempre respeta el `pathname` tal cual (nunca agrega sufijo aleatorio) —
   *  todos los call-sites actuales ya pasan `false` y construyen un nombre único
   *  ellos mismos (companyId + id + timestamp). */
  addRandomSuffix?: boolean;
}

export interface PutBlobResult {
  url: string;
  pathname: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} — necesaria para subir archivos a Cloudflare R2. Revisa .env.example.`
    );
  }
  return value;
}

let cachedClient: S3Client | null = null;

/** Cliente S3 apuntando al endpoint de R2 de la cuenta, memoizado entre llamadas. */
function r2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return cachedClient;
}

/** Base pública configurada (subdominio r2.dev o dominio propio), sin `/` final. */
function publicBaseUrl(): string {
  return requiredEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
}

/**
 * Igual que `publicBaseUrl()`, pero sin lanzar si `R2_PUBLIC_URL` no está
 * configurada. `del()` la necesita solo para reconocer una URL como "de R2";
 * si el entorno todavía no tiene R2 configurado pero solo hay que borrar
 * archivos legacy de Vercel Blob, esa limpieza no debería depender de una
 * variable de entorno que no pinta nada en ese borrado.
 */
function tryPublicBaseUrl(): string | null {
  const value = process.env.R2_PUBLIC_URL;
  return value ? value.replace(/\/+$/, '') : null;
}

async function toBuffer(body: Blob | Buffer | ArrayBuffer | Uint8Array): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  // `File`/`Blob` del FormData de un Route Handler.
  return Buffer.from(await body.arrayBuffer());
}

/** Sube un archivo a R2 y devuelve su URL pública — misma forma que `put()` de `@vercel/blob`. */
export async function put(
  pathname: string,
  body: Blob | Buffer | ArrayBuffer | Uint8Array,
  options: PutBlobOptions
): Promise<PutBlobResult> {
  const bytes = await toBuffer(body);
  const client = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: requiredEnv('R2_BUCKET_NAME'),
      Key: pathname,
      Body: bytes,
      ContentType: options.contentType,
    })
  );
  return { url: `${publicBaseUrl()}/${pathname}`, pathname };
}

/** Borra uno o varios archivos por URL — misma forma que `del()` de `@vercel/blob`. */
export async function del(urlOrUrls: string | string[]): Promise<void> {
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  if (urls.length === 0) return;

  const base = tryPublicBaseUrl();
  const r2Keys: string[] = [];
  const legacyVercelUrls: string[] = [];

  for (const url of urls) {
    if (base && url.startsWith(`${base}/`)) {
      r2Keys.push(url.slice(base.length + 1));
    } else if (new URL(url).host.endsWith(VERCEL_BLOB_HOST_SUFFIX)) {
      legacyVercelUrls.push(url);
    } else {
      captureMessage(`storage/blob.del: URL con dominio desconocido, se omite: ${url}`, 'warn', {
        module: 'storage.blob',
      });
    }
  }

  if (r2Keys.length > 0) {
    const client = r2Client();
    const Bucket = requiredEnv('R2_BUCKET_NAME');
    if (r2Keys.length === 1) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: r2Keys[0] }));
    } else {
      // DeleteObjects admite hasta 1000 claves por llamada; los borrados de
      // esta app son por candidata/documento individual, muy por debajo del límite.
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: r2Keys.map((Key) => ({ Key })) } }));
    }
  }

  if (legacyVercelUrls.length > 0) {
    try {
      const { del: delVercelBlob } = await import('@vercel/blob');
      await delVercelBlob(legacyVercelUrls);
    } catch (error) {
      captureException(error, {
        module: 'storage.blob',
        extra: { reason: 'no se pudieron borrar archivos legacy en Vercel Blob', urls: legacyVercelUrls },
      });
    }
  }
}
