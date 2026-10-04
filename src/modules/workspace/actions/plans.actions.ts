'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { sendEmail } from '@/lib/email/mailer';
import { getSalesEmail } from '@/lib/marketing/sales-lead';
import { buildModuleRequestEmail, moduleRequestSchema, quoteModuleRequest } from '@/lib/pricing/module-request';
import { captureException, captureMessage } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, MODULE_REQUEST_RATE_LIMIT } from '@/lib/security/rate-limiter';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/**
 * Una empresa pide contratar módulos o cambiar de plan. No activa nada: avisa
 * al correo de ventas con la cotización recalculada AQUÍ (el cliente solo
 * manda ids) y deja el rastro en Auditoría. Mismo permiso que el resto de la
 * configuración comercial de la empresa.
 */
export async function requestModulesAction(input: unknown): Promise<ActionResult<{ net: number; total: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;

    const parsed = moduleRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'La solicitud no es válida' };

    const quote = quoteModuleRequest(parsed.data, session.features);
    if (!quote) return { success: false, error: 'Lo que elegiste ya está incluido en tu plan' };

    const limit = checkRateLimit(session.companyId, MODULE_REQUEST_RATE_LIMIT);
    if (!limit.allowed) {
      return { success: false, error: 'Ya enviaste varias solicitudes en la última hora. Tu ejecutivo de Aether las está revisando.' };
    }

    const company = await prisma.company.findFirst({
      where: { id: session.companyId },
      select: { businessName: true, rut: true },
    });
    if (!company) return { success: false, error: 'No se encontró tu empresa' };

    const email = buildModuleRequestEmail(
      quote,
      { businessName: company.businessName, rut: company.rut, userName: session.name, userEmail: session.email },
      parsed.data.message
    );
    const result = await sendEmail({ to: getSalesEmail(), replyTo: session.email, ...email });
    if (result.status === 'failed') {
      captureMessage('plans:solicitud-envio-fallido', 'error', { module: 'workspace', companyId, extra: { provider: result.provider } });
      return { success: false, error: 'No pudimos enviar tu solicitud. Escríbele directamente a tu ejecutivo de Aether.' };
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ModuleRequest',
      entityId: session.companyId,
      metadata: { plan: quote.plan?.id ?? null, modules: quote.items.map((m) => m.id), net: quote.net },
    });

    return {
      success: true,
      data: { net: quote.net, total: quote.total },
      message: 'Solicitud enviada. Tu ejecutivo de Aether te contactará para activar lo que elegiste.',
    };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'workspace', companyId });
    return { success: false, error: 'No se pudo enviar la solicitud' };
  }
}
