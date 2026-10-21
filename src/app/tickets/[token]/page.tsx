import TicketPurchaseClient from '@/components/ticketing/TicketPurchaseClient';
import PublicPrivacyFooter from '@/components/legal/PublicPrivacyFooter';

export const metadata = { title: 'Venta de Entradas' };

export default async function TicketPurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <TicketPurchaseClient token={token} />
      <PublicPrivacyFooter flow="entradas" token={token} />
    </>
  );
}
