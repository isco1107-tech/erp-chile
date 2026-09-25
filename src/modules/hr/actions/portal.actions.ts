'use server';

import { headers } from 'next/headers';
import { checkRateLimit, EMPLOYEE_PORTAL_REQUEST_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { LEAVE_TYPE_LABELS, portalLeaveSchema } from '../schema';
import { hashPortalToken, PortalInputError, requestLeaveFromPortal } from '../services/employee-portal.service';

/**
 * Acción pública del portal del trabajador: sin sesión ERP. El token del
 * enlace personal ES la autenticación; nunca se acepta un id de empresa o de
 * trabajador desde el cliente, todo se resuelve desde el token.
 */

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export async function requestLeaveFromPortalAction(token: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const ip = getClientIp(await headers()) ?? 'unknown';
    const tokenKey = hashPortalToken(String(token)).slice(0, 16);
    if (!checkRateLimit(`${ip}:${tokenKey}`, EMPLOYEE_PORTAL_REQUEST_RATE_LIMIT).allowed) {
      return { success: false, error: 'Demasiadas solicitudes seguidas. Intenta más tarde' };
    }
    const parsed = portalLeaveSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await requestLeaveFromPortal(String(token), parsed.data);
    if (!result) return { success: false, error: 'El enlace ya no es válido. Pide uno nuevo a RR.HH.' };
    void emitWorkflowEvent(result.companyId, 'LEAVE_REQUESTED', {
      requestId: result.request.id,
      employeeName: result.employeeName,
      type: LEAVE_TYPE_LABELS[result.request.type],
      businessDays: result.request.businessDays,
      startDate: result.request.startDate.toISOString().slice(0, 10),
    });
    return { success: true, data: null, message: 'Solicitud enviada: RR.HH. te avisará cuando la revise' };
  } catch (error) {
    // Superficie pública: solo mensajes de negocio pasan; lo inesperado se reporta.
    if (error instanceof PortalInputError) return { success: false, error: error.message };
    captureException(error, { module: 'portal-trabajador' });
    return { success: false, error: 'No se pudo enviar la solicitud. Intenta de nuevo más tarde' };
  }
}
