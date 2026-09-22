import crypto from 'crypto';

/**
 * Cifrado en reposo de las credenciales de la API del SII por empresa.
 *
 * `siiApiKey`/`siiApiSecret` son credenciales de salida (autentican a esta
 * plataforma frente a un servicio externo) — mismo perfil de riesgo que el
 * CAF, no el de un token que nosotros emitimos (como el secreto de webhook
 * n8n). Sigue el patrón de `src/lib/chile/dte/crypto.ts`: AES-256-GCM con
 * separación de dominio, para que comprometer esta llave derivada no
 * comprometa la de CAF, TOTP o mensajería aunque compartan el secreto base.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const secret = process.env.SII_ENCRYPTION_KEY || process.env.DTE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'SII_ENCRYPTION_KEY (o DTE_ENCRYPTION_KEY / TOTP_ENCRYPTION_KEY) no está configurada; sin ella no se puede guardar ni leer una credencial de la API del SII'
    );
  }
  return crypto.createHash('sha256').update(`sii-api:${secret}`).digest();
}

/** Cifra una credencial de la API del SII. Formato "iv.authTag.ciphertext" en base64. */
export function encryptSiiCredential(plainValue: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainValue, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buffer) => buffer.toString('base64')).join('.');
}

/**
 * Descifra una credencial de la API del SII.
 *
 * GCM autentica además de cifrar: si el registro fue alterado en la base,
 * `final()` lanza en vez de devolver una credencial corrupta que fallaría
 * silenciosamente contra la API externa.
 */
export function decryptSiiCredential(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de credencial SII cifrada');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
