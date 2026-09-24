import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { checkRateLimit, MANUAL_ASSISTANT_CONFIRM_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getAgentAction } from '@/modules/agent-actions/registry';
import { consumePendingActionJti, recordPendingActionResult, verifyPendingActionToken } from '@/modules/agent-actions/token';
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
    // clic, reintento de red, u otra instancia de servidor con el mismo
    // token) ejecutaría la acción dos veces — grave en
    // CREATE_PAYMENT_PLAN/MARK_CANDIDATE_ATTENDANCE, que no tienen ninguna
    // restricción única que lo evite a nivel de base de datos. La marca vive
    // en `AgentActionConfirmation` (constraint única companyId+jti), no en
    // memoria de proceso, para que funcione entre instancias distintas.
    const confirmationId = await consumePendingActionJti(session.companyId, pending.jti, pending.actionType);
    if (!confirmationId) {
      return NextResponse.json({ success: false, error: 'Esta acción ya fue confirmada antes' }, { status: 409 });
    }

    let result;
    try {
      result = await action.execute(session.companyId, pending.payload);
    } catch (error) {
      await recordResultBestEffort(session.companyId, confirmationId, 'FAILED', toFriendlyErrorMessage(error));
      // Nunca reenviar un mensaje crudo del driver de base de datos al chat
      // (ver `toFriendlyErrorMessage`) — el catch general de más abajo hace
      // lo mismo para errores de auth/tenant, pero este es el único punto
      // donde puede llegar un error de Prisma real (los `service` reusados
      // por `execute()` sí pueden lanzarlos).
      captureException(error, { module: 'agent-actions', companyId: session.companyId, userId: session.id, extra: { actionType: pending.actionType } });
      return NextResponse.json({ success: false, error: toFriendlyErrorMessage(error) }, { status: 500 });
    }

    // La acción ya quedó escrita: nada de lo que sigue puede convertirla en un
    // "falló" para el usuario (lo llevaría a repetirla) ni saltarse la auditoría.
    await recordResultBestEffort(session.companyId, confirmationId, 'SUCCEEDED', result.message);

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
    captureException(error, { module: 'agent-actions' });
    return NextResponse.json({ success: false, error: 'No se pudo completar la acción' }, { status: 500 });
  }
}

/** Registrar el resultado es trazabilidad, no parte de la acción: si falla, se reporta y se sigue. */
async function recordResultBestEffort(
  companyId: string,
  confirmationId: string,
  status: 'SUCCEEDED' | 'FAILED',
  resultSummary: string
): Promise<void> {
  try {
    await recordPendingActionResult(companyId, confirmationId, status, resultSummary);
  } catch (error) {
    captureException(error, { module: 'agent-actions', companyId, extra: { confirmationId, reason: 'record-result' } });
  }
}
