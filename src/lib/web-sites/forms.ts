import { z } from 'zod';
import type { FeatureKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';
import { formatRut, validateRut } from '@/lib/chile/rut';
import { DEAL_TYPES } from '@/modules/crm/schema';

/**
 * Formularios de los sitios web y el lugar del ERP donde terminan sus datos.
 *
 * Un formulario (sección «Formulario», o el del bloque «Contacto») tiene:
 * - un **propósito** (contacto, cotización, inscripción…): ordena la bandeja;
 * - **campos** de una lista cerrada de tipos, cada uno con un **rol** opcional
 *   que dice qué dato del ERP llena («Nombre», «RUT», «Fecha de nacimiento»…);
 * - un **destino**: la categoría del ERP a la que tributa (bandeja del sitio,
 *   CRM, inscripciones de la academia o tareas del equipo).
 *
 * Todo envío queda SIEMPRE en la bandeja «Mensajes» del sitio (es la copia
 * fiel de lo que escribió la persona) y, además, se registra en su destino.
 * Las respuestas se validan contra la definición publicada en el servidor:
 * la del navegador es solo cortesía. Nada de acá toca la base de datos.
 */

export const MAX_FORM_FIELDS = 16;
export const MAX_FIELD_OPTIONS = 12;
export const MAX_TEXT_ANSWER = 200;
export const MAX_LONG_ANSWER = 3000;
/** Tope del monto de un presupuesto (cabe en un INT de Postgres). */
export const MAX_AMOUNT = 2_000_000_000;

const text = (max: number) => z.string().trim().max(max).default('');
const choice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).default(fallback).catch(fallback);

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export const FORM_FIELD_KINDS = ['text', 'longtext', 'email', 'phone', 'rut', 'date', 'number', 'select', 'choice', 'checkbox'] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const FIELD_KIND_INFO: Record<FormFieldKind, { label: string; hint: string }> = {
  text: { label: 'Texto corto', hint: 'Una línea: nombre, empresa, comuna…' },
  longtext: { label: 'Texto largo', hint: 'Varias líneas: mensaje, comentarios, experiencia.' },
  email: { label: 'Correo', hint: 'Revisa que tenga forma de correo.' },
  phone: { label: 'Teléfono', hint: 'Solo números, espacios y +.' },
  rut: { label: 'RUT', hint: 'Se valida el dígito verificador y se guarda como 12.345.678-5.' },
  date: { label: 'Fecha', hint: 'Abre un calendario.' },
  number: { label: 'Número', hint: 'Un número entero (cantidad, presupuesto, personas).' },
  select: { label: 'Lista desplegable', hint: 'Una opción de una lista larga.' },
  choice: { label: 'Opciones a la vista', hint: 'Una opción de pocas (2 a 5), todas visibles.' },
  checkbox: { label: 'Casilla (sí/no)', hint: 'Una pregunta de sí o no, o una autorización.' },
};

/**
 * Rol de un campo: qué dato del ERP llena. `''` = solo queda como respuesta.
 * Cada rol admite ciertos tipos de campo (un RUT solo sale de un campo RUT).
 */
export const FORM_FIELD_ROLES = ['', 'name', 'email', 'phone', 'rut', 'organization', 'address', 'birthDate', 'message', 'amount', 'group', 'guardianName', 'guardianPhone', 'guardianEmail', 'photoConsent'] as const;
export type FormFieldRole = (typeof FORM_FIELD_ROLES)[number];
export type DataRole = Exclude<FormFieldRole, ''>;

export const ROLE_INFO: Record<DataRole, { label: string; kinds: readonly FormFieldKind[] }> = {
  name: { label: 'Nombre de la persona', kinds: ['text'] },
  email: { label: 'Correo para responder', kinds: ['email'] },
  phone: { label: 'Teléfono para responder', kinds: ['phone'] },
  rut: { label: 'RUT', kinds: ['rut'] },
  organization: { label: 'Empresa u organización', kinds: ['text'] },
  address: { label: 'Dirección', kinds: ['text', 'longtext'] },
  birthDate: { label: 'Fecha de nacimiento', kinds: ['date'] },
  message: { label: 'Mensaje o comentario', kinds: ['longtext', 'text'] },
  amount: { label: 'Presupuesto o monto estimado (CLP)', kinds: ['number'] },
  group: { label: 'Curso, grupo o servicio de interés', kinds: ['select', 'choice', 'text'] },
  guardianName: { label: 'Nombre del apoderado', kinds: ['text'] },
  guardianPhone: { label: 'Teléfono del apoderado', kinds: ['phone'] },
  guardianEmail: { label: 'Correo del apoderado', kinds: ['email'] },
  photoConsent: { label: 'Autoriza el uso de su imagen', kinds: ['checkbox'] },
};

