import { redirect } from 'next/navigation';
import { AuthError, IpNotAllowedError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import PosScreen from '@/components/pos/PosScreen';

export default async function PosPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/pos/ingresar?reason=ip');
    if (error instanceof AuthError) redirect('/pos/ingresar');
    throw error;
  }
  if (context.mustChangePassword) redirect('/change-password');
  return <PosScreen context={context} />;
}
