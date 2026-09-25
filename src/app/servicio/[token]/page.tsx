import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ServiceTrackingClient from '@/components/service/ServiceTrackingClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { checkRateLimit, SERVICE_TRACKING_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getPublicServiceView } from '@/modules/service-desk/services/service-tickets.service';

export const metadata: Metadata = { title: 'Seguimiento de tu equipo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ServiceTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, SERVICE_TRACKING_RATE_LIMIT).allowed) {
    return <PublicStatus accent="gold" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const view = await getPublicServiceView(token);
  if (!view) {
    return <PublicStatus accent="gold" variant="error" title="Enlace no válido" message="Revisa que el enlace esté completo o pide uno nuevo al servicio técnico." />;
  }
  return <ServiceTrackingClient token={token} view={view} />;
}