export function rolesForKind(kind: FormFieldKind): DataRole[] {
  return (Object.keys(ROLE_INFO) as DataRole[]).filter((role) => ROLE_INFO[role].kinds.includes(kind));
}

export const formFieldSchema = z.object({
  /** Clave estable de la respuesta (no cambia al renombrar la pregunta). */
  id: z.string().trim().min(1).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  kind: choice(FORM_FIELD_KINDS, 'text'),
  /** La pregunta tal como la ve el visitante. */
  label: text(100),
  /** Aclaración bajo la pregunta ("Solo si es menor de edad"). */
  help: text(160),
  required: z.boolean().default(false).catch(false),
  /** Opciones de «lista desplegable» y «opciones a la vista». */
  options: z.array(z.string().trim().max(80)).max(MAX_FIELD_OPTIONS).default([]).catch([]),
  role: choice(FORM_FIELD_ROLES, ''),
});
export type FormField = z.infer<typeof formFieldSchema>;

/**
 * Deja los campos coherentes: un rol solo vale en un tipo compatible y una sola
 * vez (el primer campo que lo tiene), ids únicos y opciones sin vacíos ni
 * repetidas. Se aplica al leer: un dato viejo o manipulado nunca rompe nada.
 */
export function normalizeFormFields(fields: FormField[]): FormField[] {
  const seenIds = new Set<string>();
  const seenRoles = new Set<FormFieldRole>();
  const out: FormField[] = [];
  for (const field of fields.slice(0, MAX_FORM_FIELDS)) {
    if (seenIds.has(field.id)) continue;
    seenIds.add(field.id);
    let role = field.role;
    if (role && (!ROLE_INFO[role].kinds.includes(field.kind) || seenRoles.has(role))) role = '';
    if (role) seenRoles.add(role);
    const options = field.kind === 'select' || field.kind === 'choice' ? [...new Set(field.options.map((option) => option.trim()).filter(Boolean))] : [];
    out.push({ ...field, role, options });
  }
  return out;
}

export const formFieldsSchema = z.array(formFieldSchema).max(MAX_FORM_FIELDS).default([]).catch([]).transform(normalizeFormFields);

