import crypto from 'node:crypto';

/**
 * Token público de la boleta con información de impacto (el QR del reverso).
 *
 * Formato: `<companyId>.<salesDocumentId>.<vencimiento base36>.<firma>`.
 * La firma es HMAC-SHA256 truncada a 128 bits, calculada sobre los tres
 * primeros segmentos con una clave DERIVADA de `JWT_SECRET` (mismo criterio
 * que `totp-challenge.ts`: una clave distinta por propósito, así este token
 * jamás sirve como cookie de sesión ni al revés). Se verifica sin base de
 * datos; el servicio igual relee el documento filtrando por la empresa del
 * token. Es corto a propósito: el QR se imprime en papel térmico de 80 mm.
 */

export interface ImpactTokenPayload {
  companyId: string;
  salesDocumentId: string;
}

export interface ImpactTokenOptions {
  /** Secreto base; por defecto `JWT_SECRET`. Solo se inyecta en pruebas. */
  secret?: string;
  /** Instante actual (ms); por defecto `Date.now()`. */
  now?: number;
}

/** Vigencia por defecto: 2 años. Una boleta se consulta mucho después de la compra. */
export const DEFAULT_IMPACT_TOKEN_TTL_DAYS = 730;
const SIGNATURE_BYTES = 16;
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const EXPIRY = /^[0-9a-z]{1,10}$/;

function deriveKey(secret?: string): Buffer {
  const base = secret ?? process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET is not set');
  return crypto.createHash('sha256').update(`${base}:impact-receipt`).digest();
}

/** Días de vigencia: `IMPACT_TOKEN_TTL_DAYS` si es un entero positivo; si no, el valor por defecto. */
export function impactTokenTtlDays(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env.IMPACT_TOKEN_TTL_DAYS);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 3650 ? parsed : DEFAULT_IMPACT_TOKEN_TTL_DAYS;
}

function sign(body: string, key: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(body).digest().subarray(0, SIGNATURE_BYTES);
}

export function signImpactToken(
  payload: ImpactTokenPayload,
  options: ImpactTokenOptions & { ttlDays?: number } = {}
): string {
  if (!SEGMENT.test(payload.companyId) || !SEGMENT.test(payload.salesDocumentId)) {
    throw new Error('Identificadores inválidos para el token de impacto');
  }
  const ttlDays = options.ttlDays ?? impactTokenTtlDays();
  const expiresAt = Math.floor(((options.now ?? Date.now()) + ttlDays * 86_400_000) / 1000);
  const body = `${payload.companyId}.${payload.salesDocumentId}.${expiresAt.toString(36)}`;
  return `${body}.${sign(body, deriveKey(options.secret)).toString('base64url')}`;
}

/** Devuelve el contenido si la firma es válida y no venció; `null` en cualquier otro caso (nunca lanza por un token mal formado). */
export function verifyImpactToken(token: string, options: ImpactTokenOptions = {}): ImpactTokenPayload | null {
  if (typeof token !== 'string' || token.length > 256) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [companyId, salesDocumentId, expiry, signature] = parts;
  if (!SEGMENT.test(companyId) || !SEGMENT.test(salesDocumentId) || !EXPIRY.test(expiry) || !SEGMENT.test(signature)) return null;

  let expected: Buffer;
  try {
    expected = sign(`${companyId}.${salesDocumentId}.${expiry}`, deriveKey(options.secret));
  } catch {
    return null; // sin secreto configurado el token no se puede comprobar: se rechaza
  }
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

  const expiresAt = parseInt(expiry, 36);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= (options.now ?? Date.now())) return null;
  return { companyId, salesDocumentId };
}

/** URL pública que va en el QR. `baseUrl` sin barra final. */
export function impactUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/impacto/${token}`;
}
