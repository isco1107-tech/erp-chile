import 'server-only';

import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { decryptIntegrationCredential, encryptIntegrationCredential } from './crypto';

/**
 * Credenciales de Brevo y ZapSign que cada empresa conecta por su cuenta.
 *
 * Regla: si la empresa tiene la suya, se usa SIEMPRE esa (el correo sale de su
 * remitente, el contrato se firma en su cuenta); si no, se cae a la de la
 * plataforma (variables de entorno), que es como operan los clientes hoy. La
 * empresa se resuelve siempre desde la sesión o desde el registro local, nunca
 * desde un cuerpo de petición.
 */

export interface CompanyEmailConfig {
  apiKey: string;
  sender: { name: string; email: string };
}

export interface CompanyZapsignConfig {
  token: string;
  baseUrl: string;
}

export const ZAPSIGN_PRODUCTION_URL = 'https://api.zapsign.com.br';
export const ZAPSIGN_SANDBOX_URL = 'https://sandbox.api.zapsign.com.br';

/**
 * Config de correo propia de la empresa, o `null` si no tiene (se usa la de la
 * plataforma). Si la credencial guardada no se puede descifrar se reporta y
 * también devuelve `null`: una invitación nunca debe perderse por esto.
 */
export async function getCompanyEmailConfig(companyId: string): Promise<CompanyEmailConfig | null> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { brevoApiCredential: true, emailFromName: true, emailFromAddress: true },
  });
  if (!settings?.brevoApiCredential || !settings.emailFromAddress) return null;
  try {
    return {
      apiKey: decryptIntegrationCredential(settings.brevoApiCredential),
      sender: { name: settings.emailFromName?.trim() || 'ERP', email: settings.emailFromAddress },
    };
  } catch (error) {
    captureException(error, { module: 'integraciones', companyId, extra: { reason: 'brevo-descifrado' } });
    return null;
  }
}

/** Config de ZapSign de la empresa, o `null` si no tiene (se usa la de la plataforma). */
export async function getCompanyZapsignConfig(companyId: string): Promise<CompanyZapsignConfig | null> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { zapsignApiCredential: true, zapsignSandbox: true },
  });
  if (!settings?.zapsignApiCredential) return null;
  try {
    return {
      token: decryptIntegrationCredential(settings.zapsignApiCredential),
      baseUrl: settings.zapsignSandbox ? ZAPSIGN_SANDBOX_URL : ZAPSIGN_PRODUCTION_URL,
    };
  } catch (error) {
    captureException(error, { module: 'integraciones', companyId, extra: { reason: 'zapsign-descifrado' } });
    return null;
  }
}

export interface IntegrationsStatus {
  brevo: { configured: boolean; fromName: string | null; fromAddress: string | null };
  zapsign: { configured: boolean; sandbox: boolean };
  khipu: { configured: boolean };
}

/** Estado para el panel: nunca devuelve las credenciales, solo si existen. */
export async function getIntegrationsStatus(companyId: string): Promise<IntegrationsStatus> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: {
      brevoApiCredential: true,
      emailFromName: true,
      emailFromAddress: true,
      zapsignApiCredential: true,
      zapsignSandbox: true,
      khipuApiCredential: true,
    },
  });
  return {
    brevo: {
      configured: Boolean(settings?.brevoApiCredential),
      fromName: settings?.emailFromName ?? null,
      fromAddress: settings?.emailFromAddress ?? null,
    },
    zapsign: { configured: Boolean(settings?.zapsignApiCredential), sandbox: settings?.zapsignSandbox ?? false },
    khipu: { configured: Boolean(settings?.khipuApiCredential) },
  };
}

export async function setBrevoConfig(
  companyId: string,
  config: { apiKey: string | null; fromName: string; fromAddress: string }
): Promise<void> {
  const data = config.apiKey
    ? { brevoApiCredential: encryptIntegrationCredential(config.apiKey), emailFromName: config.fromName, emailFromAddress: config.fromAddress }
    : { brevoApiCredential: null, emailFromName: null, emailFromAddress: null };
  await prisma.companySettings.upsert({ where: { companyId }, update: data, create: { companyId, ...data } });
}

/** Solo cambia el remitente, conservando la API key ya guardada. Devuelve `false` si no hay key. */
export async function updateBrevoSender(companyId: string, fromName: string, fromAddress: string): Promise<boolean> {
  const result = await prisma.companySettings.updateMany({
    where: { companyId, brevoApiCredential: { not: null } },
    data: { emailFromName: fromName, emailFromAddress: fromAddress },
  });
  return result.count > 0;
}

export async function setZapsignConfig(companyId: string, config: { token: string | null; sandbox: boolean }): Promise<void> {
  const data = config.token
    ? { zapsignApiCredential: encryptIntegrationCredential(config.token), zapsignSandbox: config.sandbox }
    : { zapsignApiCredential: null, zapsignSandbox: false };
  await prisma.companySettings.upsert({ where: { companyId }, update: data, create: { companyId, ...data } });
}

/** Cambia solo el modo (producción / sandbox) conservando el token. Devuelve `false` si no hay token. */
export async function updateZapsignMode(companyId: string, sandbox: boolean): Promise<boolean> {
  const result = await prisma.companySettings.updateMany({
    where: { companyId, zapsignApiCredential: { not: null } },
    data: { zapsignSandbox: sandbox },
  });
  return result.count > 0;
}
