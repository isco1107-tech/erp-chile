import type { Metadata } from 'next';
import { headers } from 'next/headers';
import SupplierPortalClient from '@/components/public/SupplierPortalClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { SUPPLIER_PORTAL_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getSupplierPortalView } from '@/modules/inventory/services/supplier-portal.service';

export const metadata: Metadata = { title: 'Inventario del proveedor', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function SupplierPortalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, SUPPLIER_PORTAL_RATE_LIMIT).allowed) {
    return <PublicStatus accent="emerald" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const view = await getSupplierPortalView(decodeURIComponent(code));
  if (!view) {
    return <PublicStatus accent="emerald" variant="error" title="Código no válido" message="El código no existe, fue reemplazado o el acceso se desactivó. Pide uno nuevo a la empresa." />;
  }
  return <SupplierPortalClient code={code} view={view} />;
}
