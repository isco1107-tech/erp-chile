import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { can, getAuthContext } from '@/lib/auth/guards';
import { MODULES } from '@/lib/auth/modules';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { buildAvailableWorkspaceNav } from '@/lib/navigation/workspace-nav';
import { getDisabledNavItems } from '@/modules/workspace/services/workspace.service';
import WorkspaceModulesClient from '@/components/settings/WorkspaceModulesClient';

export const metadata = { title: 'Módulos y menú' };

export default async function WorkspaceModulesPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'settings:company');

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Configuración" title="Módulos y menú" />
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para ver esta sección. Está reservada para Dueños y Administradores.
        </p>
      </div>
    );
  }

  // Se arma con TODOS los permisos a propósito: quien configura el menú lo
  // hace para toda la empresa, así que debe ver cada sección que el plan
  // cubre — incluso las que su propio rol no abre (ej. Remuneraciones para un
  // Administrador sin `payroll:read`). Lo contratado sí se respeta.
  const groups = buildAvailableWorkspaceNav({
    permissions: ALL_PERMISSIONS,
    features: context.features,
    isSuperAdmin: false,
  });
  const disabled = await getDisabledNavItems(context.companyId);
  const uncontracted = MODULES.filter((mod) => !context.features[mod.key] && mod.routes.length > 0).map((mod) => ({
    key: mod.key,
    label: mod.label,
    description: mod.description,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="Módulos y menú"
        description="Enciende o apaga cada sección del menú lateral para todo tu equipo. Apagar una sección la oculta del menú, de la búsqueda ⌘K y de su dirección web; no borra datos ni cambia permisos."
        actions={
          <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>
            ← Volver
          </Link>
        }
      />
      <WorkspaceModulesClient groups={groups} initialDisabled={disabled} uncontracted={uncontracted} />
    </div>
  );
}
