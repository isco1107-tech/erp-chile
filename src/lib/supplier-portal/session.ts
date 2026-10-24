import 'server-only';

import crypto from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { SESSION_HOURS, SUPPLIER_SESSION_COOKIE } from './accounts';

/**
 * Sesión del Seller Center (`/proveedor/cuenta`): una cookie propia, firmada con una clave
 * DERIVADA de `JWT_SECRET` y distinta a la del panel (igual que `totp-challenge.ts`). Así un
 * token del proveedor ni siquiera verifica como sesión del panel, y viceversa; el claim
 * `purpose` es una segunda barrera. El token solo dice quién y con qué acceso: en cada página
 * se revalida contra la base (acceso activo, empresa operando, módulo encendido y versión de
 * sesión), así desactivar un acceso o cambiar la contraseña corta la sesión al instante.
 */

export interface SupplierSessionPayload extends JWTPayload {
  purpose: 'supplier_session';
  personId: string;
  membershipId: string;
  sessionVersion: number;
}

function getKey(): Buffer {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:supplier-portal-session`).digest();
}

export async function createSupplierSessionToken(input: { personId: string; membershipId: string; sessionVersion: number }): Promise<string> {
  return new SignJWT({ purpose: 'supplier_session', ...input })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(getKey());
}

export async function verifySupplierSessionToken(token: string): Promise<SupplierSessionPayload | null> {
  try {
    const { payload } = await jwtVerify<SupplierSessionPayload>(token, getKey());
    if (payload.purpose !== 'supplier_session' || typeof payload.personId !== 'string' || typeof payload.membershipId !== 'string' || typeof payload.sessionVersion !== 'number') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Atributos de la cookie: iguales al poner y al borrar, o el navegador las trata como distintas. */
export const SUPPLIER_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_HOURS * 60 * 60,
};

export { SUPPLIER_SESSION_COOKIE };
