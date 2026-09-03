import FeeDocumentListClient from '@/components/fees/FeeDocumentListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Boletas de Honorarios' };

export default async function FeesPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'fees:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Boletas de Honorarios</h1>
      <FeeDocumentListClient canWrite={canWrite} />
    </div>
  );
}
