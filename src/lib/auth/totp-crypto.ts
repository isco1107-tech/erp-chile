import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * `TOTP_ENCRYPTION_KEY` puede ser cualquier string (no tiene que ser
 * exactamente 32 bytes) — se deriva a una clave AES-256 de largo fijo vía
 * SHA-256, mismo motivo que `JWT_SECRET` en session.ts: la operación se
 * repite en cada request y no vale la pena forzar al operador a generar un
 * secreto con el largo exacto.
 */
function getKey(): Buffer {
  const secret = process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) throw new Error('TOTP_ENCRYPTION_KEY is not set');
  return crypto.createHash('sha256').update(secret).digest();
}

/** Cifra el secreto TOTP antes de guardarlo: nunca en texto plano en la base. */
export function encryptTotpSecret(plainSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptTotpSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de secreto TOTP cifrado');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
