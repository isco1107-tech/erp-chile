export function GET() {
  return Response.json(
    {
      id: '/pos',
      name: 'Aether Caja POS',
      short_name: 'Caja POS',
      description: 'Terminal dedicado de Punto de Venta y Caja para Supermercados y Comercio — Aether ERP',
      start_url: '/pos',
      scope: '/pos',
      display: 'standalone',
      orientation: 'any',
      lang: 'es-CL',
      theme_color: '#12161f',
      background_color: '#f7f6f3',
      icons: [
        { src: '/icon.png', sizes: '192x192', type: 'image/png' },
        { src: '/branding/app-icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } }
  );
}

