import { NextResponse } from 'next/server';
import { loginAction } from '@/modules/auth/actions/login.action';
import { AccountLockedError } from '@/modules/auth/services/auth.service';
import { issueSession } from '@/lib/auth/issue-session';
import { createTotpChallengeToken } from '@/lib/auth/totp-challenge';
import { checkIpAllowlist } from '@/lib/auth/ip-allowlist-guard';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, LOGIN_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { logSecurityEvent, extractRequestInfo } from '@/lib/security/security-logger';
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile';

export async function POST(req: Request) {
  // ── Rate limit por IP: frena credential stuffing multi-cuenta ──────────
  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, LOGIN_RATE_LIMIT);
  if (!rl.allowed) {
    const { userAgent } = extractRequestInfo(req);
    logSecurityEvent({
      type: 'RATE_LIMITED',
      ip: clientIp,
      userAgent,
      metadata: { route: '/api/auth/signin', limit: rl.limit },
    });
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Vuelve a intentar en unos minutos' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  // Endpoint público y sin autenticar: un body malformado no debe convertirse
  // en un 500 con stack trace, sino en un 400 controlado.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }

  const { ip, userAgent } = extractRequestInfo(req);
  // Extraer email para logging ANTES de llamar loginAction (que consume el parsed data)
  const email = typeof body === 'object' && body !== null && 'email' in body ? String((body as Record<string, unknown>).email) : undefined;

  // Cloudflare Turnstile (solo si está configurado): antes de tocar la base,
  // para que un bot no pueda ni siquiera gastar intentos contra una cuenta.
  const turnstileToken = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[TURNSTILE_FIELD] : undefined;
  const human = await verifyTurnstile(turnstileToken, ip, 'login');
  if (!human.ok) {
    logSecurityEvent({ type: 'LOGIN_FAILED', email, ip, userAgent, metadata: { reason: 'turnstile' } });
    return NextResponse.json({ success: false, error: human.error }, { status: 403 });
  }

  let result;
  try {
    result = await loginAction(body);
  } catch (error) {
    if (error instanceof AccountLockedError) {
      logSecurityEvent({ type: 'LOGIN_LOCKED', email, ip, userAgent, metadata: { minutesLeft: error.minutesLeft } });
      return NextResponse.json({ success: false, error: error.message }, { status: 429 });
    }
    throw error;
  }

  if (!result.success) {
    logSecurityEvent({ type: 'LOGIN_FAILED', email, ip, userAgent });
    return NextResponse.json(
      { success: false, error: result.error },
      {
        status: 401,
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
        },
      },
    );
  }

  const ipError = await checkIpAllowlist(result.data.companyId, result.data.isSuperAdmin, extractClientIp(req));
  if (ipError) return NextResponse.json({ success: false, error: ipError }, { status: 403 });

  // Credenciales correctas pero 2FA activo: todavía no se emite sesión real.
  // El cliente recibe un token de vida corta y tiene que completar el
  // segundo paso en /api/auth/verify-totp antes de que exista una cookie.
  if (result.data.totpEnabled) {
    // No logueamos LOGIN_SUCCESS todavía — eso lo hará verify-totp al completar
    const challengeToken = await createTotpChallengeToken(result.data.id);
    return NextResponse.json({ success: true, data: { totpRequired: true, challengeToken } });
  }

  logSecurityEvent({ type: 'LOGIN_SUCCESS', email, ip, userAgent });
  return issueSession(result.data, req);
}
