import { z } from 'zod';
import type { DataSubjectRequestType } from '@prisma/client';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { REQUEST_TYPES } from './constants';

const requestTypeSchema = z.enum(REQUEST_TYPES as [DataSubjectRequestType, ...DataSubjectRequestType[]], { error: 'Elige qué derecho quieres ejercer' });

const requesterFields = {
  type: requestTypeSchema,
  requesterName: z.string().trim().min(3, 'Escribe tu nombre completo').max(150, 'Nombre demasiado largo'),
  requesterEmail: z.string().trim().toLowerCase().email('Correo inválido').max(200, 'Correo demasiado largo'),
  // Opcional: ayuda a ubicar los datos, pero no se exige para no frenar el derecho.
  requesterRut: z
    .string()
    .trim()
    .max(12, 'RUT demasiado largo')
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const clean = cleanRut(value);
      if (!validateRut(clean)) {
        ctx.addIssue({ code: 'custom', message: 'RUT inválido' });
        return z.NEVER;
      }
      return clean;
    }),
  details: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
};

/** Formulario público (`/derechos/[token]`). La empresa sale del token, nunca del cuerpo. */
export const publicDataSubjectRequestSchema = z.object({
  ...requesterFields,
  acceptsIdentityCheck: z.literal(true, { error: 'Debes aceptar que verifiquemos tu identidad antes de responder' }),
});

/** Solicitud registrada a mano por el equipo (llegó por correo, en persona, etc.). */
/** Búsqueda de una persona por correo y/o RUT (al menos uno). */
export const personQuerySchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Correo inválido').max(200, 'Correo demasiado largo').optional().or(z.literal('').transform(() => undefined)),
    rut: requesterFields.requesterRut,
  })
  .refine((value) => Boolean(value.email || value.rut), { message: 'Escribe el correo o el RUT de la persona' });

export const manualDataSubjectRequestSchema = z.object({
  ...requesterFields,
  receivedAt: z.coerce.date().optional(),
});

export const updateDataSubjectRequestSchema = z.object({
  status: z.enum(['RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']),
  identityVerified: z.boolean().optional(),
  resolutionNote: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
});

export const extendDataSubjectRequestSchema = z.object({
  extendedUntil: z.coerce.date(),
  reason: z.string().trim().min(10, 'Explica el motivo de la prórroga (mínimo 10 caracteres)').max(1000, 'Máximo 1000 caracteres'),
});

export const privacyIncidentSchema = z.object({
  title: z.string().trim().min(5, 'Ponle un título claro').max(150, 'Título demasiado largo'),
  description: z.string().trim().min(20, 'Describe qué pasó (mínimo 20 caracteres)').max(4000, 'Máximo 4000 caracteres'),
  detectedAt: z.coerce.date(),
  affectsSensitiveData: z.boolean(),
  affectsMinors: z.boolean(),
  affectsEconomicData: z.boolean(),
  recordsAffected: z.coerce.number().int().min(0).max(100_000_000).optional(),
  containmentActions: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional(),
});

export const updatePrivacyIncidentSchema = z.object({
  status: z.enum(['OPEN', 'CONTAINED', 'CLOSED']).optional(),
  containmentActions: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional(),
  agencyNotified: z.boolean().optional(),
  subjectsNotified: z.boolean().optional(),
});

export type PublicDataSubjectRequestInput = z.infer<typeof publicDataSubjectRequestSchema>;
