import { z } from 'zod';
import type { CandidateStatus } from '@prisma/client';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { regions } from '@/lib/chile/locations';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

const rutField = z
  .string()
  .min(3, 'El RUT es obligatorio')
  .refine((val) => validateRut(cleanRut(val)), 'RUT inválido. Verifica que esté bien escrito, ej: 12.345.678-K');

/** Comunas de La Araucanía, únicas exigidas en el formulario público de este
 * certamen (residir en la región es un requisito de bases, Sección 5). */
export const ARAUCANIA_COMUNAS = regions.find((r) => r.code === 'IX')!.comunas;

export const CANDIDATE_STATUSES = [
  'APPLICANT',
  'UNDER_REVIEW',
  'CALLED_TO_CASTING',
  'OFFICIAL_CANDIDATE',
  'FINALIST',
  'WINNER',
  'WITHDRAWN',
  'REJECTED',
] as const;

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  APPLICANT: 'Postulante',
  UNDER_REVIEW: 'En revisión',
  CALLED_TO_CASTING: 'Citada a casting',
  OFFICIAL_CANDIDATE: 'Preseleccionada',
  FINALIST: 'Finalista',
  WINNER: 'Ganadora',
  WITHDRAWN: 'Retirada',
  REJECTED: 'Descartada',
};

/** Estados a los que se puede pasar manualmente desde el panel — igual que
 * `CANDIDATE_STATUSES` menos `APPLICANT`, que solo se asigna al recibir la
 * auto-inscripción pública (nunca por selección manual). */
export const CANDIDATE_ASSIGNABLE_STATUSES = CANDIDATE_STATUSES.filter((s) => s !== 'APPLICANT');

export const CANDIDATE_REGISTRATION_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;

export const CANDIDATE_REGISTRATION_STATUS_LABELS: Record<(typeof CANDIDATE_REGISTRATION_STATUSES)[number], string> = {
  DRAFT: 'Borrador',
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  ARCHIVED: 'Archivada',
};

// Límites explícitos en todo campo de texto — obligatorio en
// `candidateSelfRegistrationSchema` (Sección 3: "largo máximo en todos los
// campos de texto"), que hereda estos mismos límites de acá al no
// sobreescribirlos.
export const candidateCreateSchema = z.object({
  projectId: z.string().min(1, 'Debe seleccionar un proyecto/certamen'),
  rut: rutField,
  fullName: z.string().min(2, 'El nombre completo es obligatorio').max(180, 'Máximo 180 caracteres'),
  stageName: z.string().max(100, 'Máximo 100 caracteres').optional(),
  email: z.string().email('Email inválido').max(180, 'Máximo 180 caracteres').optional().or(z.literal('')),
  phone: z.string().max(30, 'Máximo 30 caracteres').optional(),
  birthDate: z.coerce.date('Fecha de nacimiento inválida'),
  dressSize: z.string().max(20, 'Máximo 20 caracteres').optional(),
  shoeSize: z.string().max(20, 'Máximo 20 caracteres').optional(),
  heightCm: z.number().int('La estatura debe ser un número entero').positive('La estatura debe ser mayor a cero').nullable().optional(),
  emergencyContactName: z.string().max(150, 'Máximo 150 caracteres').optional(),
  emergencyContactPhone: z.string().max(30, 'Máximo 30 caracteres').optional(),
  guardianName: z.string().max(150, 'Máximo 150 caracteres').optional(),
  guardianRut: z.string().max(12, 'Máximo 12 caracteres').optional(),
  status: z.enum(CANDIDATE_STATUSES).default('APPLICANT'),
  notes: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  // Campos que originalmente solo llenaba el formulario público (Sección 5),
  // pero que el equipo también debe poder cargar/corregir a mano para una
  // ficha creada u editada desde el panel interno — a diferencia del
  // formulario público, acá van todos opcionales y `comuna` no se restringe
  // a La Araucanía (una ficha de staff interna puede ser de cualquier lugar).
  comuna: z.string().max(80, 'Máximo 80 caracteres').optional(),
  direccion: z.string().max(200, 'Máximo 200 caracteres').optional(),
  ocupacion: z.string().max(150, 'Máximo 150 caracteres').optional(),
  instagram: z.string().max(80, 'Máximo 80 caracteres').optional(),
  idiomas: z.string().max(200, 'Máximo 200 caracteres').optional(),
  experiencia: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  motivacion: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  causaSocial: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
  condicionesMedicas: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
});

export type CandidateCreateInput = z.infer<typeof candidateCreateSchema>;

