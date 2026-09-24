import crypto from 'crypto';

/**
 * Llaves de la API pública. Formato `aek_<48 caracteres base64url>`: 36 bytes
 * aleatorios, así que un SHA-256 simple es suficiente para guardarla (no es
 * una contraseña elegida por una persona; no hay diccionario que probar).
 * Solo se muestra una vez, al crearla; en la base queda el hash y un prefijo
 * visible para reconocerla en la lista.
 */

export const API_KEY_PREFIX = 'aek_';

export const API_SCOPES = {
  'contacts:read': 'Leer clientes y proveedores',
  'contacts:write': 'Crear clientes y proveedores',
  'products:read': 'Leer catálogo y precios',
  'stock:read': 'Leer stock por bodega',
  'sales:read': 'Leer documentos de venta',
  'sales:write': 'Emitir documentos de venta (boletas, facturas)',
  'treasury:read': 'Leer cuentas por cobrar',
  'treasury:write': 'Registrar cobros de documentos',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export const API_SCOPE_KEYS = Object.keys(API_SCOPES) as ApiScope[];

export function isApiScope(value: string): value is ApiScope {
  return Object.prototype.hasOwnProperty.call(API_SCOPES, value);
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `${API_KEY_PREFIX}${crypto.randomBytes(36).toString('base64url')}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashApiKey(plaintext) };
}

/** Extrae la llave de `Authorization: Bearer aek_...` (o `X-Api-Key`). `null` si no viene o no tiene el formato. */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization');
  const candidate = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : (headers.get('x-api-key')?.trim() ?? '');
  if (!candidate.startsWith(API_KEY_PREFIX) || candidate.length < 40 || candidate.length > 100) return null;
  return candidate;
}
