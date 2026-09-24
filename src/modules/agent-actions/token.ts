import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';

/**
 * Token opaco y auto-contenido para el flujo "proponer → confirmar" del
 * asistente: no hay tabla ni sesión de servidor para la ACCIÓN pendiente en
 * sí (el `payload` a ejecutar) — viaja firmado (HMAC-SHA256) en el propio
 * token, exactamente como el resto del chat no persiste nada entre
 * requests. Lo único que sí queda en la base es la marca de "este jti ya se
 * confirmó" (`AgentActionConfirmation`, ver más abajo) — necesaria para que
 * el chequeo de un solo uso funcione entre instancias de servidor distintas.
 *
 * La clave de firma se DERIVA de `JWT_SECRET` vía HKDF (no se usa el secreto
 * crudo como clave HMAC) — separa este uso del de las sesiones/TOTP que
 * también dependen de `JWT_SECRET`, para no acoplar la seguridad de todos
 * esos usos entre sí ni tener que rotarlos todos juntos ante una sospecha.
 *
 * El firmante es el único que puede producir un token válido para un
 * `companyId`/`userId` dados — un cliente no puede fabricar ni alterar el
 * payload (cualquier cambio invalida la firma), y `verifyPendingActionToken`
 * además revisa la expiración y que no se haya usado antes (`jti`) — sin
 * esto, reenviar el mismo token de confirmación dos veces ejecutaría la
 * acción dos veces (ej. un plan de pago duplicado).
 */

export interface PendingActionPayload {
  jti: string;
  actionType: string;
  payload: Record<string, unknown>;
  companyId: string;
  userId: string;
  requiredPermission: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60_000;

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado');
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'agent-action-token', 32));
}

function sign(data: string): string {
  return createHmac('sha256', deriveKey()).update(data).digest('base64url');
}

export function signPendingAction(
  data: Omit<PendingActionPayload, 'expiresAt' | 'jti'>,
  ttlMs: number = DEFAULT_TTL_MS
): string {
  const payload: PendingActionPayload = { ...data, jti: randomUUID(), expiresAt: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = sign(body);
  return `${body}.${signature}`;
}

/** Lanza si el token es inválido, fue alterado, ya expiró, o ya fue confirmado antes. */
export function verifyPendingActionToken(token: string): PendingActionPayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new Error('Token de acción inválido');

  const expectedSignature = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Token de acción inválido');

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as PendingActionPayload;
  if (Date.now() > payload.expiresAt) throw new Error('Esta acción expiró — pídesela de nuevo al asistente');
  return payload;
}

// ─── Marca de "ya confirmado" (un solo uso por token) ────────────────────────
//
// Fila en `AgentActionConfirmation` (tabla compartida en Neon), NO un Map en
// memoria de proceso: bajo Vercel cada instancia serverless tiene su propia
// memoria, así que un `Map` por proceso no detecta que el mismo token ya se
// confirmó en OTRA instancia — el mismo jti podía reusarse ahí y ejecutar la
// acción (que escribe en la base) dos veces. La constraint única
// `@@unique([companyId, jti])` hace el "consumir" atómico entre instancias:
// dos requests concurrentes con el mismo jti solo logran insertar una, la
// otra recibe la violación de unicidad (P2002) sin ninguna coordinación
// adicional.

/**
 * Intenta consumir el `jti` insertando la fila de confirmación en estado
 * `PENDING`, ANTES de ejecutar la acción real — así el propio insert ya
 * bloquea un segundo uso concurrente aunque la ejecución todavía no haya
 * terminado. Devuelve el `id` de la fila para que el llamador la actualice
 * a `SUCCEEDED`/`FAILED` con `recordPendingActionResult` una vez conocido el
 * resultado; `null` si el jti ya había sido consumido antes.
 */
export async function consumePendingActionJti(
  companyId: string,
  jti: string,
  actionType: string
): Promise<string | null> {
  try {
    const confirmation = await prisma.agentActionConfirmation.create({
      data: { companyId, jti, actionType, status: 'PENDING' },
      select: { id: true },
    });
    return confirmation.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) return null;
    throw error;
  }
}

/** Cierra la fila de confirmación con el resultado real de `action.execute`. */
export async function recordPendingActionResult(
  companyId: string,
  confirmationId: string,
  status: 'SUCCEEDED' | 'FAILED',
  resultSummary?: string
): Promise<void> {
  await prisma.agentActionConfirmation.updateMany({
    where: { id: confirmationId, companyId },
    data: { status, resultSummary: resultSummary?.slice(0, 500) },
  });
}