// Sin `projectId`: es un dato estructural, una candidata no se puede mover de
// proyecto una vez creada (ver CLAUDE.md de la tarea).
export const candidateUpdateSchema = candidateCreateSchema.omit({ projectId: true }).partial();

export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>;

// Formulario público de auto-inscripción (sin `projectId` -se resuelve desde
// el token del link- ni `status` -siempre entra como `APPLICANT`, la
// postulante no elige su propio estado en el certamen). El email es
// obligatorio acá (a diferencia del formulario interno): es el único dato de
// contacto/identificación que el equipo tiene de alguien que nunca tuvo
// cuenta ni sesión ERP.
//
// Se mantienen los campos de tallas/contacto de emergencia/tutor del
// formulario interno original (opcionales, ya en producción) y se AGREGAN los
// campos propios de la postulación pública (comuna, dirección, motivación,
// causa social, declaraciones) pedidos en la Sección 5 del prompt del módulo
// — en vez de reemplazar el formulario existente por uno nuevo.
export const candidateSelfRegistrationSchema = candidateCreateSchema
  .omit({ projectId: true, status: true })
  .extend({
    email: z.string().email('Email inválido').max(180, 'Máximo 180 caracteres'),
    // A diferencia del formulario interno (donde la estatura puede
    // desconocerse todavía), el formulario público SÍ la exige — Sección 5
    // la lista sin marcarla "(opcional)", a diferencia de Instagram/idiomas/
    // experiencia. Se sobreescribe la versión heredada (`nullable().optional()`)
    // en vez de dejar esta regla solo en el componente de cliente.
    heightCm: z.number('Ingresa tu estatura en centímetros').int('La estatura debe ser un número entero').positive('La estatura debe ser mayor a cero'),
    comuna: z.enum(ARAUCANIA_COMUNAS as [string, ...string[]], 'Selecciona una comuna de La Araucanía'),
    direccion: z.string().min(1, 'La dirección es obligatoria').max(200, 'Máximo 200 caracteres'),
    ocupacion: z.string().min(1, 'Cuéntanos tu ocupación o si estudias').max(150, 'Máximo 150 caracteres'),
    instagram: z.string().max(80, 'Máximo 80 caracteres').optional(),
    idiomas: z.string().max(200, 'Máximo 200 caracteres').optional(),
    experiencia: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    motivacion: z
      .string()
      .min(80, 'Cuéntanos un poco más — mínimo 80 caracteres')
      .max(2000, 'Máximo 2000 caracteres'),
    causaSocial: z.string().min(1, 'Cuéntanos qué causa social te gustaría impulsar').max(1000, 'Máximo 1000 caracteres'),
    aceptaRequisitos: z.literal(true, 'Debes declarar que cumples los requisitos y que tus datos son verídicos'),
    aceptaTratamientoDatos: z.literal(true, 'Debes autorizar el tratamiento de tus datos'),
    aceptaBases: z.literal(true, 'Debes aceptar las bases del certamen'),
    aceptaMarketing: z.boolean().default(false),
  });

// Honeypot: nombre de campo (`website`) usado por el formulario público y
// por `app/api/public/candidates/[token]/apply/route.ts`. Deliberadamente
// NO es parte de `candidateSelfRegistrationSchema`: el honeypot se revisa
// ANTES de parsear con Zod (si viene con contenido, se descarta en silencio
// con 200 — Sección 3), así que no debe figurar como si formara parte del
// contrato de validación normal del formulario.
export const CANDIDATE_HONEYPOT_FIELD = 'website';

export type CandidateSelfRegistrationInput = z.infer<typeof candidateSelfRegistrationSchema>;

/** Cambio de estado desde el panel interno: `motivoDescarte` solo se exige al
 * pasar a `REJECTED` (Sección 6 — "motivo obligatorio al descartar"). */
export const candidateStatusChangeSchema = z
  .object({
    status: z.enum(CANDIDATE_ASSIGNABLE_STATUSES, 'Selecciona un estado'),
    motivoDescarte: z.string().max(255, 'Máximo 255 caracteres').optional(),
  })
  .refine((data) => data.status !== 'REJECTED' || Boolean(data.motivoDescarte?.trim()), {
    message: 'Debes indicar el motivo del descarte',
    path: ['motivoDescarte'],
  });

export type CandidateStatusChangeInput = z.infer<typeof candidateStatusChangeSchema>;

/** Configuración de la ventana de postulación pública de un `Project`
 * ("convocatoria" — ver nota de arquitectura en `services/candidates.service.ts`). */
