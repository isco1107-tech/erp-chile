'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { sendEmail } from '@/lib/email/mailer';
import { captureException } from '@/lib/observability';
import { verifyBrevoSender } from '@/lib/integrations/brevo';
import { verifyZapsignToken } from '@/lib/integrations/zapsign';
import { brevoConfigSchema, zapsignConfigSchema } from '@/lib/integrations/schema';
import {
  getCompanyEmailConfig,
  getCompanyZapsignConfig,
  getIntegrationsStatus,
  setBrevoConfig,
  setZapsignConfig,
  updateBrevoSender,
  updateZapsignMode,
  type IntegrationsStatus,
} from '@/lib/integrations/company-integrations';

/**
 * Conexión de las cuentas propias de la empresa (Brevo, ZapSign). Mueven
 * correo, contratos y costos hacia cuentas de terceros, así que solo con
 * `settings:company` (dueño y administradores). Nunca se audita ni se devuelve
 * una credencial: solo que cambió.
 */

type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

const SETTINGS_PATH = '/dashboard/settings/company';

function failure(error: unknown, fallback: string, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  captureException(error, { module: 'integraciones', companyId });
  return { success: false, error: fallback };
}

export async function getIntegrationsStatusAction(): Promise<ActionResult<IntegrationsStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true, data: await getIntegrationsStatus(session.companyId) };
  } catch (error) {
    return failure(error, 'No se pudo cargar el estado de las integraciones', companyId);
  }
}

export async function saveBrevoConfigAction(input: unknown): Promise<ActionResult<IntegrationsStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = brevoConfigSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { apiKey, fromName, fromAddress } = parsed.data;

    // Sin key nueva se verifica el remitente contra la key ya guardada.
    const keyToVerify = apiKey ?? (await getCompanyEmailConfig(session.companyId))?.apiKey;
    if (!keyToVerify) return { success: false, error: 'Pega la API key de Brevo para conectar tu cuenta' };

    const check = await verifyBrevoSender(keyToVerify, fromAddress);
    if (!check.ok) return { success: false, error: check.error };

    if (apiKey) {
      await setBrevoConfig(session.companyId, { apiKey, fromName, fromAddress });
    } else if (!(await updateBrevoSender(session.companyId, fromName, fromAddress))) {
      return { success: false, error: 'Pega la API key de Brevo para conectar tu cuenta' };
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { change: apiKey ? 'brevo-api-key-guardada' : 'brevo-remitente-actualizado' },
    });
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: await getIntegrationsStatus(session.companyId), message: 'Cuenta de Brevo conectada' };
  } catch (error) {
    return failure(error, 'No se pudo guardar la configuración de Brevo', companyId);
  }
}

export async function disconnectBrevoAction(): Promise<ActionResult<IntegrationsStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    await setBrevoConfig(session.companyId, { apiKey: null, fromName: '', fromAddress: '' });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { change: 'brevo-api-key-eliminada' },
    });
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: await getIntegrationsStatus(session.companyId), message: 'Brevo desconectado. Los correos vuelven a salir por la cuenta de la plataforma.' };
  } catch (error) {
    return failure(error, 'No se pudo desconectar Brevo', companyId);
  }
}

/** Correo de prueba al propio usuario, por la cuenta de la empresa (nunca por la de la plataforma). */
export async function sendBrevoTestEmailAction(): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    if (!(await getCompanyEmailConfig(session.companyId))) {
      return { success: false, error: 'Conecta primero tu cuenta de Brevo para enviar una prueba' };
    }
    const delivery = await sendEmail({
      to: session.email,
      companyId: session.companyId,
      subject: 'Prueba de correo — tu cuenta de Brevo está conectada',
      html: '<p>Si lees esto, tu cuenta de Brevo está conectada y los correos de tu empresa saldrán desde este remitente.</p>',
      text: 'Si lees esto, tu cuenta de Brevo está conectada y los correos de tu empresa saldrán desde este remitente.',
    });
    if (delivery.status !== 'sent') {
      return { success: false, error: 'Brevo no aceptó el envío. Revisa que la API key siga vigente y que el remitente esté verificado.' };
    }
    return { success: true, data: null, message: `Correo de prueba enviado a ${session.email}` };
  } catch (error) {
    return failure(error, 'No se pudo enviar el correo de prueba', companyId);
  }
}

export async function saveZapsignConfigAction(input: unknown): Promise<ActionResult<IntegrationsStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = zapsignConfigSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { token, sandbox } = parsed.data;

    // Se verifica contra ZapSign, en el entorno elegido: con el token nuevo o, si solo cambia el modo, con el ya guardado.
    const tokenToVerify = token ?? (await getCompanyZapsignConfig(session.companyId))?.token;
    if (!tokenToVerify) return { success: false, error: 'Pega el token de ZapSign para conectar tu cuenta' };
    const check = await verifyZapsignToken(tokenToVerify, sandbox);
    if (!check.ok) return { success: false, error: check.error };

    if (token) {
      await setZapsignConfig(session.companyId, { token, sandbox });
    } else if (!(await updateZapsignMode(session.companyId, sandbox))) {
      return { success: false, error: 'Pega el token de ZapSign para conectar tu cuenta' };
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { change: token ? 'zapsign-token-guardado' : 'zapsign-modo-actualizado', sandbox },
    });
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: await getIntegrationsStatus(session.companyId), message: 'Cuenta de ZapSign conectada' };
  } catch (error) {
    return failure(error, 'No se pudo guardar la configuración de ZapSign', companyId);
  }
}

export async function disconnectZapsignAction(): Promise<ActionResult<IntegrationsStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    await setZapsignConfig(session.companyId, { token: null, sandbox: false });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { change: 'zapsign-token-eliminado' },
    });
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: await getIntegrationsStatus(session.companyId), message: 'ZapSign desconectado' };
  } catch (error) {
    return failure(error, 'No se pudo desconectar ZapSign', companyId);
  }
}
