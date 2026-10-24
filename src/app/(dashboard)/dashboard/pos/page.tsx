import { redirect } from 'next/navigation';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import PosScreen from '@/components/pos/PosScreen';

export const metadata = { title: 'Punto de Venta' };

export default async function PosPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }
  return <PosScreen context={context} />;
}
