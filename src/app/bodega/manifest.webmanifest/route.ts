/**
 * Manifest de la app del bodeguero. Es una app instalable aparte de Aether ERP:
 * abre directo en `/bodega`, a pantalla completa y vertical, con su propio
 * nombre en el celular. El alcance (`scope`) la deja dentro de `/bodega`: un
 * enlace al panel completo se abre en el navegador, no dentro de la app.
 */
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    name: 'Aether Bodega',
    short_name: 'Bodega',
    description: 'Ingresa, descuenta y traslada productos de tu bodega desde el celular. Identifica productos con una foto.',
    id: '/bodega',
    start_url: '/bodega',
    scope: '/bodega',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12161f',
    theme_color: '#12161f',
    lang: 'es-CL',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/branding/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
