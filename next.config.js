/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Fotogramas del hero: las URLs llevan ?v=<hash del contenido>
        // (scripts/generate-cinematic-frames.cjs), así que no cambian nunca.
        source: '/marketing/cinematic/seq/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
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
          //
          // `challenges.cloudflare.com` es Cloudflare Turnstile (login y
          // postulación de candidatas, ver src/lib/security/turnstile.ts): su
          // script, su iframe y su verificación. Solo se usa si están las
          // llaves; permitirlo siempre no abre nada más.
          // `object-src 'none'` bloquea plugins (Flash/PDF embebido como
          // vector de XSS) y `upgrade-insecure-requests` sube a HTTPS cualquier
          // recurso http:// que se haya colado.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
              "font-src 'self'",
              "connect-src 'self' https://generativelanguage.googleapis.com https://challenges.cloudflare.com",
              "frame-src 'self' https://challenges.cloudflare.com",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Sin geolocalización/cámara/micrófono en ninguna pantalla del ERP.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
          // Aísla la ventana de otras pestañas de origen distinto (Spectre /
          // tabnabbing) sin romper ventanas emergentes propias (OAuth, pago).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // HSTS solo se respeta sobre HTTPS igualmente; en dev por HTTP el
          // navegador la ignora, así que no hace falta condicionarla a NODE_ENV.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
