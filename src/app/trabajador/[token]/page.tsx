import type { Metadata } from 'next';
import { headers } from 'next/headers';
import EmployeePortalClient from '@/components/hr/EmployeePortalClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { checkRateLimit, EMPLOYEE_PORTAL_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getPortalView } from '@/modules/hr/services/employee-portal.service';

export const metadata: Metadata = { title: 'Portal del trabajador', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EmployeePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, EMPLOYEE_PORTAL_RATE_LIMIT).allowed) {
    return <PublicStatus accent="gold" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const view = await getPortalView(token);
  if (!view) {
    return <PublicStatus accent="gold" variant="error" title="Enlace inválido o expirado" message="Pide a Recursos Humanos un enlace nuevo a tu portal." />;
  }
  return <EmployeePortalClient token={token} view={view} />;
}
