export const dynamic = 'force-static';
export function GET() {
  return Response.json(
    {
      name: 'Aether Control',
      short_name: 'Aether Control',
      id: '/control',
      start_url: '/control',
      scope: '/control',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#12161f',
      lang: 'es-CL',
      icons: [
        { src: '/icon.png', sizes: '192x192', type: 'image/png' },
        {
          src: '/branding/app-icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
}
