export const dynamic = 'force-static';
export function GET() {
  return Response.json(
    {
      name: 'Seller Center',
      short_name: 'Seller Center',
      id: '/proveedor/cuenta',
      start_url: '/proveedor/cuenta',
      scope: '/proveedor/cuenta',
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
