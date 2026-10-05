import { PageHeader } from '@/components/ui/PageHeader';
import AcademyClient from '@/components/academy/AcademyClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Academia' };

export default async function AcademyPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Academia"
        description="La ficha de cada alumna, la lista de asistencia por clase y qué mensualidades están pagadas."
      />
      <AcademyClient canWrite={can(context, 'academy:write')} canManage={can(context, 'academy:manage')} />
    </div>
  );
}
