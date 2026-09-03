import { prisma } from '@/lib/prisma';
import type { Company, CompanySettings } from '@prisma/client';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { isValidIpAllowlistEntry } from '@/lib/auth/ip-allowlist';

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
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  return prisma.companySettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput): Promise<CompanySettings> {
  return prisma.companySettings.upsert({
    where: { companyId },
    update: input,
    create: { companyId, ...input },
  });
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
