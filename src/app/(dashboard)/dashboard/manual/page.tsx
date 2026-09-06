import { getAuthContext } from '@/lib/auth/guards';
import { getVisibleManualSections } from '@/modules/manual/content';
import ManualClient from '@/components/manual/ManualClient';

export const metadata = { title: 'Manual de Usuario' };

export default async function ManualPage() {
  const context = await getAuthContext();
  const sections = getVisibleManualSections(context.features);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold print:hidden">Manual de Usuario</h1>
      <p className="mb-4 text-sm text-muted-foreground print:hidden">
        Solo se muestran los módulos incluidos en tu plan actual. ¿No encuentras lo que buscas? Usa el asistente flotante (abajo a la izquierda).
      </p>
      <ManualClient sections={sections} companyName={context.companyName} />
    </div>
  );
}
