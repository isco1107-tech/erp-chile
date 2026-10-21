import { z } from 'zod';
import { validateRut } from '@/lib/chile/rut';
import { ATTENDANCE_STATUSES, dayToDate, isMonthKey } from '@/lib/academy/billing';
import { ADULT_AGE, MAX_AGE, MIN_AGE, ageOn } from '@/lib/academy/enrollment';
import { MAX_RANGE_DAYS, daysBetween, isIsoDay, isTime, isValidTimeRange } from '@/lib/academy/calendar';
import { safeMaterialLink } from '@/lib/academy/materials';

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

/** Ficha ampliada, igual a la de candidatas: dirección, contacto de emergencia y tallas. */
const profileFields = {
  address: optionalText(200),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(30),
  pantsSize: optionalText(20),
  shirtSize: optionalText(20),
  shoeSize: optionalText(20),
};

export const studentSchema = z.object({
  ...profileFields,
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

export const moveStudentSchema = z.object({
  studentId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
});

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
    ...profileFields,
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

// ── Calendario de clases ─────────────────────────────────────────────────────

const calendarDay = isoDay.refine(isIsoDay, 'Fecha inválida');
const timeSchema = z.string().refine(isTime, 'Hora inválida: usa el formato 10:00');

/** Tramo de días que se pide al calendario (la grilla de un mes o una semana). */
export const calendarRangeSchema = z
  .object({ from: calendarDay, to: calendarDay })
  .refine((r) => r.to >= r.from && daysBetween(r.from, r.to) <= MAX_RANGE_DAYS, 'Rango de fechas inválido');

const sessionFields = {
  startTime: timeSchema,
  endTime: timeSchema,
  title: optionalText(120),
  location: optionalText(120),
  notes: optionalText(500),
};

function checkTimes(value: { startTime: string; endTime: string }, ctx: z.RefinementCtx): void {
  if (isTime(value.startTime) && isTime(value.endTime) && !isValidTimeRange(value.startTime, value.endTime)) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La clase debe terminar después de la hora de inicio' });
  }
}

/** Programar una clase; con `repeat`, una por semana (y por día elegido) desde la fecha indicada. */
export const sessionSchema = z
  .object({
    groupId: z.string().min(1, 'Elige un grupo'),
    date: calendarDay,
    ...sessionFields,
    repeat: z
      .object({
        weeks: z.number().int().min(1, 'Indica cuántas semanas').max(52, 'Máximo 52 semanas'),
        weekdays: z.array(z.number().int().min(0).max(6)).max(7),
      })
      .nullable()
      .optional(),
  })
  .superRefine(checkTimes);
export type SessionInput = z.infer<typeof sessionSchema>;

export const SESSION_SCOPES = ['ONE', 'FOLLOWING'] as const;
export const sessionScopeSchema = z.enum(SESSION_SCOPES).default('ONE');
export type SessionScope = (typeof SESSION_SCOPES)[number];

/**
 * Editar una clase. El grupo no se cambia (la lista ya pasada es de ese grupo).
 * Con `scope: 'FOLLOWING'` la hora y el lugar también se aplican a las clases
 * siguientes de la misma serie; el día y el tema son siempre de esta clase.
 */
export const sessionUpdateSchema = z
  .object({
    date: calendarDay,
    ...sessionFields,
    scope: sessionScopeSchema,
  })
  .superRefine(checkTimes);
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;

// ── Material de estudio ──────────────────────────────────────────────────────

const materialTarget = {
  groupId: z.string().min(1, 'Elige un grupo'),
  /** Clase a la que pertenece (opcional). */
  sessionId: z.string().min(1).nullable().optional(),
  description: optionalText(500),
};

/** Datos que acompañan al archivo en la subida (el archivo va aparte). */
export const materialUploadMetaSchema = z.object({
  ...materialTarget,
  title: optionalText(120),
  /** Enviarlo por correo apenas se suba. */
  send: z.boolean().default(false),
});
export type MaterialUploadMeta = z.infer<typeof materialUploadMetaSchema>;

export const materialLinkSchema = z.object({
  ...materialTarget,
  title: z.string().trim().min(2, 'Escribe un título para el material').max(120),
  url: z
    .string()
    .trim()
    .min(1, 'Pega el enlace')
    .transform((value, ctx) => {
      const safe = safeMaterialLink(value);
      if (!safe) ctx.addIssue({ code: 'custom', message: 'El enlace debe empezar con https:// y ser una página web' });
      return safe ?? value;
    }),
  send: z.boolean().default(false),
});
export type MaterialLinkInput = z.infer<typeof materialLinkSchema>;

export { periodSchema, isoDay };
