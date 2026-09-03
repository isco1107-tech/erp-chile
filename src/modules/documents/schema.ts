import { z } from 'zod';

export const DOCUMENT_TEMPLATE_TYPES = ['SPONSOR_COMMITMENT_LETTER', 'CANDIDATE_CONTRACT'] as const;

export const DOCUMENT_TEMPLATE_VARIABLES: Record<(typeof DOCUMENT_TEMPLATE_TYPES)[number], string[]> = {
  SPONSOR_COMMITMENT_LETTER: ['sponsorName', 'sponsorRut', 'projectName', 'tier', 'cashAmount', 'barterDescription', 'date'],
  CANDIDATE_CONTRACT: ['candidateName', 'candidateRut', 'projectName', 'organizationName', 'organizationRut', 'date'],
};

export const documentTemplateUpsertSchema = z.object({
  type: z.enum(DOCUMENT_TEMPLATE_TYPES),
  name: z.string().min(1, 'El nombre de la plantilla es obligatorio'),
  bodyText: z.string().min(1, 'El contenido de la plantilla es obligatorio'),
});

export type DocumentTemplateUpsertInput = z.infer<typeof documentTemplateUpsertSchema>;
