import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { PublicStatus } from '@/components/public/PublicShell';
import { SellerCenterAccept } from '@/components/public/seller-center/AccountForms';
import { SUPPLIER_PORTAL_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { inspectInvitation } from '@/modules/inventory/services/seller-center-auth.service';

export const metadata: Metadata = { title: 'Activar cuenta · Seller Center', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function SellerCenterInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, SUPPLIER_PORTAL_RATE_LIMIT).allowed) {
    return <PublicStatus accent="emerald" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const invitation = await inspectInvitation(token);
  if (invitation.state !== 'valid') {
    return (
      <PublicStatus accent="emerald" variant="error" title="Enlace no válido" message="La invitación venció, ya se usó o la empresa la anuló. Pídele una nueva a la empresa.">
        <Link href="/proveedor/cuenta/ingresar" className="pub-hint">
          ¿Ya tienes cuenta? Ingresa aquí
        </Link>
      </PublicStatus>
    );
  }
  return <SellerCenterAccept token={token} email={invitation.email} phone={invitation.phone} personName={invitation.personName} hasPassword={invitation.hasPassword} companyName={invitation.companyName} supplierName={invitation.supplierName} />;
}
