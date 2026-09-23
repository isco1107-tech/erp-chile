import crypto from 'crypto';

/**
 * Cifrado en reposo de las credenciales de pasarela de pago por empresa
 * (`CompanySettings.khipuApiCredential`).
 *
 * Mismo esquema que `src/lib/sii/crypto.ts`: AES-256-GCM con separación de
 * dominio sobre el secreto base, para que comprometer esta llave derivada no
 * comprometa la de CAF, TOTP, SII o mensajería aunque compartan secreto.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const secret = process.env.PAYMENTS_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'PAYMENTS_ENCRYPTION_KEY (o TOTP_ENCRYPTION_KEY) no está configurada; sin ella no se puede guardar ni leer la credencial de la pasarela de pago'
    );
  }
  return crypto.createHash('sha256').update(`payment-gateway:${secret}`).digest();
}

/** Cifra una credencial de pasarela. Formato "iv.authTag.ciphertext" en base64. */
export function encryptPaymentCredential(plainValue: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainValue, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buffer) => buffer.toString('base64')).join('.');
}

/** Descifra una credencial de pasarela. GCM lanza si el valor guardado fue alterado. */
export function decryptPaymentCredential(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de credencial de pasarela cifrada');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
