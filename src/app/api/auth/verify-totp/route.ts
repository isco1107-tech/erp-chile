import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { verifyTotpChallengeToken } from '@/lib/auth/totp-challenge';
import { decryptTotpSecret } from '@/lib/auth/totp-crypto';
import { verifyTotpCode } from '@/lib/auth/totp';
import { issueSession } from '@/lib/auth/issue-session';
import { checkIpAllowlist } from '@/lib/auth/ip-allowlist-guard';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { checkRateLimit, TOTP_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { logSecurityEvent, extractRequestInfo } from '@/lib/security/security-logger';

const OPERATIONAL_STATUSES = ['ACTIVE', 'TRIAL'];

const bodySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});

/**
 * Un código de 6 dígitos es fuerza-bruteable dentro de los 5 minutos que vive
 * el challenge token si no hay límite de intentos. El contador vive en el
 * usuario (no en el challenge token, que es efímero y se puede volver a
 * pedir gratis): así, pedir un token nuevo no resetea el bloqueo.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type VerifyOutcome =
  | { kind: 'locked'; minutesLeft: number }
  | { kind: 'invalid' }
  | { kind: 'suspended' }
  | {
      kind: 'valid';
      user: { id: string; role: string; email: string; companyId: string | null; isSuperAdmin: boolean; sessionVersion: number };
    };

/** Intenta el código contra los códigos de respaldo sin usar; consume el primero que calce, de forma atómica. */
async function tryBackupCode(tx: Prisma.TransactionClient, userId: string, code: string): Promise<boolean> {
  const candidates = await tx.totpBackupCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const candidate of candidates) {
    if (await bcrypt.compare(code, candidate.codeHash)) {
      const result = await tx.totpBackupCode.updateMany({ where: { id: candidate.id, usedAt: null }, data: { usedAt: new Date() } });
      if (result.count === 1) return true;
    }
  }
  return false;
}

export async function POST(req: Request) {
  // ── Rate limit por IP: frena brute force de TOTP ──────────────────────
  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, TOTP_RATE_LIMIT);
  if (!rl.allowed) {
    const { userAgent } = extractRequestInfo(req);
    logSecurityEvent({
      type: 'RATE_LIMITED',
      ip: clientIp,
      userAgent,
      metadata: { route: '/api/auth/verify-totp', limit: rl.limit },
    });
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Vuelve a intentar en unos minutos' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 });

  let userId: string;
  try {
    userId = await verifyTotpChallengeToken(parsed.data.challengeToken);
  } catch {
    return NextResponse.json({ success: false, error: 'La verificación expiró. Inicia sesión de nuevo' }, { status: 401 });
  }

  const code = parsed.data.code.trim();
  const { ip, userAgent } = extractRequestInfo(req);

  // Todo el ciclo lectura-de-estado → verificación → registro de intento
  // fallido va dentro de una sola transacción con lock de fila: sin esto,
  // una ráfaga de requests concurrentes podía leer "sin bloqueo" a la vez y
  // probar más de MAX_ATTEMPTS códigos antes de que cualquiera alcanzara a
  // escribir el lockout. Mismo patrón que ya usa el kardex para el PMP.
  const outcome = await prisma.$transaction<VerifyOutcome>(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

    const user = await tx.user.findUnique({ where: { id: userId }, include: { company: { select: { status: true } } } });
    if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
      return { kind: 'invalid' };
    }
    // Mismo corte que verifyCredentials: una empresa suspendida entre el
    // primer y el segundo paso del login no debe terminar de dejar pasar a nadie.
    if (!user.isSuperAdmin && user.company && !OPERATIONAL_STATUSES.includes(user.company.status)) {
      return { kind: 'suspended' };
    }

    if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
      return { kind: 'locked', minutesLeft: Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000) };
    }

    const validTotp = await verifyTotpCode(decryptTotpSecret(user.totpSecret), code);
    const validBackup = !validTotp && (await tryBackupCode(tx, user.id, code));

    if (!validTotp && !validBackup) {
      const attempts = user.totpFailedAttempts + 1;
      await tx.user.update({
        where: { id: user.id },
        data:
          attempts >= MAX_ATTEMPTS
            ? { totpFailedAttempts: 0, totpLockedUntil: new Date(Date.now() + LOCKOUT_MS) }
            : { totpFailedAttempts: attempts },
      });
      return { kind: 'invalid' };
    }

    if (user.totpFailedAttempts > 0 || user.totpLockedUntil) {
      await tx.user.update({ where: { id: user.id }, data: { totpFailedAttempts: 0, totpLockedUntil: null } });
    }

    return {
      kind: 'valid',
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        companyId: user.companyId,
        isSuperAdmin: user.isSuperAdmin,
        sessionVersion: user.sessionVersion,
      },
    };
  }, LOCKING_TX_OPTIONS);

  if (outcome.kind === 'locked') {
    logSecurityEvent({ type: 'TOTP_LOCKED', ip, userAgent, metadata: { minutesLeft: outcome.minutesLeft } });
    return NextResponse.json(
      { success: false, error: `Demasiados intentos fallidos. Vuelve a intentar en ${outcome.minutesLeft} minuto(s)` },
      { status: 429 },
    );
  }
  if (outcome.kind === 'suspended') {
    return NextResponse.json(
      { success: false, error: 'La cuenta de tu empresa no se encuentra activa. Contacta a soporte' },
      { status: 403 },
    );
  }
  if (outcome.kind === 'invalid') {
    logSecurityEvent({ type: 'TOTP_FAILED', ip, userAgent });
    return NextResponse.json({ success: false, error: 'Código incorrecto' }, { status: 401 });
  }

  const ipError = await checkIpAllowlist(outcome.user.companyId, outcome.user.isSuperAdmin, extractClientIp(req));
  if (ipError) return NextResponse.json({ success: false, error: ipError }, { status: 403 });

  logSecurityEvent({ type: 'LOGIN_SUCCESS', email: outcome.user.email, ip, userAgent, metadata: { via: '2fa' } });

  return issueSession(
    { ...outcome.user, companyId: outcome.user.companyId ?? undefined },
    req,
  );
}
