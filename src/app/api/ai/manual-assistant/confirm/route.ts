import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { checkRateLimit, MANUAL_ASSISTANT_CONFIRM_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getAgentAction } from '@/modules/agent-actions/registry';
import { consumePendingActionJti, verifyPendingActionToken } from '@/modules/agent-actions/token';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Confirma y EJECUTA de verdad una acción que el asistente propuso en
 * `/api/ai/manual-assistant`. El token ya viene validado en su firma/forma
 * en `verifyPendingActionToken`, pero acá se revisa TODO de nuevo contra la
 * sesión actual (companyId, userId, permiso) — defensa en profundidad: la
 * sesión pudo cambiar entre proponer y confirmar (otra empresa activa, un
 * rol cambiado), y un token nunca debe ejecutarse fuera del contexto exacto
 * para el que se firmó.
 */

const requestSchema = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await getAuthContext();

    const rateLimit = checkRateLimit(session.id, MANUAL_ASSISTANT_CONFIRM_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Demasiadas confirmaciones seguidas. Espera un minuto.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Falta el token de la acción' }, { status: 400 });
    }

    let pending;
    try {
      pending = verifyPendingActionToken(parsed.data.token);
    } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Token inválido' }, { status: 400 });
    }

    if (pending.companyId !== session.companyId || pending.userId !== session.id) {
      return NextResponse.json({ success: false, error: 'Esta acción no corresponde a tu sesión actual' }, { status: 403 });
    }

    const action = getAgentAction(pending.actionType);
    if (!action) {
      return NextResponse.json({ success: false, error: 'Acción desconocida' }, { status: 400 });
    }

    if (!session.permissions.includes(pending.requiredPermission as Permission) || !session.permissions.includes(action.requiredPermission)) {
      return NextResponse.json({ success: false, error: 'Ya no tienes permiso para confirmar esta acción' }, { status: 403 });
    }

    // Un solo uso por token: sin esto, reenviar la misma confirmación (doble
    // clic, reintento de red) ejecutaría la acción dos veces — grave en
    // CREATE_PAYMENT_PLAN/MARK_CANDIDATE_ATTENDANCE, que no tienen ninguna
    // restricción única que lo evite a nivel de base de datos.
    if (!consumePendingActionJti(pending.jti)) {
      return NextResponse.json({ success: false, error: 'Esta acción ya fue confirmada antes' }, { status: 409 });
    }

    let result;
    try {
      result = await action.execute(session.companyId, pending.payload);
    } catch (error) {
      // Nunca reenviar un mensaje crudo del driver de base de datos al chat
      // (ver `toFriendlyErrorMessage`) — el catch general de más abajo hace
      // lo mismo para errores de auth/tenant, pero este es el único punto
      // donde puede llegar un error de Prisma real (los `service` reusados
      // por `execute()` sí pueden lanzarlos).
      console.error('Agent action execute failed:', pending.actionType, error);
      return NextResponse.json({ success: false, error: toFriendlyErrorMessage(error) }, { status: 500 });
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: pending.actionType,
      entityId: result.entityId,
      metadata: { viaAgent: true, payload: pending.payload },
    });

    return NextResponse.json({ success: true, data: { message: result.message } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Manual assistant confirm failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo completar la acción' }, { status: 500 });
  }
}
