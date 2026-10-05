import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { ATTENDANCE_STATUSES, dayToDate, isMonthKey } from '@/lib/academy/billing';
import { ADULT_AGE, MAX_AGE, MIN_AGE, ageOn } from '@/lib/academy/enrollment';

/** Máximo de una columna `Int` de Postgres (int4). */
const MAX_INT4 = 2_147_483_647;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const periodSchema = z.string().refine(isMonthKey, 'Mes inválido');

export const groupSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre del grupo').max(80),
  schedule: optionalText(120),
  monthlyFee: z.number().int('Monto en pesos enteros').min(0).max(MAX_INT4, 'Monto demasiado alto').nullable().optional(),
});
export type GroupInput = z.infer<typeof groupSchema>;

export const studentSchema = z.object({
  rut: z.string().trim().refine(validateRut, 'RUT inválido'),
  fullName: z.string().trim().min(3, 'Escribe el nombre completo').max(120),
  groupId: z.string().min(1).nullable().optional(),
  birthDate: isoDay.nullable().optional(),
  email: z.string().trim().email('Correo inválido').max(120).optional().or(z.literal('')),
  phone: optionalText(30),
  guardianName: optionalText(120),
  guardianPhone: optionalText(30),
  guardianEmail: z.string().trim().email('Correo del apoderado inválido').max(120).optional().or(z.literal('')),
  photoConsent: z.boolean().default(false),
  notes: optionalText(1000),
  /** Primer mes que se le cobra, "YYYY-MM". */
  startMonth: periodSchema,
});
export type StudentInput = z.infer<typeof studentSchema>;

export const attendanceSchema = z.object({
  groupId: z.string().min(1, 'Elige un grupo'),
  date: isoDay,
  entries: z
    .array(z.object({ studentId: z.string().min(1), status: z.enum(ATTENDANCE_STATUSES).nullable() }))
    .max(500),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;

export const monthPaymentSchema = z.object({
  studentId: z.string().min(1),
  period: periodSchema,
  paid: z.boolean(),
  amount: z.number().int('Monto en pesos enteros').min(0).max(MAX_INT4, 'Monto demasiado alto').optional(),
  note: optionalText(200),
});
export type MonthPaymentInput = z.infer<typeof monthPaymentSchema>;

/** Campo oculto que solo completa un bot (mismo criterio que el formulario de contacto de sitios web). */
export const ACADEMY_HONEYPOT_FIELD = 'website';

/**
 * Formulario público de inscripción. El servidor no confía en el navegador:
 * la edad se calcula de la fecha de nacimiento y, si es menor, el apoderado
 * es obligatorio.
 */
export const publicApplicationSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Escribe tu nombre completo').max(120),
    rut: z.string().trim().refine(validateRut, 'RUT inválido'),
    birthDate: isoDay,
    phone: z.string().trim().min(8, 'Escribe un teléfono de contacto').max(30),
    email: z.string().trim().email('Correo inválido').max(120).optional().or(z.literal('')),
    guardianName: optionalText(120),
    guardianPhone: optionalText(30),
    guardianEmail: z.string().trim().email('Correo del apoderado inválido').max(120).optional().or(z.literal('')),
    preferredGroupId: z.string().trim().min(1).max(40).nullable().optional(),
    photoConsent: z.boolean().default(false),
    message: optionalText(500),
    /** Obligatorio: constancia de que vio el aviso de privacidad antes de enviar. */
    acceptPrivacy: z.literal(true, { error: 'Debes aceptar el aviso de privacidad para inscribirte' }),
  })
  .superRefine((value, ctx) => {
    const birth = dayToDate(value.birthDate);
    if (Number.isNaN(birth.getTime())) return void ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Fecha de nacimiento inválida' });
    const age = ageOn(birth, new Date());
    if (age < MIN_AGE || age > MAX_AGE) return void ctx.addIssue({ code: 'custom', path: ['birthDate'], message: 'Revisa la fecha de nacimiento' });
    if (age < ADULT_AGE && (!value.guardianName || !value.guardianPhone)) {
      ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'Como es menor de edad, indica el nombre y teléfono de su madre, padre o apoderado' });
    }
  });
export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>;

export const approveApplicationSchema = z.object({
  groupId: z.string().min(1).nullable().optional(),
  startMonth: periodSchema,
});

export { periodSchema, isoDay };
