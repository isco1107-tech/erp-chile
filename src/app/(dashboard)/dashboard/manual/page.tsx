import { getAuthContext } from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { getManualSections, sectionScreenshot, type ManualScope } from '@/modules/manual/content';
import { getKnowledgeAsManualSections } from '@/modules/manual/knowledge';
import ManualClient, { type ManualClientSection } from '@/components/manual/ManualClient';

export const metadata = { title: 'Manual de Usuario' };

/**
 * Manual de usuario de ESTA empresa: nunca muestra módulos que no contrató.
 * `?alcance=empresa` muestra todo lo contratado (para capacitar al equipo);
 * por defecto, solo lo que el rol de la persona puede hacer. Al final van
 * los flujos que cruzan módulos, los problemas frecuentes y el glosario —
 * lo mismo que sabe el asistente.
 */
export default async function ManualPage({ searchParams }: { searchParams: Promise<{ alcance?: string }> }) {
  const context = await getAuthContext();
  const { alcance } = await searchParams;
  const scope: ManualScope = alcance === 'empresa' ? 'company' : 'role';

  const moduleSections = getManualSections(scope, context.features, context.permissions);
  const reference = getKnowledgeAsManualSections(context.features, scope === 'role' ? context.permissions : undefined);
  const sections: ManualClientSection[] = [...moduleSections, ...reference].map((section) => ({ ...section, screenshotUrl: sectionScreenshot(section) }));

  return (
    <ManualClient
      sections={sections}
      scope={scope}
      companyName={context.companyName}
      userName={context.name}
      roleLabel={context.customRoleName ?? ROLE_LABELS[context.role]}
    />
  );
}