export function newFieldId(): string {
  return `f${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function createField(kind: FormFieldKind, patch: Partial<FormField> = {}): FormField {
  return formFieldSchema.parse({ id: newFieldId(), kind, label: FIELD_KIND_INFO[kind].label, ...patch });
}

// ---------------------------------------------------------------------------
// Propósito (para ordenar la bandeja)
// ---------------------------------------------------------------------------

export const FORM_PURPOSES = ['contact', 'quote', 'enrollment', 'booking', 'application', 'newsletter', 'feedback', 'other'] as const;
export type FormPurpose = (typeof FORM_PURPOSES)[number];

export const PURPOSE_LABELS: Record<FormPurpose, string> = {
  contact: 'Contacto',
  quote: 'Cotización',
  enrollment: 'Inscripción',
  booking: 'Reserva o agenda',
  application: 'Postulación',
  newsletter: 'Suscripción',
  feedback: 'Sugerencias y reclamos',
  other: 'Otro',
};

// ---------------------------------------------------------------------------
// Destinos: la categoría del ERP a la que tributa el formulario
// ---------------------------------------------------------------------------

export const FORM_DESTINATIONS = ['inbox', 'crm', 'academy', 'tasks'] as const;
export type FormDestination = (typeof FORM_DESTINATIONS)[number];

export const FORM_CONSENTS = ['notice', 'checkbox'] as const;
export type FormConsent = (typeof FORM_CONSENTS)[number];

export { DEAL_TYPES as FORM_DEAL_TYPES };

export interface DestinationInfo {
  /** Área del ERP ("Ventas", "Academia"…). */
  area: string;
  label: string;
  /** Qué pasa con cada envío, en una frase. */
  description: string;
  /** Ruta exacta donde se ven los datos en el panel. */
  where: string;
  /** Módulo que debe estar contratado; `null` = viene con Sitios web. */
  feature: FeatureKey | null;
  /** Permiso que necesita quien publica un formulario con este destino. */
  publishPermission: Permission | null;
  /** Permiso para ver el registro creado. */
  viewPermission: Permission;
  /** Permiso para llevar a mano un mensaje de la bandeja a este destino. */
  routePermission: Permission | null;
  /** Roles obligatorios (campo presente Y obligatorio) para poder publicar. */
  requiredRoles: DataRole[];
  /** El formulario fuerza la casilla de aceptación del aviso de privacidad. */
  forcesConsent: boolean;
}

export const DESTINATION_INFO: Record<FormDestination, DestinationInfo> = {
  inbox: {
    area: 'Sitio web',
    label: 'Solo la bandeja del sitio',
    description: 'Cada envío queda en «Mensajes» del sitio, con todas sus respuestas, para leerlo y responderlo.',
    where: 'Sitios web → este sitio → Mensajes',
    feature: null,
    publishPermission: null,
    viewPermission: 'websites:read',
    routePermission: null,
    requiredRoles: [],
    forcesConsent: false,
  },
  crm: {
    area: 'Ventas',
    label: 'CRM: oportunidad nueva',
    description: 'Cada envío abre una oportunidad en la etapa «Prospecto» del embudo, con un recordatorio para responder mañana. Si llega otra vez el mismo día, se suma como nota.',
    where: 'CRM → Embudo de negocios → etapa «Prospecto» (origen «Sitio web»)',
    feature: 'hasSalesPipeline',
    publishPermission: 'crm:write',
    viewPermission: 'crm:read',
    routePermission: 'crm:write',
    requiredRoles: ['name'],
    forcesConsent: false,
  },
  academy: {
    area: 'Academia',
    label: 'Academia: inscripción por revisar',
    description: 'Cada envío queda como inscripción pendiente; al aprobarla se crea la ficha de la alumna. Si ya es alumna o tiene una pendiente, no se duplica.',
    where: 'Academia → Inscripciones',
    feature: 'hasAcademy',
    publishPermission: 'academy:write',
    viewPermission: 'academy:read',
    routePermission: 'academy:write',
    requiredRoles: ['name', 'rut', 'birthDate', 'phone'],
    forcesConsent: true,
  },
  tasks: {
    area: 'Equipo',
    label: 'Tareas: pendiente para el equipo',
    description: 'Cada envío crea una tarea «Responder a…» con plazo para mañana, sin responsable: la ven y la asignan quienes gestionan tareas.',
    where: 'Tareas y delegación → Todo el equipo',
    feature: 'hasTeamTasks',
    publishPermission: 'tasks:manage',
    viewPermission: 'tasks:read',
    routePermission: 'tasks:write',
    requiredRoles: ['name'],
    forcesConsent: false,
  },
};

export interface DestinationAccess {
  /** El módulo del destino está contratado. */
  enabled: boolean;
  /** El usuario puede crear registros ahí (lo exige publicar un formulario con ese destino). */
  allowed: boolean;
}

export type FormDestinationAccess = Record<FormDestination, DestinationAccess>;

/** Qué destinos tiene esta empresa (módulos) y cuáles puede publicar este usuario (permisos). */
export function destinationAccess(features: Partial<Record<FeatureKey, boolean>>, permissions: readonly string[]): FormDestinationAccess {
  const out = {} as FormDestinationAccess;
  for (const destination of FORM_DESTINATIONS) {
    const info = DESTINATION_INFO[destination];
    out[destination] = {
      enabled: !info.feature || Boolean(features[info.feature]),
      allowed: !info.publishPermission || permissions.includes(info.publishPermission),
    };
  }
  return out;
}

/** Destinos a los que este usuario puede llevar a mano un mensaje de la bandeja (módulo contratado + permiso). */
export function routeTargetsFor(features: Partial<Record<FeatureKey, boolean>>, permissions: readonly string[]): Array<Exclude<FormDestination, 'inbox'>> {
  return (['crm', 'academy', 'tasks'] as const).filter((destination) => {
    const info = DESTINATION_INFO[destination];
    return (!info.feature || Boolean(features[info.feature])) && (!info.routePermission || permissions.includes(info.routePermission));
  });
}

/** Enlace del panel al registro creado en el destino (`null` si no hay uno propio). */
export function destinationHref(destination: FormDestination, recordId: string | null): string | null {
  if (!recordId) return null;
  switch (destination) {
    case 'crm':
      return `/dashboard/crm?open=${encodeURIComponent(recordId)}`;
    case 'academy':
      return '/dashboard/academy?tab=inscripciones';
    case 'tasks':
      return '/dashboard/tasks?vista=equipo';
    case 'inbox':
      return null;
  }
}

/** ¿La casilla de aceptación del aviso de privacidad es obligatoria? */
export function needsConsentCheckbox(form: { consent: FormConsent; destination: FormDestination }): boolean {
  return form.consent === 'checkbox' || DESTINATION_INFO[form.destination].forcesConsent;
}

// ---------------------------------------------------------------------------
// Plantillas listas para usar
// ---------------------------------------------------------------------------

export interface FormPreset {
  id: string;
  label: string;
  description: string;
  purpose: FormPurpose;
  destination: FormDestination;
  heading: string;
  intro: string;
  submitLabel: string;
  successTitle: string;
  successText: string;
  fields: Array<Omit<FormField, 'id' | 'help' | 'options' | 'required' | 'role'> & Partial<Pick<FormField, 'help' | 'options' | 'required' | 'role'>>>;
}

export const FORM_PRESETS: FormPreset[] = [
  {
    id: 'contact',
    label: 'Contacto',
    description: 'Nombre, correo, teléfono y mensaje.',
    purpose: 'contact',
    destination: 'inbox',
    heading: 'Escríbenos',
    intro: 'Cuéntanos qué necesitas y te respondemos a la brevedad.',
    submitLabel: 'Enviar mensaje',
    successTitle: '¡Gracias! Recibimos tu mensaje.',
    successText: 'Te responderemos lo antes posible.',
    fields: [
      { kind: 'text', label: 'Nombre', required: true, role: 'name' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
      { kind: 'phone', label: 'Teléfono', role: 'phone' },
      { kind: 'longtext', label: 'Mensaje', required: true, role: 'message' },
    ],
  },
  {
    id: 'quote',
    label: 'Cotización',
    description: 'Qué necesita, para cuándo y su presupuesto: llega al CRM como prospecto.',
    purpose: 'quote',
    destination: 'crm',
    heading: 'Pide tu cotización',
    intro: 'Cuéntanos qué necesitas y te enviamos una propuesta sin compromiso.',
    submitLabel: 'Pedir cotización',
    successTitle: '¡Listo! Recibimos tu solicitud.',
    successText: 'Te enviaremos la cotización a la brevedad.',
    fields: [
      { kind: 'text', label: 'Nombre', required: true, role: 'name' },
      { kind: 'text', label: 'Empresa (opcional)', role: 'organization' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
      { kind: 'phone', label: 'Teléfono', required: true, role: 'phone' },
      { kind: 'select', label: '¿Qué necesitas?', required: true, role: 'group', options: ['Servicio 1', 'Servicio 2', 'Otro'] },
      { kind: 'date', label: '¿Para cuándo?' },
      { kind: 'number', label: 'Presupuesto aproximado (pesos)', role: 'amount' },
      { kind: 'longtext', label: 'Detalles', role: 'message' },
    ],
  },
  {
    id: 'enrollment',
    label: 'Inscripción a curso o evento',
    description: 'Datos de la persona y el curso o fecha que elige.',
    purpose: 'enrollment',
    destination: 'inbox',
    heading: 'Inscríbete',
    intro: 'Completa tus datos y te confirmamos el cupo.',
    submitLabel: 'Inscribirme',
    successTitle: '¡Inscripción recibida!',
    successText: 'Te escribiremos para confirmar tu cupo y los pasos siguientes.',
    fields: [
      { kind: 'text', label: 'Nombre completo', required: true, role: 'name' },
      { kind: 'rut', label: 'RUT', role: 'rut' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
      { kind: 'phone', label: 'Teléfono', required: true, role: 'phone' },
      { kind: 'choice', label: '¿A qué te inscribes?', required: true, role: 'group', options: ['Opción 1', 'Opción 2'] },
      { kind: 'longtext', label: 'Comentarios', role: 'message' },
    ],
  },
  {
    id: 'academy',
    label: 'Inscripción a la academia',
    description: 'La ficha que pide la academia: queda como inscripción por aprobar.',
    purpose: 'enrollment',
    destination: 'academy',
    heading: 'Inscripción',
    intro: 'Completa la ficha y te contactaremos para confirmar tu grupo.',
    submitLabel: 'Enviar inscripción',
    successTitle: '¡Recibimos tu inscripción!',
    successText: 'La revisaremos y te contactaremos para confirmar tu grupo y horario.',
    fields: [
      { kind: 'text', label: 'Nombre completo', required: true, role: 'name' },
      { kind: 'rut', label: 'RUT', required: true, role: 'rut' },
      { kind: 'date', label: 'Fecha de nacimiento', required: true, role: 'birthDate' },
      { kind: 'phone', label: 'Teléfono', required: true, role: 'phone' },
      { kind: 'email', label: 'Correo', role: 'email' },
      { kind: 'text', label: 'Dirección', role: 'address' },
      { kind: 'select', label: 'Grupo que te interesa', role: 'group', options: ['Aún no lo sé', 'Grupo 1', 'Grupo 2'] },
      { kind: 'text', label: 'Nombre del apoderado', role: 'guardianName', help: 'Solo si es menor de edad.' },
      { kind: 'phone', label: 'Teléfono del apoderado', role: 'guardianPhone', help: 'Solo si es menor de edad.' },
      { kind: 'email', label: 'Correo del apoderado', role: 'guardianEmail' },
      { kind: 'checkbox', label: 'Autorizo el uso de mi imagen en fotos y videos de la academia', role: 'photoConsent' },
      { kind: 'longtext', label: 'Algo que debamos saber (salud, alergias…)', role: 'message' },
    ],
  },
  {
    id: 'booking',
    label: 'Reserva o agenda',
    description: 'Día, horario y servicio: crea una tarea para confirmarla.',
    purpose: 'booking',
    destination: 'tasks',
    heading: 'Reserva tu hora',
    intro: 'Elige el día y el servicio; te confirmamos por teléfono o correo.',
    submitLabel: 'Solicitar reserva',
    successTitle: '¡Solicitud enviada!',
    successText: 'Te contactaremos para confirmar el día y la hora.',
    fields: [
      { kind: 'text', label: 'Nombre', required: true, role: 'name' },
      { kind: 'phone', label: 'Teléfono', required: true, role: 'phone' },
      { kind: 'email', label: 'Correo', role: 'email' },
      { kind: 'select', label: 'Servicio', required: true, role: 'group', options: ['Servicio 1', 'Servicio 2'] },
      { kind: 'date', label: 'Día que prefieres', required: true },
      { kind: 'choice', label: 'Horario', options: ['Mañana', 'Tarde'] },
      { kind: 'longtext', label: 'Comentarios', role: 'message' },
    ],
  },
  {
    id: 'application',
    label: 'Postulación / trabaja con nosotros',
    description: 'Cargo, experiencia y datos de contacto.',
    purpose: 'application',
    destination: 'inbox',
    heading: 'Trabaja con nosotros',
    intro: 'Cuéntanos de ti y en qué te gustaría trabajar.',
    submitLabel: 'Enviar postulación',
    successTitle: '¡Gracias por postular!',
    successText: 'Revisaremos tus datos y te contactaremos si tu perfil calza con lo que buscamos.',
    fields: [
      { kind: 'text', label: 'Nombre completo', required: true, role: 'name' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
      { kind: 'phone', label: 'Teléfono', required: true, role: 'phone' },
      { kind: 'select', label: 'Cargo al que postulas', required: true, role: 'group', options: ['Cargo 1', 'Cargo 2'] },
      { kind: 'longtext', label: 'Tu experiencia', required: true, role: 'message' },
    ],
  },
  {
    id: 'newsletter',
    label: 'Suscripción a novedades',
    description: 'Solo nombre y correo.',
    purpose: 'newsletter',
    destination: 'inbox',
    heading: 'Recibe nuestras novedades',
    intro: 'Lanzamientos, eventos y ofertas, directo a tu correo.',
    submitLabel: 'Suscribirme',
    successTitle: '¡Te suscribiste!',
    successText: 'Te escribiremos solo cuando haya algo que valga la pena.',
    fields: [
      { kind: 'text', label: 'Nombre', required: true, role: 'name' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
    ],
  },
  {
    id: 'feedback',
    label: 'Sugerencias y reclamos',
    description: 'Tipo, detalle y contacto: crea una tarea para darle respuesta.',
    purpose: 'feedback',
    destination: 'tasks',
    heading: 'Sugerencias y reclamos',
    intro: 'Tu opinión nos ayuda a mejorar. Te respondemos siempre.',
    submitLabel: 'Enviar',
    successTitle: '¡Gracias por escribirnos!',
    successText: 'Revisaremos tu mensaje y te responderemos.',
    fields: [
      { kind: 'text', label: 'Nombre', required: true, role: 'name' },
      { kind: 'email', label: 'Correo', required: true, role: 'email' },
      { kind: 'phone', label: 'Teléfono', role: 'phone' },
      { kind: 'choice', label: 'Es una…', required: true, options: ['Sugerencia', 'Reclamo', 'Felicitación'] },
      { kind: 'longtext', label: 'Cuéntanos', required: true, role: 'message' },
    ],
  },
];

export function findFormPreset(id: string): FormPreset | undefined {
  return FORM_PRESETS.find((preset) => preset.id === id);
}

export function presetFields(preset: FormPreset): FormField[] {
  return normalizeFormFields(preset.fields.map((field) => formFieldSchema.parse({ ...field, id: newFieldId() })));
}

/** Preguntas de un formulario de contacto (las de una sección «Formulario» recién agregada). */
export function contactPresetFields(): FormField[] {
  const preset = findFormPreset('contact');
  return preset ? presetFields(preset) : [];
}

// ---------------------------------------------------------------------------
// Distribución en pantalla
// ---------------------------------------------------------------------------

/** Preguntas cortas que pueden ir de a dos en una fila (correo y teléfono, servicio y fecha…). */
function isHalf(field: Pick<FormField, 'kind'>): boolean {
  return field.kind === 'email' || field.kind === 'phone' || field.kind === 'rut' || field.kind === 'date' || field.kind === 'number' || field.kind === 'select';
}

type Placed = Pick<FormField, 'kind'>;

/** Filas de preguntas: dos cortas seguidas comparten fila. */
function layoutRows<T extends Placed>(fields: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    const next = fields[index + 1];
    if (isHalf(field) && next && isHalf(next)) {
      rows.push([field, next]);
      index += 1;
    } else {
      rows.push([field]);
    }
  }
  return rows;
}

/**
 * Ancho de cada pregunta: dos cortas seguidas comparten fila; una corta sin
 * pareja, un texto largo, opciones o casillas van a todo el ancho.
 */
export function layoutFields<T extends Placed>(fields: T[]): Array<{ field: T; span: 'half' | 'full' }> {
  return layoutRows(fields).flatMap((row) => row.map((field) => ({ field, span: row.length === 2 ? ('half' as const) : ('full' as const) })));
}

/** Reparte las preguntas en pasos cortos (diseño «Por pasos»), sin separar dos de la misma fila. */
export function stepChunks<T extends Placed>(fields: T[], perStep = 4): T[][] {
  const steps: T[][] = [];
  let current: T[] = [];
  for (const row of layoutRows(fields)) {
    if (current.length > 0 && current.length + row.length > perStep) {
      steps.push(current);
      current = [];
    }
    current.push(...row);
  }
  if (current.length > 0) steps.push(current);
  return steps;
}

const ROLE_AUTOCOMPLETE: Partial<Record<DataRole, string>> = {
  name: 'name',
  email: 'email',
  phone: 'tel',
  organization: 'organization',
  address: 'street-address',
  birthDate: 'bday',
  guardianName: 'off',
  guardianPhone: 'off',
  guardianEmail: 'off',
};

/**
 * Lo que viaja al navegador de cada pregunta: sin su rol en el ERP (eso es
 * interno), con la pista de autocompletado que corresponde al dato.
 */
export function publicFormFields(fields: FormField[]): Array<Pick<FormField, 'id' | 'kind' | 'label' | 'help' | 'required' | 'options'> & { autoComplete?: string }> {
  return fields.map((field) => {
    const autoComplete = field.role ? ROLE_AUTOCOMPLETE[field.role] : undefined;
    return { id: field.id, kind: field.kind, label: field.label.trim() || FIELD_KIND_INFO[field.kind].label, help: field.help, required: field.required, options: field.options, ...(autoComplete ? { autoComplete } : {}) };
  });
}

/** Textos por omisión de cada propósito (botón y mensaje al enviar). */
export const PURPOSE_DEFAULTS: Record<FormPurpose, { submitLabel: string; successTitle: string; successText: string }> = {
  contact: { submitLabel: 'Enviar mensaje', successTitle: '¡Gracias! Recibimos tu mensaje.', successText: 'Te responderemos lo antes posible.' },
  quote: { submitLabel: 'Pedir cotización', successTitle: '¡Listo! Recibimos tu solicitud.', successText: 'Te enviaremos la cotización a la brevedad.' },
  enrollment: { submitLabel: 'Enviar inscripción', successTitle: '¡Inscripción recibida!', successText: 'Te contactaremos para confirmar tu cupo y los pasos siguientes.' },
  booking: { submitLabel: 'Solicitar reserva', successTitle: '¡Solicitud enviada!', successText: 'Te contactaremos para confirmar el día y la hora.' },
  application: { submitLabel: 'Enviar postulación', successTitle: '¡Gracias por postular!', successText: 'Revisaremos tus datos y te contactaremos.' },
  newsletter: { submitLabel: 'Suscribirme', successTitle: '¡Te suscribiste!', successText: 'Te escribiremos solo cuando haya algo que valga la pena.' },
  feedback: { submitLabel: 'Enviar', successTitle: '¡Gracias por escribirnos!', successText: 'Revisaremos tu mensaje y te responderemos.' },
  other: { submitLabel: 'Enviar', successTitle: '¡Listo! Recibimos tus respuestas.', successText: 'Te contactaremos si hace falta.' },
};

// ---------------------------------------------------------------------------
// Campos fijos del formulario del bloque «Contacto»
// ---------------------------------------------------------------------------

/** Los campos del formulario del bloque «Contacto» (fijos, con ids estables). */
export const CONTACT_FORM_FIELDS: FormField[] = normalizeFormFields([
  formFieldSchema.parse({ id: 'name', kind: 'text', label: 'Nombre', required: true, role: 'name' }),
  formFieldSchema.parse({ id: 'email', kind: 'email', label: 'Correo', required: true, role: 'email' }),
  formFieldSchema.parse({ id: 'phone', kind: 'phone', label: 'Teléfono', role: 'phone' }),
  formFieldSchema.parse({ id: 'message', kind: 'longtext', label: 'Mensaje', required: true, role: 'message' }),
]);

// ---------------------------------------------------------------------------
// Revisión del formulario (para la lista "qué falta" y el editor)
// ---------------------------------------------------------------------------

export interface FormDefinition {
  fields: FormField[];
  destination: FormDestination;
  consent: FormConsent;
}

export interface FormProblem {
  message: string;
  /** Bloquea la publicación (si no, es una recomendación). */
  blocking: boolean;
}

function roleField(fields: FormField[], role: DataRole): FormField | undefined {
  return fields.find((field) => field.role === role);
}

/**
 * Qué le falta a un formulario para funcionar con su destino. `features`
 * (opcional) son los módulos contratados: sin el módulo del destino, los
 * envíos quedan solo en la bandeja y se avisa.
 */
export function formProblems(form: FormDefinition, features?: Partial<Record<FeatureKey, boolean>>): FormProblem[] {
  const out: FormProblem[] = [];
  const fields = form.fields;
  if (fields.length === 0) return [{ message: 'no tiene preguntas', blocking: true }];
  fields.forEach((field, index) => {
    if (!field.label.trim()) out.push({ message: `la pregunta ${index + 1} no tiene texto`, blocking: true });
    if ((field.kind === 'select' || field.kind === 'choice') && field.options.length < 2) out.push({ message: `«${field.label || index + 1}» necesita al menos dos opciones`, blocking: true });
  });
  const replyField = [roleField(fields, 'email'), roleField(fields, 'phone')].find((field) => field?.required);
  if (!replyField) out.push({ message: 'no pide de forma obligatoria un correo o un teléfono para responder (marca uno como «Correo/Teléfono para responder» y obligatorio)', blocking: true });

  const info = DESTINATION_INFO[form.destination];
  for (const role of info.requiredRoles) {
    const field = roleField(fields, role);
    if (!field) out.push({ message: `para enviarlo a «${info.label}» falta una pregunta que guarde «${ROLE_INFO[role].label}»`, blocking: true });
    else if (!field.required) out.push({ message: `para enviarlo a «${info.label}», «${field.label || ROLE_INFO[role].label}» debe ser obligatoria`, blocking: true });
  }
  if (info.feature && features && !features[info.feature]) {
    out.push({ message: `tu plan no incluye el módulo de «${info.area}»: los envíos quedarán solo en la bandeja del sitio`, blocking: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Respuestas del visitante
// ---------------------------------------------------------------------------

export interface FormAnswer {
  id: string;
  label: string;
  kind: FormFieldKind;
  role: FormFieldRole;
  /** Valor ya normalizado, como texto ("Sí"/"No" en una casilla). */
  value: string;
}

export type FormAnswersResult = { ok: true; answers: FormAnswer[] } | { ok: false; error: string; fieldId?: string };

const EMAIL = z.string().email();
const PHONE_CHARS = /^[\d\s()+-]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Texto plano de una línea: sin saltos ni caracteres de control. */
function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function multiLine(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Valida y normaliza lo que mandó el visitante contra la definición del
 * formulario. Las claves que no son preguntas se ignoran; una pregunta
 * obligatoria vacía, un correo, RUT o fecha inválidos, o una opción que no
 * está en la lista devuelven el error para mostrarle.
 */
export function validateFormAnswers(fields: FormField[], raw: unknown): FormAnswersResult {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: FormAnswer[] = [];
  for (const field of fields) {
    const label = field.label.trim() || FIELD_KIND_INFO[field.kind].label;
    const rawValue = input[field.id];
    const fail = (error: string): FormAnswersResult => ({ ok: false, error, fieldId: field.id });

    if (field.kind === 'checkbox') {
      const checked = rawValue === true || rawValue === 'true' || rawValue === 'on';
      if (field.required && !checked) return fail(`Marca «${label}» para continuar`);
      answers.push({ id: field.id, label, kind: field.kind, role: field.role, value: checked ? 'Sí' : 'No' });
      continue;
    }

    const value = typeof rawValue === 'string' ? (field.kind === 'longtext' ? multiLine(rawValue) : oneLine(rawValue)) : typeof rawValue === 'number' && Number.isFinite(rawValue) ? String(rawValue) : '';
    if (!value) {
      if (field.required) return fail(`Completa «${label}»`);
      answers.push({ id: field.id, label, kind: field.kind, role: field.role, value: '' });
      continue;
    }

    let clean = value;
    switch (field.kind) {
      case 'text':
        if (value.length > MAX_TEXT_ANSWER) return fail(`«${label}» puede tener hasta ${MAX_TEXT_ANSWER} caracteres`);
        break;
      case 'longtext':
        if (value.length > MAX_LONG_ANSWER) return fail(`«${label}» puede tener hasta ${MAX_LONG_ANSWER} caracteres`);
        break;
      case 'email':
        clean = value.toLowerCase();
        if (clean.length > 120 || !EMAIL.safeParse(clean).success) return fail(`Revisa el correo en «${label}»`);
        break;
      case 'phone': {
        const digits = value.replace(/\D/g, '');
        if (value.length > 30 || !PHONE_CHARS.test(value) || digits.length < 8 || digits.length > 15) return fail(`Revisa el teléfono en «${label}»: solo números, espacios y +`);
        break;
      }
      case 'rut':
        if (value.length > 14 || !validateRut(value)) return fail(`El RUT de «${label}» no es válido`);
        clean = formatRut(value);
        break;
      case 'date':
        if (!isValidDay(value)) return fail(`Elige una fecha válida en «${label}»`);
        break;
      case 'number': {
        const normalized = value.replace(/[.\s$]/g, '');
        if (!/^\d{1,10}$/.test(normalized) || Number(normalized) > MAX_AMOUNT) return fail(`Escribe un número entero en «${label}»`);
        clean = String(Number(normalized));
        break;
      }
      case 'select':
      case 'choice':
        if (!field.options.includes(value)) return fail(`Elige una opción de la lista en «${label}»`);
        break;
      default:
        break;
    }
    answers.push({ id: field.id, label, kind: field.kind, role: field.role, value: clean });
  }
  return { ok: true, answers };
}

/** Valores por rol (solo los que vinieron con contenido). */
export function roleValues(answers: FormAnswer[]): Partial<Record<DataRole, string>> {
  const out: Partial<Record<DataRole, string>> = {};
  for (const answer of answers) {
    if (answer.role && answer.value) out[answer.role] = answer.value;
  }
  return out;
}

/** "Pregunta: respuesta", una por línea (solo las respondidas). Para notas y correos. */
export function answersText(answers: FormAnswer[]): string {
  return answers
    .filter((answer) => answer.value && !(answer.kind === 'checkbox' && answer.value === 'No'))
    .map((answer) => (answer.kind === 'longtext' && answer.value.includes('\n') ? `${answer.label}:\n${answer.value}` : `${answer.label}: ${answer.value}`))
    .join('\n');
}

/** Respuestas guardadas en la base (JSON) → lista tipada; tolera datos viejos o dañados. */
export const storedAnswersSchema = z
  .array(
    z.object({
      id: z.string().max(40).catch(''),
      label: z.string().max(200).catch(''),
      kind: z.enum(FORM_FIELD_KINDS).catch('text'),
      role: z.enum(FORM_FIELD_ROLES).catch(''),
      value: z.string().max(MAX_LONG_ANSWER + 200).catch(''),
    })
  )
  .max(MAX_FORM_FIELDS + 4)
  .catch([]);

export function parseStoredAnswers(raw: unknown): FormAnswer[] {
  return storedAnswersSchema.parse(raw ?? []);
}

/** Etiqueta segura para ordenar ("Inscripciones 2027"): una línea, sin símbolos raros. */
export function normalizeTag(value: string): string {
  return oneLine(value).replace(/[<>"'`]/g, '').slice(0, 30);
}
