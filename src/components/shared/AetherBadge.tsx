import Link from 'next/link';

/**
 * Marca de agua del producto: "hecho con Aether ERP", con el ícono de marca
 * en la esquina inferior derecha. Se ubica por encima del botón flotante del
 * copiloto IA (`AiCopilotDrawer`, `right-5 bottom-5`, 56px de alto) en vez de
 * al lado, para no competir con él — y lejos de la esquina inferior
 * izquierda, donde Next.js dibuja su propio indicador de entorno de
 * desarrollo (`devIndicators`, solo en `next dev`, nunca en producción).
 * Tampoco choca con el logo de la empresa cliente, que vive arriba a la
 * izquierda del sidebar. Vive en el layout raíz (no en el del dashboard)
 * para que se vea en toda la superficie del producto, no solo dentro de una
 * empresa autenticada.
 *
 * Enlaza a `/aether/privacidad` (ruta pública, exceptuada en `src/proxy.ts`):
 * es el único lugar del producto que apunta a la política de privacidad de
 * la plataforma Aether, distinta de la política de cada empresa cliente.
 */
export default function AetherBadge() {
  return (
    <Link
      href="/aether/privacidad"
      aria-label="Hecho con Aether ERP Solutions — ver política de privacidad de la plataforma"
      className="fixed right-4 bottom-20 z-30 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 opacity-70 shadow-sm backdrop-blur-sm transition-opacity duration-150 hover:opacity-100 print:hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/branding/logo.png" alt="" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 object-contain" />
      Hecho con Aether ERP
    </Link>
  );
}
