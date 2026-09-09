import { getAuthContext } from '@/lib/auth/guards';
import { getVisibleManualSections } from '@/modules/manual/content';
import { getKnowledgeAsManualSections } from '@/modules/manual/knowledge';
import ManualClient from '@/components/manual/ManualClient';

export const metadata = { title: 'Manual de Usuario' };

export default async function ManualPage() {
  const context = await getAuthContext();
  // Los módulos primero, y al final el conocimiento transversal (flujos que
  // cruzan módulos, problemas frecuentes, glosario): es lo mismo que sabe el
  // asistente, para que también se pueda leer, buscar e imprimir.
  const sections = [
    ...getVisibleManualSections(context.features, context.permissions),
    ...getKnowledgeAsManualSections(context.features, context.permissions),
  ];

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
