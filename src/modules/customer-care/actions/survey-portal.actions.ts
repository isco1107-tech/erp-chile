'use server';

import { headers } from 'next/headers';
import { checkRateLimit, SURVEY_SUBMIT_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { surveyResponseSchema } from '../schema';
import { PublicSurveyError, submitPublicSurvey } from '../services/customer-care.service';

/**
 * Acción pública de la encuesta de satisfacción: sin sesión ERP. El token del
 * enlace ES la autenticación y solo permite contestar ESA encuesta, una vez.
 */

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export async function submitSurveyAction(token: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const ip = getClientIp(await headers()) ?? 'unknown';
    if (!checkRateLimit(`${ip}:${String(token).slice(0, 12)}`, SURVEY_SUBMIT_RATE_LIMIT).allowed) {
      return { success: false, error: 'Demasiados intentos seguidos. Intenta más tarde' };
    }
    const parsed = surveyResponseSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await submitPublicSurvey(String(token), parsed.data);
    if (result.needsFollowUp) {
      // Fuera de la transacción: un aviso es I/O externo y no debe poder deshacer la respuesta.
      try {
        await notifyCompany(result.companyId, {
          severity: 'WARNING',
          title: 'Un cliente tuvo una mala experiencia',
          message: `${result.contactName} respondió la encuesta con satisfacción ${result.csat}/5 y recomendación ${result.nps}/10. Se abrió un seguimiento.`,
          href: '/dashboard/customer-care',
          pushMessage: 'Un cliente respondió la encuesta con una mala nota. Revisa el seguimiento.',
        });
      } catch (error) {
        captureException(error, { module: 'fidelizacion-publico', companyId: result.companyId, extra: { step: 'notify' } });
      }
    }
    return { success: true, data: null, message: '¡Gracias por tu opinión!' };
  } catch (error) {
    if (error instanceof PublicSurveyError) return { success: false, error: error.message };
    captureException(error, { module: 'fidelizacion-publico' });
    return { success: false, error: 'No se pudo registrar tu respuesta. Intenta de nuevo más tarde' };
  }
}
