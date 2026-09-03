import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import PaymentPlanForm from '@/components/payment-plans/PaymentPlanForm';

export const metadata = { title: 'Nuevo Plan de Pago' };

export default async function NewPaymentPlanPage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `paymentplans:write` llenaba el formulario completo para recibir un
  // 403 al guardar.
  const context = await getAuthContext();
  if (!can(context, 'paymentplans:write')) redirect('/dashboard/payment-plans');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nuevo Plan de Pago</h1>
      <PaymentPlanForm />
    </div>
  );
}
