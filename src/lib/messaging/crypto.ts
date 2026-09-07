import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Cifrado en reposo de la mensajería interna (texto y archivos adjuntos).
 *
 * Usa `MESSAGING_ENCRYPTION_KEY` si está configurada; si no, cae a
 * `TOTP_ENCRYPTION_KEY` (ya está en producción, ver `src/lib/auth/totp-crypto.ts`)
 * con separación de dominio — así el módulo funciona sin exigir una variable
 * de entorno nueva el día uno, pero deriva una llave distinta a la de TOTP
 * aunque el secreto de origen sea el mismo. Se recomienda igual configurar
 * `MESSAGING_ENCRYPTION_KEY` por separado en producción.
 */
function getKey(): Buffer {
  const secret = process.env.MESSAGING_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) throw new Error('MESSAGING_ENCRYPTION_KEY (o TOTP_ENCRYPTION_KEY) no está configurada');
  return crypto.createHash('sha256').update(`messaging:${secret}`).digest();
}

/** Cifra el cuerpo de un mensaje. Formato "iv.authTag.ciphertext" en base64. */
export function encryptMessageText(plainText: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptMessageText(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de mensaje cifrado');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Cifra un archivo completo antes de subirlo a Vercel Blob. El buffer
 * resultante es IV(12) + authTag(16) + ciphertext concatenados — el blob en
 * sí nunca contiene el contenido en claro.
 */
export function encryptFileBuffer(plainBuffer: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptFileBuffer(stored: Buffer): Buffer {
  const iv = stored.subarray(0, IV_BYTES);
  const authTag = stored.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = stored.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
