'use client';

import { Analytics } from '@vercel/analytics/next';
import { sanitizeAnalyticsUrl } from '@/lib/analytics/privacy';

/**
 * Vercel Web Analytics con el filtro de privacidad de
 * `src/lib/analytics/privacy.ts`: solo páginas propias de Aether, sin
 * consulta, sin tokens y con los ids reemplazados.
 */
export default function PrivateAnalytics({ platformHosts }: { platformHosts: string[] }) {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = sanitizeAnalyticsUrl(event.url, platformHosts);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
