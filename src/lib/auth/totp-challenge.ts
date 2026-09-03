import crypto from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Token de vida corta que puentea "credenciales correctas" → "sesión real"
 * mientras se pide el código TOTP. Nunca se manda como cookie (solo en el
 * cuerpo JSON de la respuesta y el siguiente POST).
 *
 * Firmado con una clave DERIVADA de `JWT_SECRET` pero distinta a la que usa
 * `session.ts` — no solo un claim `purpose` como única barrera. Reusar la
 * misma clave que la cookie `session` significaba que este token, pegado a
 * mano como valor de esa cookie, pasaba `jwtVerify` en el proxy igual que
 * una sesión real (mismo secreto, misma firma válida): alguien con
 * credenciales correctas pero sin el segundo factor podía saltarse el 2FA
 * por completo. Con una clave distinta, el token ni siquiera verifica contra
 * `JWT_SECRET` — el claim `purpose` que sigue abajo es una segunda capa, no
 * la única.
 */
interface TotpChallengePayload extends JWTPayload {
  purpose: 'totp_challenge';
  userId: string;
}

function getKey() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:totp-challenge`).digest();
}

export async function createTotpChallengeToken(userId: string): Promise<string> {
  const key = getKey();
  return new SignJWT({ purpose: 'totp_challenge', userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

export async function verifyTotpChallengeToken(token: string): Promise<string> {
  const key = getKey();
  const { payload } = await jwtVerify<TotpChallengePayload>(token, key);
  if (payload.purpose !== 'totp_challenge' || typeof payload.userId !== 'string') {
    throw new Error('Token de verificación inválido o expirado');
  }
  return payload.userId;
}
