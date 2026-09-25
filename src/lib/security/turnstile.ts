import 'server-only';

import { captureMessage } from '@/lib/observability';

/**
 * Cloudflare Turnstile (verificación anti-bots, sin captcha de imágenes) en
 * los formularios públicos más atacados: login y postulación de candidatas.
 *
 * Se activa solo si están AMBAS variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * (widget del navegador) y `TURNSTILE_SECRET_KEY` (esta verificación). Sin
 * ellas todo funciona como antes, así un despliegue sin configurar no deja a
 * nadie fuera.
 *
 * Criterio ante fallas: si Cloudflare responde que el token NO es válido, se
 * rechaza (falla cerrado). Si Cloudflare no responde (red, timeout, 5xx), se
 * deja pasar y se reporta a observabilidad (falla abierto): una caída de
 * Turnstile no puede impedir que una empresa entre a su ERP, y el rate limit
 * por IP sigue activo detrás.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;
/** Nombre del campo que el widget agrega a los formularios. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
}

export type TurnstileResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

export const TURNSTILE_ERROR_MESSAGE = 'No pudimos verificar que no eres un robot. Recarga la página e inténtalo de nuevo.';

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
  action?: string;
}

/**
 * Verifica el token del widget contra Cloudflare. `expectedAction` evita que
 * un token resuelto en un formulario (p. ej. postulación) se reutilice en otro
 * (login).
 */
export async function verifyTurnstile(token: unknown, ip: string | null, expectedAction: string): Promise<TurnstileResult> {
  if (!isTurnstileEnabled()) return { ok: true, skipped: true };
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, error: TURNSTILE_ERROR_MESSAGE };
  }

  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!.trim(), response: token });
  if (ip) body.set('remoteip', ip);

  let data: SiteverifyResponse;
  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!response.ok) throw new Error(`siteverify HTTP ${response.status}`);
    data = (await response.json()) as SiteverifyResponse;
  } catch (error) {
    captureMessage('Turnstile no respondió; se deja pasar el request', 'warn', {
      module: 'seguridad',
      extra: { action: expectedAction, reason: error instanceof Error ? error.message : 'desconocido' },
    });
    return { ok: true, skipped: true };
  }

  if (!data.success) return { ok: false, error: TURNSTILE_ERROR_MESSAGE };
  if (data.action && data.action !== expectedAction) return { ok: false, error: TURNSTILE_ERROR_MESSAGE };
  return { ok: true };
}
