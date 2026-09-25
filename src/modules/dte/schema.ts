import { z } from 'zod';

export const RECEIVED_DTE_FILTERS = ['ALL', 'ATTENTION', 'PENDING', 'ACCEPTED', 'CLAIMED', 'REGISTERED'] as const;

export const receivedDteDecisionSchema = z
  .object({
    status: z.enum(['PENDING', 'ACCEPTED', 'CLAIMED']),
    note: z.string().trim().max(500, 'El motivo no puede superar 500 caracteres').optional(),
  })
  .refine((value) => value.status !== 'CLAIMED' || Boolean(value.note), {
    path: ['note'],
    message: 'Indica el motivo del reclamo',
  });

export const rcvPeriodSchema = z.object({
  kind: z.enum(['PURCHASES', 'SALES']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const rcvDraftSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  key: z.string().min(3).max(80),
});

/** Motivos de reclamo que contempla la Ley 19.983 (se registran en sii.cl). */
export const CLAIM_REASONS = [
  { code: 'RCD', label: 'Reclamo al contenido del documento' },
  { code: 'RFP', label: 'Falta parcial de mercaderías' },
  { code: 'RFT', label: 'Falta total de mercaderías' },
] as const;

export const RECEIVED_STATUS_LABELS = {
  PENDING: 'Por revisar',
  ACCEPTED: 'Aceptado',
  CLAIMED: 'Reclamado',
  REGISTERED: 'En Compras',
} as const;

export const TED_STATUS_LABELS: Record<string, string> = {
  VALID: 'Timbre íntegro',
  INVALID: 'Timbre no cuadra',
  MISSING: 'Sin timbre',
};
