import { PageHeader } from '@/components/ui/PageHeader';
import AcademyClient from '@/components/academy/AcademyClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Academia' };

export default async function AcademyPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [context, { tab }] = await Promise.all([getAuthContext(), searchParams]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Academia"
        description="El calendario de clases, la lista de asistencia por día, el material que llega al correo de las alumnas y qué mensualidades están pagadas."
      />
      {/* `?tab=inscripciones`: así llegan los avisos de una inscripción hecha desde un formulario de un sitio web. */}
      <AcademyClient canWrite={can(context, 'academy:write')} canManage={can(context, 'academy:manage')} initialTab={tab === 'inscripciones' ? 'APPLICATIONS' : undefined} />
    </div>
  );
}
