import { can, getAuthContext } from '@/lib/auth/guards';
import AccreditationClient from '@/components/production/AccreditationClient';

export const metadata = { title: 'Acreditaciones' };

export default async function ProductionAccreditationPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'production:write');
  const canDesign = can(context, 'production:design');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold" data-tutorial="module-header">Acreditación de Staff & Proveedores</h1>
      <AccreditationClient canWrite={canWrite} canDesign={canDesign} />
    </div>
  );
}
