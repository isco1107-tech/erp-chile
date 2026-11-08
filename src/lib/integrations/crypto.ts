import crypto from 'crypto';
import { decryptWithKeyring, domainKeyring } from '@/lib/security/keyring';

/**
 * Cifrado en reposo de las credenciales de servicios externos que cada empresa
 * conecta por su cuenta (Brevo, ZapSign): `CompanySettings.brevoApiCredential`
 * y `zapsignApiCredential`.
 *
 * Mismo esquema que `src/lib/payments/crypto.ts`: AES-256-GCM con separación de
 * dominio sobre el secreto base, para que comprometer esta llave derivada no
 * comprometa la de CAF, TOTP, SII, pagos o mensajería aunque compartan secreto.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

const KEYS = domainKeyring('company-integrations', ['INTEGRATIONS_ENCRYPTION_KEY', 'TOTP_ENCRYPTION_KEY'], 'INTEGRATIONS_ENCRYPTION_KEY (o TOTP_ENCRYPTION_KEY) no está configurada; sin ella no se puede guardar ni leer una credencial de integración');

function getKey(): Buffer {
  return KEYS.encryptionKey();
}

/** Cifra una credencial. Formato "iv.authTag.ciphertext" en base64. */
export function encryptIntegrationCredential(plainValue: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainValue, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buffer) => buffer.toString('base64')).join('.');
}

/** Descifra una credencial. GCM lanza si el valor guardado fue alterado. */
export function decryptIntegrationCredential(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de credencial de integración cifrada');

  const decrypted = decryptWithKeyring(KEYS, (key) => {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  });
  return decrypted.toString('utf8');
}
