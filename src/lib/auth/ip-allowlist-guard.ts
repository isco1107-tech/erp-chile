import { prisma } from '@/lib/prisma';
import { isIpAllowed } from './ip-allowlist';

/**
 * Se llama en TODO camino que termine emitiendo una sesión real (login con
 * contraseña, 2FA, aceptar invitación) con el mismo criterio: si la empresa
 * tiene la lista activa y la IP no matchea, el mensaje es explícito en vez
 * de mezclarse con "credenciales inválidas" — es una política del
 * administrador, no un error del usuario. Toma la IP ya resuelta (no un
 * `Request`) para poder llamarse tanto desde un Route Handler
 * (`extractClientIp(req)`) como desde una Server Action (`headers()` de
 * `next/headers`), que no tienen el mismo objeto de request disponible.
 * El superadmin de plataforma nunca queda bloqueado por la política de una
 * empresa cliente.
 */
export async function checkIpAllowlist(
  companyId: string | null | undefined,
  isSuperAdmin: boolean,
  ip: string | null,
  /**
   * Lista ya leída por el llamador (p.ej. `getAuthContext`, que ya trae la
   * empresa efectiva en la misma consulta memoizada) para no volver a
   * golpear la base en cada request. Si se omite, se consulta acá como
   * siempre lo hizo — mantiene compatibilidad con signin/2FA/invitaciones.
   */
  preloadedSettings?: { ipAllowlistEnabled: boolean; ipAllowlist: string[] } | null
): Promise<string | null> {
  if (!companyId || isSuperAdmin) return null;

  const settings =
    preloadedSettings !== undefined
      ? preloadedSettings
      : await prisma.companySettings.findUnique({
          where: { companyId },
          select: { ipAllowlistEnabled: true, ipAllowlist: true },
        });
  if (!settings?.ipAllowlistEnabled) return null;

  if (!isIpAllowed(ip, settings.ipAllowlist)) {
    return 'Tu dirección IP no tiene acceso autorizado a esta cuenta. Contacta al administrador de tu empresa';
  }
  return null;
}
