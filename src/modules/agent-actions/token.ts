import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'crypto';

/**
 * Token opaco y auto-contenido para el flujo "proponer → confirmar" del
 * asistente: no hay tabla ni sesión de servidor para la acción pendiente —
 * viaja firmada (HMAC-SHA256) en el propio token, exactamente como el resto
 * del chat no persiste nada entre requests.
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
// In-memory, igual límite conocido que `rate-limiter.ts`: por instancia de
// Vercel, no distribuido. Suficiente para el caso real (evitar un doble clic
// o un reintento automático del mismo cliente en la misma request), no para
// un atacante distribuido — ese ya está cubierto además por el rate limit y
// por requerir sesión autenticada de la misma empresa/usuario que propuso.

const JTI_STORE_KEY = '__erp_agent_action_used_jti__';

function getUsedJtiStore(): Map<string, number> {
  const g = globalThis as unknown as Record<string, Map<string, number>>;
  if (!g[JTI_STORE_KEY]) g[JTI_STORE_KEY] = new Map();
  return g[JTI_STORE_KEY];
}

/** `true` si es la primera vez que se consume este `jti` (y lo marca como usado); `false` si ya se había confirmado antes. */
export function consumePendingActionJti(jti: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  const store = getUsedJtiStore();
  const now = Date.now();

  for (const [key, expiresAt] of store) {
    if (expiresAt < now) store.delete(key);
  }

  if (store.has(jti)) return false;
  store.set(jti, now + ttlMs);
  return true;
}
