import crypto from 'crypto';

/**
 * Cifrado en reposo del CAF.
 *
 * El CAF contiene la llave privada RSA con la que se timbra cada documento de
 * su rango: quien la obtiene puede emitir facturas a nombre de la empresa. Por
 * eso el XML nunca se guarda en claro en la base — el mismo criterio que ya se
 * aplica a los secretos TOTP y a la mensajería interna.
 *
 * Sigue el patrón de `src/lib/messaging/crypto.ts`: AES-256-GCM con separación
 * de dominio, de modo que aunque el secreto de origen sea el mismo, la llave
 * derivada es distinta a la de mensajería y a la de TOTP. Así, comprometer una
 * no compromete las otras.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const secret = process.env.DTE_ENCRYPTION_KEY || process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'DTE_ENCRYPTION_KEY (o TOTP_ENCRYPTION_KEY) no está configurada; sin ella no se puede guardar ni leer un CAF'
    );
  }
  return crypto.createHash('sha256').update(`dte-caf:${secret}`).digest();
}

/** Cifra el XML del CAF. Formato "iv.authTag.ciphertext" en base64. */
export function encryptCafXml(plainXml: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainXml, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buffer) => buffer.toString('base64')).join('.');
}

/**
 * Descifra el XML del CAF.
 *
 * GCM autentica además de cifrar: si alguien modificó el registro en la base,
 * `final()` lanza en vez de devolver bytes corruptos que producirían timbres
 * inválidos sin que nadie se entere hasta que el SII los rechace.
 */
export function decryptCafXml(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Formato inválido de CAF cifrado');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
