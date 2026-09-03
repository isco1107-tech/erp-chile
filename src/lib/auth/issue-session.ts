import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookie } from './session';
import { recordSession } from './sessions';

export interface IssuableUser {
  id: string;
  role: string;
  email: string;
  companyId?: string;
  isSuperAdmin: boolean;
  sessionVersion: number;
}

/**
 * Último paso común a ambos caminos de login (con y sin 2FA): arma el JWT de
 * sesión, registra la fila en `UserSession` y deja la cookie puesta. Vive
 * acá para que `/api/auth/signin` y `/api/auth/verify-totp` no repitan la
 * misma secuencia con el riesgo de que diverjan con el tiempo.
 */
export async function issueSession(user: IssuableUser, req: Request): Promise<NextResponse> {
  let companyName: string | undefined;
  if (user.companyId) {
    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (company) companyName = company.businessName;
  }

  const token = await createSessionToken({
    id: user.id,
    role: user.role,
    email: user.email,
    companyId: user.companyId,
    companyName,
    isSuperAdmin: user.isSuperAdmin,
    sessionVersion: user.sessionVersion,
  });

  if (user.companyId) {
    await recordSession({
      userId: user.id,
      companyId: user.companyId,
      token,
      userAgent: req.headers.get('user-agent'),
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });
  }

  const res = NextResponse.json({ success: true });
  setSessionCookie(res, token);
  return res;
}
