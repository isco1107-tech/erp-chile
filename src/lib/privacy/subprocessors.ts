/**
 * Terceros que tratan datos personales por cuenta de la plataforma o de la
 * empresa (sub-encargados). Es la fuente única de la página pública
 * `/aether/subencargados`, del registro de actividades de tratamiento y de la
 * lista de transferencias internacionales: si el código empieza a usar un
 * servicio nuevo, se agrega aquí.
 *
 * `scope`:
 *  - PLATFORM: lo usa la plataforma para todas las empresas.
 *  - COMPANY: la empresa conecta su propia cuenta (Configuración → Integraciones).
 *  - OPTIONAL: solo si se configura (puede no estar activo).
 */

export type SubprocessorScope = 'PLATFORM' | 'COMPANY' | 'OPTIONAL';

export interface Subprocessor {
  id: string;
  name: string;
  service: string;
  /** Qué datos le llegan. */
  data: string;
  /** País o región donde se tratan los datos, según la configuración actual. */
  location: string;
  /** `true` si los datos salen de Chile. */
  international: boolean;
  scope: SubprocessorScope;
}

export const SUBPROCESSORS: readonly Subprocessor[] = [
  {
    id: 'neon',
    name: 'Neon',
    service: 'Base de datos PostgreSQL',
    data: 'Todos los datos del sistema, de todas las empresas.',
    location: 'Estados Unidos (AWS us-east-2)',
    international: true,
    scope: 'PLATFORM',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    service: 'Alojamiento de la aplicación, ejecución de funciones, archivos subidos antes de la migración a R2 (Vercel Blob) y estadística de visitas (Web Analytics)',
    data: 'Tráfico de la aplicación (incluye direcciones IP) y archivos subidos. La estadística de visitas no usa cookies y solo cuenta las páginas propias de Aether, sin tokens ni datos de los sitios de las empresas.',
    location: 'Estados Unidos',
    international: true,
    scope: 'PLATFORM',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    service: 'Almacenamiento de archivos (R2), verificación anti-bots (Turnstile) y red',
    data: 'Fotografías, contratos y adjuntos; dirección IP y datos del navegador al verificar un formulario.',
    location: 'Global',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'brevo',
    name: 'Brevo',
    service: 'Envío de correo transaccional (invitaciones, comprobantes, recordatorios)',
    data: 'Correo y nombre del destinatario, y el contenido del mensaje.',
    location: 'Unión Europea',
    international: true,
    scope: 'COMPANY',
  },
  {
    id: 'resend',
    name: 'Resend',
    service: 'Envío de correo transaccional (alternativa a Brevo)',
    data: 'Correo y nombre del destinatario, y el contenido del mensaje.',
    location: 'Estados Unidos',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'google-gemini',
    name: 'Google (Gemini API)',
    service: 'Inteligencia artificial: lectura de facturas por foto, asistente y agentes, búsqueda de datos de empresas',
    data: 'Imágenes de documentos y datos de negocio que el usuario envía a la IA.',
    location: 'Estados Unidos',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    service: 'Inteligencia artificial (modelos de razonamiento del asistente)',
    data: 'Datos de negocio que el usuario envía al asistente.',
    location: 'Estados Unidos',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'khipu',
    name: 'Khipu',
    service: 'Cobro en línea de cuotas por transferencia bancaria',
    data: 'Nombre y correo de quien paga, monto y glosa del cobro.',
    location: 'Chile',
    international: false,
    scope: 'COMPANY',
  },
  {
    id: 'zapsign',
    name: 'ZapSign',
    service: 'Firma electrónica de contratos',
    data: 'Contrato en PDF, nombre y correo de quien firma.',
    location: 'Brasil',
    international: true,
    scope: 'COMPANY',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    service: 'Monitoreo de errores',
    data: 'Detalle técnico de errores, con contraseñas y tokens censurados automáticamente.',
    location: 'Según el proyecto de Sentry configurado',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'google-fonts',
    name: 'Google Fonts',
    service: 'Tipografías de las páginas públicas',
    data: 'Dirección IP y navegador de quien visita una página pública.',
    location: 'Estados Unidos',
    international: true,
    scope: 'PLATFORM',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    service: 'Búsqueda de datos públicos de una empresa al crear un contacto (respaldo de la IA)',
    data: 'RUT o nombre de la empresa buscada.',
    location: 'Estados Unidos',
    international: true,
    scope: 'OPTIONAL',
  },
  {
    id: 'supersuite',
    name: 'Supersuite (Render)',
    service: 'Centro de mando de la plataforma: uso por módulo y alertas operativas',
    data: 'Solo identificadores de empresa, módulo y acción. Ningún dato personal ni de documentos.',
    location: 'Estados Unidos',
    international: true,
    scope: 'PLATFORM',
  },
];

export const SCOPE_LABELS: Record<SubprocessorScope, string> = {
  PLATFORM: 'Plataforma',
  COMPANY: 'Cuenta de la empresa',
  OPTIONAL: 'Opcional',
};

export const INTERNATIONAL_SUBPROCESSORS = SUBPROCESSORS.filter((s) => s.international);
