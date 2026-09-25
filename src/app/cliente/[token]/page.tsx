import type { Metadata } from 'next';
import { headers } from 'next/headers';
import CustomerPortalClient from '@/components/contacts/CustomerPortalClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { checkRateLimit, CUSTOMER_PORTAL_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getCustomerPortalView } from '@/modules/contacts/services/customer-portal.service';

export const metadata: Metadata = { title: 'Portal de clientes', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, CUSTOMER_PORTAL_RATE_LIMIT).allowed) {
    return <PublicStatus accent="gold" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const view = await getCustomerPortalView(token);
  if (!view) {
    return <PublicStatus accent="gold" variant="error" title="Enlace no válido" message="El enlace no existe o fue reemplazado. Pide uno nuevo a tu ejecutivo." />;
  }
  return <CustomerPortalClient token={token} view={view} />;
}
