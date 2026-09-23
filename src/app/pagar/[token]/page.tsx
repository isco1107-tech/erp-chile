import type { Metadata } from 'next';
import InstallmentPortalClient from '@/components/payment-plans/InstallmentPortalClient';
import { PublicStatus } from '@/components/public/PublicShell';
import { getPublicInstallmentPortal } from '@/modules/payment-plans/services/online-payment.service';

export const metadata: Metadata = { title: 'Pago de cuotas', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function InstallmentPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await getPublicInstallmentPortal(token);

  if (!portal) {
    return (
      <PublicStatus
        accent="gold"
        variant="error"
        title="Link de pago inválido o expirado"
        message="Pide a la organización del certamen el link vigente para pagar las cuotas."
      />
    );
  }

  return <InstallmentPortalClient token={token} portal={portal} />;
}
