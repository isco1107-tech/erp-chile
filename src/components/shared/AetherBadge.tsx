import { platformBaseUrl } from '@/lib/hosting/custom-domain';

/**
 * Marca de agua del producto: "hecho con Aether ERP", con el ícono de marca
 * en la esquina inferior derecha — lejos de la esquina inferior
 * izquierda, donde Next.js dibuja su propio indicador de entorno de
 * desarrollo (`devIndicators`, solo en `next dev`, nunca en producción).
 * Tampoco choca con el logo de la empresa cliente, que vive arriba a la
 * izquierda del sidebar. Vive en el layout raíz (no en el del dashboard)
 * para que se vea en toda la superficie del producto, no solo dentro de una
 * empresa autenticada.
 *
 * Lleva a la landing de Aether (la raíz de la plataforma). Es siempre una URL ABSOLUTA de la plataforma: en el dominio
 * propio de un cliente (`minegocio.cl`) una ruta relativa `/` sería el sitio del propio cliente. Abre en otra pestaña
 * para que quien visita el sitio de un cliente no lo pierda. Es un `<a>` y no un `Link`: en el dominio de un cliente la
 * precarga de `Link` hacia otro origen chocaba con el CSP (`connect-src 'self'`) y dejaba un error en cada carga.
 * La política de privacidad de la plataforma sigue enlazada desde el pie de la landing y del login.
 */
export default function AetherBadge() {
  return (
    <a
      href={`${platformBaseUrl()}/`}
      target="_blank"
      rel="noopener"
      aria-label="Hecho con Aether ERP — conoce Aether (se abre en otra pestaña)"
      className="aether-platform-badge fixed right-4 bottom-20 z-30 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 opacity-70 shadow-sm backdrop-blur-sm transition-opacity duration-150 hover:opacity-100 print:hidden"
    >
      {/* Versión de 42 px (3 veces los 14 px en pantalla): el logo completo pesa 416 KB. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/branding/logo-badge.png" alt="" aria-hidden="true" width={56} height={42} className="h-3.5 w-3.5 shrink-0 object-contain" />
      Hecho con Aether ERP
    </a>
  );
}
