import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, authErrorMessage } from '@/lib/auth/guards';
import { requireDataAccess } from '@/modules/analytics/access';
import { analyticsSnapshot } from '@/modules/analytics/service';
import { captureException } from '@/lib/observability';
import { checkRateLimit } from '@/lib/security/rate-limiter';

const querySchema = z.object({ module: z.enum(['analytics', 'science']).default('analytics'), days: z.enum(['7', '30', '90']).default('30') }).strict();
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET(request: Request) {
  let companyId: string | undefined;
  try {
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success) return NextResponse.json({ error: 'Selecciona un módulo y un período de 7, 30 o 90 días' }, { status: 400, headers });
    const context = await requireDataAccess(parsed.data.module);
    companyId = context.companyId;
    const limit = checkRateLimit(`${companyId}:${context.id}`, { prefix: 'analytics', limit: 30, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Espera un momento antes de actualizar nuevamente.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    const days = Number(parsed.data.days) as 7 | 30 | 90;
    return NextResponse.json(await analyticsSnapshot(context, parsed.data.module, days), { headers });
  } catch (error) {
    const message = authErrorMessage(error);
    if (message) return NextResponse.json({ error: message }, { status: error instanceof AuthError ? error.status : 403, headers });
    captureException(error, { module: 'analytics', companyId });
    return NextResponse.json({ error: 'No se pudieron actualizar los datos de la empresa. Intenta nuevamente.' }, { status: 500, headers });
  }
}
