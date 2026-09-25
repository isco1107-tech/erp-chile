'use server';

import { headers } from 'next/headers';
import { checkRateLimit, SERVICE_ESTIMATE_DECISION_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { publicEstimateDecisionSchema } from '../schema';
import { decideEstimateFromPortal, PublicServiceError } from '../services/service-tickets.service';

/**
 * Acción pública del seguimiento de servicio técnico: sin sesión ERP. El
 * token del enlace ES la autenticación y solo permite responder el
 * presupuesto de esa orden.
 */

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export async function decideServiceEstimateAction(token: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const ip = getClientIp(await headers()) ?? 'unknown';
    if (!checkRateLimit(`${ip}:${String(token).slice(0, 12)}`, SERVICE_ESTIMATE_DECISION_RATE_LIMIT).allowed) {
      return { success: false, error: 'Demasiados intentos seguidos. Intenta más tarde' };
    }
    const parsed = publicEstimateDecisionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };
    const result = await decideEstimateFromPortal(String(token), parsed.data.approve, parsed.data.comment);
    void emitWorkflowEvent(result.companyId, 'SERVICE_ESTIMATE_DECIDED', { folio: result.folio, approved: parsed.data.approve });
    return {
      success: true,
      data: null,
      message: parsed.data.approve ? '¡Gracias! Presupuesto aprobado: comenzamos la reparación' : 'Registramos tu respuesta: el equipo queda listo para retiro',
    };
  } catch (error) {
    if (error instanceof PublicServiceError) return { success: false, error: error.message };
    captureException(error, { module: 'servicio-tecnico-publico' });
    return { success: false, error: 'No se pudo registrar tu respuesta. Intenta de nuevo más tarde' };
  }
}
