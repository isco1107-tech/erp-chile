import { PageHeader } from '@/components/ui/PageHeader';
import QualityClient from '@/components/quality/QualityClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Calidad y procedimientos' };

export default async function QualityPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Calidad y procedimientos"
        description="Cómo se hacen las cosas (con acuse de lectura del equipo), inspecciones de cada lote y el desempeño de tus productores y proveedores."
      />
      <QualityClient canWrite={can(context, 'quality:write')} canManage={can(context, 'quality:manage')} />
    </div>
  );
}
