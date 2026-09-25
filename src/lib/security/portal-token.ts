import crypto from 'crypto';

/**
 * Enlaces de portal sin cuenta (cliente, trabajador): el token en claro solo
 * existe en el enlace que se entrega; en la base se guarda su SHA-256. Así un
 * respaldo o una fuga de la base no expone enlaces utilizables.
 */
export function newPortalToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPortalToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Forma válida de un token antes de consultar la base. */
export function isPortalTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}
