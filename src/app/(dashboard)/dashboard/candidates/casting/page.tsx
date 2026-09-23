import { PageHeader } from '@/components/ui/PageHeader';
import { CastingBoardClient } from '@/components/candidates/CastingBoardClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Tablero de casting' };

export default async function CastingBoardPage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Candidatas"
        title="Tablero de casting"
        description="De postulante a reina: mueve cada ficha por las etapas del certamen, numera a las oficiales y define cómo se presentan en el sitio público."
      />
      <CastingBoardClient canWrite={can(context, 'candidates:write')} />
    </div>
  );
}
