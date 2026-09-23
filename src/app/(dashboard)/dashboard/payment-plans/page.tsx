import PaymentPlanListClient from '@/components/payment-plans/PaymentPlanListClient';
import OnlinePaymentPortalCard from '@/components/payment-plans/OnlinePaymentPortalCard';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Cuotas / Mensualidades' };

export default async function PaymentPlansPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'paymentplans:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Cuotas / Mensualidades</h1>
      <OnlinePaymentPortalCard />
      <PaymentPlanListClient canWrite={canWrite} />
    </div>
  );
}
