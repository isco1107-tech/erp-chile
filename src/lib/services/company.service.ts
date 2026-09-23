import { prisma } from '@/lib/prisma';
import type { Company, CompanySettings } from '@prisma/client';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { isValidIpAllowlistEntry } from '@/lib/auth/ip-allowlist';
import { encryptSiiCredential } from '@/lib/sii/crypto';

export interface CompanyProfileInput {
  rut: string;
  businessName: string;
  giro?: string;
  address?: string;
  comuna?: string;
  ciudad?: string;
  phone?: string;
  logoUrl?: string;
  backgroundUrl?: string | null;
  actividadEconomicaCodigo?: string;
}

export async function getCompanyProfile(companyId: string): Promise<Company | null> {
  return prisma.company.findUnique({ where: { id: companyId } });
}

export async function updateCompanyProfile(companyId: string, input: CompanyProfileInput): Promise<Company> {
  const rutClean = cleanRut(input.rut);
  if (!validateRut(rutClean)) throw new Error('RUT inválido');

  return prisma.company.update({
    where: { id: companyId },
    data: {
      rut: formatRut(rutClean),
      businessName: input.businessName,
      giro: input.giro,
      address: input.address,
      comuna: input.comuna,
      ciudad: input.ciudad,
      phone: input.phone,
      logoUrl: input.logoUrl,
      backgroundUrl: input.backgroundUrl,
      actividadEconomicaCodigo: input.actividadEconomicaCodigo,
    },
  });
}

export interface CompanySettingsInput {
  industryType: 'SERVICES' | 'COMMERCE' | 'DISTRIBUTION' | 'RETAIL' | 'LIGHT_MANUFACTURING';
  allowNegativeStock: boolean;
  ppmRateBasisPoints: number;
  honorariumRetentionBps: number;
  fiscalYear: number;
  /** CLP entero. `null` = sin umbral (ninguna compra requiere aprobación). */
  purchaseApprovalThreshold: number | null;
  siiApiEnabled?: boolean;
  siiApiBaseUrl?: string | null;
  siiApiKey?: string | null;
  siiApiSecret?: string | null;
}

/**
 * Vista de `CompanySettings` segura para el cliente: `siiApiKey`/`siiApiSecret`
 * nunca viajan al navegador (ni cifradas), solo si hay una credencial guardada.
 * El valor real solo se descifra en el servidor, en el punto de uso
 * (`getCompanySiiApiConfig`), nunca para mostrarlo de vuelta en un formulario.
 */
export type CompanySettingsView = Omit<CompanySettings, 'siiApiKey' | 'siiApiSecret'> & {
  siiApiKeySet: boolean;
  siiApiSecretSet: boolean;
};

function toCompanySettingsView(settings: CompanySettings): CompanySettingsView {
  const { siiApiKey, siiApiSecret, ...rest } = settings;
  return { ...rest, siiApiKeySet: Boolean(siiApiKey), siiApiSecretSet: Boolean(siiApiSecret) };
}

export async function getCompanySettings(companyId: string): Promise<CompanySettingsView> {
  const settings = await prisma.companySettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });
  return toCompanySettingsView(settings);
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput): Promise<CompanySettingsView> {
  const data: CompanySettingsInput = { ...input };
  // Cadena vacía / no enviado ya se resolvió en la Server Action (trim -> null
  // = "borrar", undefined = "no tocar"): acá solo cifra lo que sí es un valor.
  if (data.siiApiKey) data.siiApiKey = encryptSiiCredential(data.siiApiKey);
  if (data.siiApiSecret) data.siiApiSecret = encryptSiiCredential(data.siiApiSecret);

  const settings = await prisma.companySettings.upsert({
    where: { companyId },
    update: data,
    create: { companyId, ...data },
  });
  return toCompanySettingsView(settings);
}

export interface IpAllowlistInput {
  enabled: boolean;
  entries: string[];
}

export async function updateIpAllowlist(companyId: string, input: IpAllowlistInput): Promise<CompanySettings> {
  const entries = [...new Set(input.entries.map((e) => e.trim()).filter(Boolean))];
  for (const entry of entries) {
    if (!isValidIpAllowlistEntry(entry)) throw new Error(`"${entry}" no es una IP ni un rango CIDR válido`);
  }
  // Activar sin ninguna entrada dejaría a toda la empresa —incluido el
  // Dueño— sin poder entrar en el siguiente login.
  if (input.enabled && entries.length === 0) {
    throw new Error('Agrega al menos una IP o rango antes de activar la restricción');
  }

  return prisma.companySettings.upsert({
    where: { companyId },
    update: { ipAllowlistEnabled: input.enabled, ipAllowlist: entries },
    create: { companyId, ipAllowlistEnabled: input.enabled, ipAllowlist: entries },
  });
}
