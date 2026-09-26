import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionToken, setSessionCookie } from './session';
import { recordSession } from './sessions';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';
import { listAccessibleCompanies, selectableCount } from './accessible-companies';

/** Pantalla donde quien tiene acceso a varias empresas elige en cuál trabajar. */
export const COMPANY_PICKER_PATH = '/seleccionar-empresa';

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
 *
 * La sesión nace en la empresa hogar. Si el usuario puede trabajar en más de
 * una empresa, la respuesta indica `redirectTo: /seleccionar-empresa` para
 * que elija antes de entrar; el cambio lo hace `switchActiveCompanyAction`,
 * que revalida el acceso y reemite la sesión como cualquier cambio de empresa.
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
      ipAddress: getClientIp(req.headers),
    });
  }

  // Si la consulta falla, se entra igual a la empresa hogar: el selector de
  // la barra lateral sigue disponible para cambiar después.
  let redirectTo = '/dashboard';
  if (user.companyId) {
    try {
      if (selectableCount(await listAccessibleCompanies(user.id)) > 1) redirectTo = COMPANY_PICKER_PATH;
    } catch (error) {
      captureException(error, { module: 'auth', userId: user.id, extra: { reason: 'login-company-list' } });
    }
  }

  const res = NextResponse.json({ success: true, data: { redirectTo } });
  setSessionCookie(res, token);
  return res;
}
