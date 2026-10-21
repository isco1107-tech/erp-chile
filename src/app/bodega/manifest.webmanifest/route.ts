export function GET() {
  return Response.json({ id: '/bodega', name: 'Aether Bodega', short_name: 'Bodega', start_url: '/bodega', scope: '/bodega', display: 'standalone', lang: 'es-CL', theme_color: '#12161f', background_color: '#f8f8f6', icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }, { src: '/branding/app-icon-512.png', sizes: '512x512', type: 'image/png' }] }, { headers: { 'Content-Type': 'application/manifest+json' } });
}
