import { prisma } from '@/lib/prisma';
import type { DocumentTemplate, DocumentTemplateType } from '@prisma/client';
import type { DocumentTemplateUpsertInput } from '../schema';

export async function getTemplate(companyId: string, type: DocumentTemplateType): Promise<DocumentTemplate | null> {
  return prisma.documentTemplate.findUnique({ where: { companyId_type: { companyId, type } } });
}

export async function listTemplates(companyId: string): Promise<DocumentTemplate[]> {
  return prisma.documentTemplate.findMany({ where: { companyId }, orderBy: { type: 'asc' } });
}

/** Una sola plantilla vigente por tipo por empresa — guardar sobre ella actualiza el "formato estipulado", no crea otra versión. */
export async function upsertTemplate(companyId: string, data: DocumentTemplateUpsertInput): Promise<DocumentTemplate> {
  return prisma.documentTemplate.upsert({
    where: { companyId_type: { companyId, type: data.type } },
    update: { name: data.name, bodyText: data.bodyText },
    create: { companyId, type: data.type, name: data.name, bodyText: data.bodyText },
  });
}

/** Obtiene la plantilla vigente o lanza un error legible — usado por los servicios de render de PDF, que no pueden generar nada sin una plantilla configurada. */
export async function requireTemplate(companyId: string, type: DocumentTemplateType): Promise<DocumentTemplate> {
  const template = await getTemplate(companyId, type);
  if (!template) {
    throw new Error(
      type === 'SPONSOR_COMMITMENT_LETTER'
        ? 'No has configurado la plantilla de carta de compromiso todavía'
        : 'No has configurado la plantilla de contrato de candidatas todavía',
    );
  }
  return template;
}
