import { redirect } from 'next/navigation';
import { getAuthContext, AuthError, TenantInactiveError } from '@/lib/auth/guards';
import ChangePasswordForm from '@/components/ChangePasswordForm';

export const metadata = { title: 'Nueva contraseña' };

/**
 * Pantalla de salida obligatoria para una contraseña temporal, igual que
 * `/suspended` para un tenant inactivo: vive fuera de `(dashboard)` a
 * propósito, porque ese layout es justo el que redirige aquí.
 */
export default async function ChangePasswordPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  // Ya la cambió (por ejemplo, en otra pestaña): no tiene sentido insistir.
  if (!context.mustChangePassword) redirect('/dashboard');

  return <ChangePasswordForm email={context.email} />;
}
