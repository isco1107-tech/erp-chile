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
  certamenNombre: 'Miss Universo Temuco',
  heroTitulo: 'Postula al certamen',
  heroBajada: 'Una postulación, una oportunidad. Súmate a la nueva generación de embajadoras de La Araucanía.',
  // Imagen de fondo del hero: reemplaza abajo por la URL real (o una ruta de
  // /public) — ver la variable CSS `--hero-photo` en `CandidateRegistrationClient.tsx`.
  contactoWhatsapp: 'https://wa.me/56900000000', // TODO: reemplazar por el número real
  contactoInstagram: 'https://instagram.com/misstemuco', // TODO: reemplazar por el usuario real
  basesUrl: '/bases-certamen.pdf', // TODO: reemplazar por el archivo real de bases
  privacidadUrl: '/politica-privacidad',
  contactoEmail: 'contacto@misstemuco.cl', // TODO: reemplazar por el correo real
};
