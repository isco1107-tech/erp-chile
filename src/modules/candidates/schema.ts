import { z } from 'zod';
import { contactEmailField, contactWhatsappField, instagramHandleField, normalizeInstagramHandle } from '@/lib/events/pageant-contact';
import type { CandidateStatus } from '@prisma/client';
import { cleanRut, validateRut } from '@/lib/chile/rut';
import { regions } from '@/lib/chile/locations';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

const rutField = z
  .string()
  .min(3, 'El RUT es obligatorio')
  .refine((val) => validateRut(cleanRut(val)), 'RUT inválido. Verifica que esté bien escrito, ej: 12.345.678-K');

/** Todas las comunas de Chile, para sugerir en la ficha y en los filtros (la comuna es texto libre). */
export const CHILE_COMUNAS = [...new Set(regions.flatMap((r) => r.comunas))].sort((a, b) => a.localeCompare(b, 'es-CL'));

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
  // Obligatoria al crear desde el panel. En la edición (`candidateUpdateSchema`,
  // parcial) puede venir vacía: las postulaciones públicas solo traen la edad.
  birthDate: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.coerce.date('Ingresa la fecha de nacimiento')),
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
  // Datos del empleador (texto libre, sin relación estructurada con Contact —
  // ver comentario en prisma/schema.prisma). Se completan a mano o vía
  // `lookupEmployerAction` (buscador web reusado de contactos).
  employerName: z.string().max(180, 'Máximo 180 caracteres').optional(),
  employerRut: z.string().max(12, 'Máximo 12 caracteres').optional(),
  employerAddress: z.string().max(200, 'Máximo 200 caracteres').optional(),
});

export type CandidateCreateInput = z.infer<typeof candidateCreateSchema>;

// Sin `projectId`: es un dato estructural, una candidata no se puede mover de
// proyecto una vez creada (ver CLAUDE.md de la tarea).
export const candidateUpdateSchema = candidateCreateSchema
  .omit({ projectId: true })
  .partial()
  // Una postulación pública no trae fecha de nacimiento: al editarla, el campo puede quedar vacío.
  .extend({ birthDate: z.preprocess((value) => (value === '' || value === null ? undefined : value), z.coerce.date('Fecha de nacimiento inválida').optional()) });

export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>;

// Formulario público de auto-inscripción: solo los 8 datos que pide la
// convocatoria (nombre, RUT, edad, comuna, teléfono, correo, Instagram y
// por qué quiere participar). Sin `projectId` (sale del token del link) ni
// `status` (siempre entra como `APPLICANT`). El resto de la ficha (tallas,
// contacto de emergencia, fotos) lo completa el equipo después, en la
// preselección. La edad mínima depende de cada convocatoria
// (`Project.minCandidateAge`) y se revisa en el servidor.
/** Mayoría de edad en Chile: bajo esto se exigen los datos del apoderado. */
export const MINOR_AGE = 18;

export const candidateSelfRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Escribe tu nombre completo').max(180, 'Máximo 180 caracteres'),
    rut: rutField,
    age: z.number('Ingresa tu edad').int('La edad debe ser un número entero').min(1, 'Ingresa tu edad').max(99, 'Revisa tu edad'),
    comuna: z.string().trim().min(2, 'Escribe la comuna donde vives').max(80, 'Máximo 80 caracteres'),
    phone: z
      .string()
      .trim()
      .min(8, 'Escribe un teléfono de contacto')
      .max(30, 'Máximo 30 caracteres')
      .regex(/^[+\d\s().-]+$/, 'El teléfono solo puede tener números'),
    email: z.string().trim().email('Escribe un correo válido').max(180, 'Máximo 180 caracteres'),
    // Usuario, "@usuario" o el link del perfil → "@usuario"; se rechaza lo que no sea un usuario válido.
    instagram: z
      .string()
      .trim()
      .min(1, 'Escribe tu usuario de Instagram')
      .max(120, 'Máximo 120 caracteres')
      .transform((value, ctx) => {
        const handle = normalizeInstagramHandle(value);
        if (!handle) {
          ctx.addIssue({ code: 'custom', message: 'Escribe solo tu usuario de Instagram (ej. @tuusuario)' });
          return z.NEVER;
        }
        return `@${handle}`;
      }),
    motivacion: z.string().trim().min(10, 'Cuéntanos por qué quieres participar').max(2000, 'Máximo 2000 caracteres'),
    // Solo se piden si declara ser menor de edad (el contrato de imagen lleva su firma).
    guardianName: z.string().trim().max(150, 'Máximo 150 caracteres').optional(),
    guardianRut: z.string().trim().max(12, 'Máximo 12 caracteres').optional(),
    // Consentimiento expreso para tratar sus datos (Ley 19.628): sin esto no se guarda nada.
    aceptaTratamientoDatos: z.literal(true, 'Debes aceptar la política de privacidad para inscribirte'),
  })
  .superRefine((data, ctx) => {
    if (data.age >= MINOR_AGE) return;
    if (!data.guardianName || data.guardianName.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'Como eres menor de edad, indica el nombre de tu madre, padre o apoderado' });
    }
    if (!data.guardianRut || !validateRut(cleanRut(data.guardianRut))) {
      ctx.addIssue({ code: 'custom', path: ['guardianRut'], message: 'Ingresa un RUT válido de tu apoderado' });
    }
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
    // Contacto del certamen para las postulantes (mismas columnas que edita el micrositio).
    contactEmail: contactEmailField,
    contactWhatsapp: contactWhatsappField,
    instagramHandle: instagramHandleField,
    // "Qué incluye tu inscripción": un beneficio por ítem, sin vacíos ni repetidos.
    benefits: z.preprocess(
      (value) => (Array.isArray(value) ? [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== ''))] : value),
      z
        .array(z.string().max(120, 'Cada ítem de "qué incluye" tiene un máximo de 120 caracteres'))
        .max(20, 'Máximo 20 ítems en "qué incluye"')
        .default([])
    ),
    classesNote: z
      .string()
      .trim()
      .max(300, 'Máximo 300 caracteres')
      .optional()
      .transform((value) => value || null),
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

/**
 * Presentación pública de una candidata (número oficial, a quién
 * representa, bio del sitio y visibilidad). Esquema APARTE a propósito: si
 * estos campos vivieran en `candidateCreateSchema`, el formulario público de
 * postulación (que deriva de él) dejaría que una postulante se asignara su
 * propio número o escribiera su bio del sitio oficial.
 */
export const candidatePresentationSchema = z.object({
  candidateNumber: z.number().int('El número debe ser entero').min(1, 'El número parte en 1').max(999).nullable(),
  representing: z.string().trim().max(80, 'Máximo 80 caracteres').optional(),
  publicBio: z.string().trim().max(1500, 'Máximo 1500 caracteres').optional(),
  showOnPublicSite: z.boolean(),
});

export type CandidatePresentationInput = z.infer<typeof candidatePresentationSchema>;

export const NUMBERING_ORDERS = ['alphabetical', 'representing', 'registration'] as const;
export const NUMBERING_ORDER_LABELS: Record<(typeof NUMBERING_ORDERS)[number], string> = {
  alphabetical: 'Por nombre',
  representing: 'Por lo que representan (región/ciudad)',
  registration: 'Por orden de postulación',
};
