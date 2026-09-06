import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import F29Client from '@/components/reports/F29Client';

export const metadata = { title: 'Formulario 29 (F29)' };

export default async function F29Page() {
  const context = await getAuthContext();
  if (!can(context, 'reports:read')) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Formulario 29 (F29)</h1>
        <p className="text-sm text-muted-foreground">Estimación mensual del IVA y el PPM a partir de tus documentos reales.</p>
      </div>
      <F29Client />
    </div>
  );
}
