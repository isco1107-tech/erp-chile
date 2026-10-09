import type { Subprocessor } from './subprocessors';

/**
 * Registro de actividades de tratamiento de datos personales: qué datos se
 * tratan en cada parte del sistema, para qué, con qué base, por cuánto tiempo
 * y a quién llegan. Describe lo que el código hace HOY (campos reales de
 * `prisma/schema.prisma`); si un módulo cambia lo que guarda, se actualiza
 * aquí. Cada empresa lo descarga desde Configuración → Protección de datos.
 *
 * Los plazos de conservación son sugerencias de partida: la responsable (la
 * empresa) debe ajustarlos a su política y validarlos con su asesoría.
 */

export type LegalBasis = 'CONSENT' | 'CONTRACT' | 'LEGAL_OBLIGATION' | 'LEGITIMATE_INTEREST';

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  CONSENT: 'Consentimiento',
  CONTRACT: 'Ejecución de un contrato o medidas precontractuales',
  LEGAL_OBLIGATION: 'Obligación legal',
  LEGITIMATE_INTEREST: 'Interés legítimo',
};

export interface ProcessingActivity {
  id: string;
  name: string;
  /** Módulo contratado que la genera, para mostrarla solo si aplica; `always` = todas las empresas. */
  module: 'always' | 'candidates' | 'hr' | 'ticketing' | 'public-voting' | 'payment-plans' | 'sponsorships' | 'customer-care' | 'messaging' | 'web-sites' | 'academy';
  dataSubjects: string;
  dataCategories: string[];
  purpose: string;
  legalBasis: LegalBasis[];
  /** Incluye datos sensibles (salud, biometría, etc.) o de menores. */
  sensitive: boolean;
  retention: string;
  recipients: string[];
  /** Ids de `SUBPROCESSORS` que reciben estos datos. */
  subprocessors: string[];
}

