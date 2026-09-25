/**
 * Configuración editable del certamen público de postulación (Sección 5 del
 * prompt del módulo: "un bloque CONFIG... para que la organización pueda
 * editarlo sin tocar el resto"). Vive en un módulo sin `'use client'` (a
 * diferencia de antes, donde estaba dentro de `CandidateRegistrationClient.tsx`)
 * para que tanto ese componente de cliente como una página de servidor
 * (`/politica-privacidad`) puedan importarlo sin cruzar el límite
 * cliente/servidor de Next.js.
 */
export const CONFIG = {
  heroTitulo: 'Postula al certamen',
  /** Bajada por defecto del hero, si el certamen no escribió la suya (`Project.publicTagline`). */
  heroBajada: 'Una postulación, una oportunidad. Súmate a la nueva generación de embajadoras de La Araucanía.',
  // El nombre del certamen y su contacto (correo, WhatsApp, Instagram) ya no
  // viven acá: son de cada certamen (`Project.name`, `publicContactEmail`,
  // `publicWhatsapp`, `instagramHandle`) y se editan en la convocatoria.
  // URL pública de las bases (PDF). `null` mientras no exista el archivo: el
  // formulario muestra la casilla sin enlace. Antes apuntaba a
  // '/bases-certamen.pdf', que no existe y, por no ser ruta pública, mandaba
  // al login a quien intentaba leer las bases antes de aceptarlas.
  basesUrl: null as string | null,
  privacidadUrl: '/politica-privacidad',
};
