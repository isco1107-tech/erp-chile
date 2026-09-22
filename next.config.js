/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/downloads/:path*',
        headers: [
          { key: 'Content-Disposition', value: 'attachment' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        // No incluye /api/agents/run (SSE) a propósito: una CSP restrictiva no
        // le afecta, pero mantenerla explícita en todas las rutas simplifica
        // el razonamiento — es la misma política en toda la app.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // ── CSP ──────────────────────────────────────────────────────────
          // `unsafe-inline` y `unsafe-eval` son necesarios para Next.js sin
          // nonce (la hidratación inyecta scripts inline). `base-uri 'self'`
          // y `form-action 'self'` son las directivas más valiosas que no
          // rompen compatibilidad: impiden ataques de base-tag hijacking y
          // data exfiltration vía forms respectivamente.
          //
          // `frame-ancestors 'self'` reemplaza a X-Frame-Options (obsoleto) y
          // bloquea clickjacking. `img-src` incluye Vercel Blob (logos/fotos)
          // y data:/blob: (thumbnails generados). `connect-src` permite la API
          // de Gemini (módulo de agentes de IA).
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
              "font-src 'self'",
              "connect-src 'self' https://generativelanguage.googleapis.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Sin geolocalización/cámara/micrófono en ninguna pantalla del ERP.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS solo se respeta sobre HTTPS igualmente; en dev por HTTP el
          // navegador la ignora, así que no hace falta condicionarla a NODE_ENV.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
