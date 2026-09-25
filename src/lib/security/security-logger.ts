import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { getClientIp } from '@/lib/security/cloudflare';

/**
 * Tipos de evento de seguridad. Suficientemente granulares para alimentar un
 * panel SOC, pero sin exponer credenciales ni datos sensibles.
 */
export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_LOCKED'
  | 'TOTP_SUCCESS'
  | 'TOTP_FAILED'
  | 'TOTP_LOCKED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'RATE_LIMITED'
  | 'SESSION_REVOKED';

interface SecurityEventInput {
  type: SecurityEventType;
  /** Email del usuario afectado. Nunca la contraseña. */
  email?: string;
  /** IP del cliente (ver `getClientIp`: Vercel o Cloudflare verificado). */
  ip?: string | null;
  /** User-Agent del request. */
  userAgent?: string | null;
  /** Datos adicionales sin PII sensible (ej. ruta bloqueada, minutos de lockout). */
  metadata?: Record<string, unknown>;
}

/**
 * Registra un evento de seguridad. Fire-and-forget: nunca debe interrumpir la
 * operación que lo origina, igual que `createAuditLog`. Los fallos de escritura
 * se registran en consola y se descartan.
 *
 * A diferencia de `AuditLog` (bitácora de negocio por tenant), `SecurityEvent`
 * es transversal a toda la plataforma — un intento de login fallido con un
 * email inexistente no pertenece a ningún tenant.
 */
export function logSecurityEvent(input: SecurityEventInput): void {
  // Se usa void + catch en vez de await para no retrasar la respuesta HTTP.
  void prisma.securityEvent
    .create({
      data: {
        type: input.type,
        email: input.email,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
      },
    })
    .catch((error) => {
      captureException(error, { module: 'auth', extra: { reason: 'logSecurityEvent', type: input.type } });
    });
}

/**
 * Extrae IP y User-Agent de un Request, para no repetir esta lógica en cada
 * Route Handler que llame a `logSecurityEvent`.
 */
export function extractRequestInfo(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent');
  return { ip, userAgent };
}