export const PROCESSING_ACTIVITIES: readonly ProcessingActivity[] = [
  {
    id: 'users',
    name: 'Usuarios del sistema',
    module: 'always',
    dataSubjects: 'Personas del equipo con acceso al ERP',
    dataCategories: ['Nombre', 'Correo', 'Teléfono', 'Fotografía de perfil', 'Contraseña (solo su hash)', 'Sesiones (IP y navegador)', 'Registro de acciones (auditoría)'],
    purpose: 'Dar acceso al sistema, controlar permisos y resguardar la seguridad de la cuenta.',
    legalBasis: ['CONTRACT', 'LEGITIMATE_INTEREST'],
    sensitive: false,
    retention: 'Mientras la cuenta esté activa. La auditoría se conserva para fines de seguridad.',
    recipients: ['Administradores de la empresa'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'contacts',
    name: 'Clientes y proveedores',
    module: 'always',
    dataSubjects: 'Clientes y proveedores (personas naturales y contactos de empresas)',
    dataCategories: ['Razón social o nombre', 'RUT', 'Correo', 'Teléfono', 'Dirección y comuna', 'Documentos tributarios emitidos y recibidos', 'Pagos'],
    purpose: 'Facturar, cobrar, comprar y cumplir las obligaciones tributarias.',
    legalBasis: ['CONTRACT', 'LEGAL_OBLIGATION'],
    sensitive: false,
    retention: 'Plazo de conservación tributaria y contable (en general 6 años; confirmar con el contador).',
    recipients: ['Equipo de ventas, tesorería y contabilidad', 'Servicio de Impuestos Internos cuando corresponde'],
    subprocessors: ['neon', 'vercel', 'brevo', 'duckduckgo', 'google-gemini'],
  },
  {
    id: 'candidates',
    name: 'Postulación y gestión de candidatas',
    module: 'candidates',
    dataSubjects: 'Postulantes y candidatas, incluidas personas menores de edad, y sus apoderados',
    dataCategories: [
      'Nombre completo y RUT',
      'Edad o fecha de nacimiento',
      'Teléfono, correo, comuna e Instagram',
      'Motivación para postular',
      'Fotografías',
      'Condiciones médicas y certificado médico',
      'Nombre y RUT del apoderado (menores)',
      'IP y navegador del envío',
      'Constancia del consentimiento (fecha y versión de la política)',
    ],
    purpose: 'Recibir y evaluar postulaciones, organizar el certamen, firmar el contrato de imagen y cobrar cuotas.',
    legalBasis: ['CONSENT', 'CONTRACT'],
    sensitive: true,
    retention: 'Postulaciones descartadas: se eliminan automáticamente a los 12 meses (configurable). Candidatas seleccionadas: mientras dure el certamen y sus obligaciones contractuales.',
    recipients: ['Organización del certamen', 'Jurado, con acceso limitado a lo necesario'],
    subprocessors: ['neon', 'vercel', 'cloudflare', 'brevo', 'zapsign', 'khipu'],
  },
  {
    id: 'hr',
    name: 'Trabajadores y remuneraciones',
    module: 'hr',
    dataSubjects: 'Trabajadores de la empresa',
    dataCategories: ['Nombre y RUT', 'Contacto y dirección', 'Fecha de nacimiento y nacionalidad', 'AFP y sistema de salud (Fonasa/Isapre)', 'Datos bancarios', 'Liquidaciones, préstamos, anticipos y finiquitos', 'Vacaciones'],
    purpose: 'Administrar la relación laboral, calcular y pagar remuneraciones y cumplir obligaciones previsionales.',
    legalBasis: ['CONTRACT', 'LEGAL_OBLIGATION'],
    sensitive: true,
    retention: 'Plazo laboral y previsional aplicable (confirmar con asesoría laboral).',
    recipients: ['Administración y contabilidad', 'Instituciones previsionales y Servicio de Impuestos Internos cuando corresponde'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'ticketing',
    name: 'Venta de entradas',
    module: 'ticketing',
    dataSubjects: 'Compradores de entradas',
    dataCategories: ['Nombre', 'Correo', 'Teléfono', 'Monto y estado del pago', 'Código QR de la entrada'],
    purpose: 'Vender entradas, confirmar el pago y controlar el acceso al evento.',
    legalBasis: ['CONTRACT'],
    sensitive: false,
    retention: 'Hasta el cierre del evento y el plazo de reclamos o de conservación contable que defina la organización.',
    recipients: ['Organización del evento'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'public-voting',
    name: 'Votación del público',
    module: 'public-voting',
    dataSubjects: 'Personas que compran votos',
    dataCategories: ['Correo', 'Teléfono', 'Cantidad de votos y pago'],
    purpose: 'Registrar y confirmar los votos pagados.',
    legalBasis: ['CONTRACT'],
    sensitive: false,
    retention: 'Hasta el cierre del certamen y el plazo contable que defina la organización.',
    recipients: ['Organización del certamen'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'payment-plans',
    name: 'Pago en línea de cuotas',
    module: 'payment-plans',
    dataSubjects: 'Quien paga una cuota (candidata, familia o auspiciador)',
    dataCategories: ['Nombre y correo del pagador', 'Banco y datos del cobro', 'Comprobante de pago'],
    purpose: 'Cobrar cuotas y emitir el comprobante.',
    legalBasis: ['CONTRACT', 'LEGAL_OBLIGATION'],
    sensitive: false,
    retention: 'Plazo de conservación contable y tributaria.',
    recipients: ['Tesorería de la organización', 'Khipu'],
    subprocessors: ['neon', 'vercel', 'khipu', 'brevo'],
  },
  {
    id: 'sponsorships',
    name: 'Auspiciadores y contactos comerciales',
    module: 'sponsorships',
    dataSubjects: 'Personas de contacto de marcas interesadas en auspiciar',
    dataCategories: ['Nombre', 'Empresa', 'Correo', 'Teléfono', 'Mensaje enviado desde el sitio'],
    purpose: 'Responder consultas y gestionar contratos de auspicio.',
    legalBasis: ['CONSENT', 'CONTRACT'],
    sensitive: false,
    retention: 'Mientras dure la relación comercial; consultas sin respuesta, hasta 12 meses sugeridos.',
    recipients: ['Equipo comercial de la organización'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'customer-care',
    name: 'Encuestas de satisfacción y seguimiento de clientes',
    module: 'customer-care',
    dataSubjects: 'Clientes',
    dataCategories: ['Respuestas de encuesta (nota y comentario)', 'Canal de origen', 'Seguimientos y compras'],
    purpose: 'Medir satisfacción y recuperar clientes inactivos.',
    legalBasis: ['LEGITIMATE_INTEREST'],
    sensitive: false,
    retention: 'Hasta 24 meses sugeridos desde la respuesta.',
    recipients: ['Equipo de ventas y atención'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'web-contact',
    name: 'Formulario de contacto de sitios web',
    module: 'web-sites',
    dataSubjects: 'Visitantes que escriben desde el sitio web de la empresa',
    dataCategories: ['Nombre', 'Correo', 'Teléfono (opcional)', 'Mensaje'],
    purpose: 'Responder la consulta enviada desde el sitio web.',
    legalBasis: ['CONSENT'],
    sensitive: false,
    retention: 'Hasta responder la consulta; sugerido hasta 12 meses si no hay relación comercial.',
    recipients: ['Equipo de la empresa dueña del sitio'],
    subprocessors: ['neon', 'vercel'],
  },
  {
    id: 'academy-enrollment',
    name: 'Academia: inscripción, asistencia y mensualidades',
    module: 'academy',
    dataSubjects: 'Alumnas de la academia y, si son menores de edad, sus madres, padres o apoderados',
    dataCategories: ['Nombre', 'RUT', 'Fecha de nacimiento', 'Teléfono', 'Correo', 'Datos del apoderado', 'Autorización de uso de imagen', 'Asistencia a clases', 'Mensualidades pagadas'],
    purpose: 'Revisar inscripciones, asignar grupos, controlar la asistencia y el pago de la mensualidad, y enviar por correo el material de las clases.',
    legalBasis: ['CONSENT', 'CONTRACT'],
    sensitive: false,
    retention: 'Mientras la alumna esté inscrita; sugerido hasta 12 meses después de su baja. Una inscripción rechazada se puede eliminar de inmediato.',
    recipients: ['Equipo de la academia'],
    subprocessors: ['neon', 'vercel', 'brevo'],
  },
  {
    id: 'messaging',
    name: 'Mensajería interna',
    module: 'messaging',
    dataSubjects: 'Usuarios del sistema',
    dataCategories: ['Mensajes (cifrados en reposo)', 'Adjuntos'],
    purpose: 'Comunicación interna del equipo.',
    legalBasis: ['LEGITIMATE_INTEREST'],
    sensitive: false,
    retention: 'Mientras la empresa los conserve.',
    recipients: ['Participantes de la conversación'],
    subprocessors: ['neon', 'vercel', 'cloudflare'],
  },
  {
    id: 'security',
    name: 'Seguridad y trazabilidad',
    module: 'always',
    dataSubjects: 'Usuarios y visitantes de formularios públicos',
    dataCategories: ['Dirección IP', 'Navegador', 'Intentos de acceso', 'Registro de acciones'],
    purpose: 'Prevenir fraudes y accesos no autorizados y reconstruir lo ocurrido ante un incidente.',
    legalBasis: ['LEGITIMATE_INTEREST'],
    sensitive: false,
    retention: 'El mínimo necesario para fines de seguridad.',
    recipients: ['Administradores de la empresa y de la plataforma'],
    subprocessors: ['neon', 'vercel', 'cloudflare', 'sentry'],
  },
];

/** Resuelve los ids de sub-encargados de una actividad a sus fichas. */
export function activitySubprocessors(activity: ProcessingActivity, all: readonly Subprocessor[]): Subprocessor[] {
  return activity.subprocessors.map((id) => all.find((s) => s.id === id)).filter((s): s is Subprocessor => Boolean(s));
}
