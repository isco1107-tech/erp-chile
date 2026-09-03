import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface SessionPayload extends JWTPayload {
  userId: string;
  id: string;
  role: string;
  email: string;
  companyId?: string;
  companyName?: string;
  /**
   * Empresa "activa" (módulo `hasMultiCompany`, ver `CompanyMembership`).
   * `undefined` = se asume la empresa hogar (`companyId`) — así una sesión
   * emitida antes de este campo existir se sigue comportando exactamente
   * igual que hoy. Nunca se confía en este valor tal cual: `loadContext()`
   * (guards.ts) siempre revalida contra la base que el usuario realmente
   * tenga acceso a esta empresa antes de usarla.
   */
  activeCompanyId?: string;
  /**
   * Solo para enrutado barato en el proxy (edge, sin acceso a Prisma). La
   * autorización real del portal la hace `requireSuperAdmin()` contra la base
   * de datos: un token viejo no debe poder conservar el privilegio.
   */
  isSuperAdmin?: boolean;
  sessionVersion?: number;
  purpose?: 'session';
}

function getKey() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

export async function createSessionToken(user: {
  id: string;
  role: string;
  email: string;
  companyId?: string;
  companyName?: string;
  activeCompanyId?: string;
  isSuperAdmin?: boolean;
  sessionVersion?: number;
}) {
  const key = getKey();
  const token = await new SignJWT({ ...user, userId: user.id, purpose: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(key);
  return token;
}

/**
 * El claim `purpose` es una segunda barrera además de que `totp-challenge.ts`
 * firma con una clave distinta: si algún token de otro propósito llegara a
 * firmarse alguna vez con esta misma clave, igual quedaría rechazado acá.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const key = getKey();
  const { payload } = await jwtVerify<SessionPayload>(token, key);
  if (payload.purpose !== 'session') throw new Error('Token de sesión inválido');
  return payload;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  });
}

/**
 * Los atributos deben coincidir con los de `setSessionCookie`: si difieren,
 * algunos navegadores tratan esto como una cookie distinta y no sobrescriben la
 * de sesión, dejándola viva tras el logout.
 */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

/**
 * En Next 16 `cookies()` es asíncrono: la versión anterior llamaba
 * `cookies().set(...)` de forma síncrona dentro de un try/catch vacío, así que
 * lanzaba `TypeError` y se tragaba el error — el usuario invitado quedaba
 * creado pero sin sesión, y el proxy lo devolvía a /login. No silenciar fallos
 * aquí: si la cookie no se emite, el llamador debe enterarse.
 */
export async function setSessionCookieServer(token: string) {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}

/** Contraparte de `setSessionCookieServer` para Server Actions (`clearSessionCookie` es solo para Route Handlers, que reciben un `NextResponse`). */
export async function clearSessionCookieServer() {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  store.set({
    name: 'session',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}