export const registrationSettingsSchema = z
  .object({
    registrationStatus: z.enum(CANDIDATE_REGISTRATION_STATUSES, 'Selecciona un estado de convocatoria'),
    registrationOpensAt: z.coerce.date('Fecha de apertura inválida').nullable().optional(),
    registrationClosesAt: z.coerce.date('Fecha de cierre inválida').nullable().optional(),
    minCandidateAge: z.number().int().min(1).max(99).default(18),
    maxCandidates: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) => !data.registrationOpensAt || !data.registrationClosesAt || data.registrationOpensAt < data.registrationClosesAt,
    { message: 'La fecha de cierre debe ser posterior a la de apertura', path: ['registrationClosesAt'] }
  );

export type RegistrationSettingsInput = z.infer<typeof registrationSettingsSchema>;

export const CANDIDATE_ACTIVITY_TYPES = ['PASARELA', 'ORATORIA', 'ENSAYO', 'TALLER', 'EVENTO', 'OTRO'] as const;

export const CANDIDATE_ACTIVITY_TYPE_LABELS: Record<(typeof CANDIDATE_ACTIVITY_TYPES)[number], string> = {
  PASARELA: 'Pasarela',
  ORATORIA: 'Oratoria',
  ENSAYO: 'Ensayo',
  TALLER: 'Taller',
  EVENTO: 'Evento',
  OTRO: 'Otro',
};

export const attendanceCreateSchema = z.object({
  activityType: z.enum(CANDIDATE_ACTIVITY_TYPES, 'Selecciona un tipo de actividad'),
  activityDate: z.coerce.date('Fecha inválida'),
  attended: z.boolean().default(true),
  notes: z.string().optional(),
});

export type AttendanceCreateInput = z.infer<typeof attendanceCreateSchema>;

/** Días de semana 0=domingo..6=sábado, igual que `Date#getDay()`. */
export const WEEKDAY_LABELS: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
};

/** Genera una o varias sesiones de golpe: un solo día (evento puntual) o un
 * rango recorriendo únicamente los días de semana marcados en `daysOfWeek`
 * (ej. martes y jueves entre dos fechas, para talleres/ensayos recurrentes). */
export const sessionSeriesCreateSchema = z
  .object({
    projectId: z.string().min(1, 'Debe seleccionar un proyecto/certamen'),
    activityType: z.enum(CANDIDATE_ACTIVITY_TYPES, 'Selecciona un tipo de actividad'),
    title: z.string().max(150, 'Máximo 150 caracteres').optional(),
    location: z.string().max(150, 'Máximo 150 caracteres').optional(),
    notes: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
    startDate: z.coerce.date('Fecha de inicio inválida'),
    endDate: z.coerce.date('Fecha de término inválida'),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Selecciona al menos un día de la semana'),
    time: z.string().max(10, 'Máximo 10 caracteres').optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'La fecha de término debe ser igual o posterior a la de inicio',
    path: ['endDate'],
  });

export type SessionSeriesCreateInput = z.infer<typeof sessionSeriesCreateSchema>;

export const sessionAttendanceEntrySchema = z.object({
  candidateId: z.string().min(1),
  attended: z.boolean(),
  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

export const sessionAttendanceBulkSchema = z.object({
  entries: z.array(sessionAttendanceEntrySchema).min(1, 'No hay candidatas para registrar'),
});

export type SessionAttendanceBulkInput = z.infer<typeof sessionAttendanceBulkSchema>;

export const CANDIDATE_DOCUMENT_STATUSES = ['PENDING', 'SIGNED', 'EXPIRED'] as const;

export const CANDIDATE_DOCUMENT_STATUS_LABELS: Record<(typeof CANDIDATE_DOCUMENT_STATUSES)[number], string> = {
  PENDING: 'Pendiente de firma',
  SIGNED: 'Firmado',
  EXPIRED: 'Vencido',
};

export const documentCreateSchema = z.object({
  title: z.string().min(1, 'El título del documento es obligatorio').max(150, 'Máximo 150 caracteres'),
  // Restringido al dominio real de Vercel Blob: sin esto, un usuario con
  // `candidates:write` podría apuntar `fileUrl` a una dirección interna
  // (SSRF) que la ruta de descarga después reenviaría con `fetch()`.
  fileUrl: z.string().min(1, 'Falta el archivo').refine(isAllowedBlobUrl, 'URL de archivo no permitida'),
  signedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

export const documentUpdateSchema = z.object({
  signedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;
