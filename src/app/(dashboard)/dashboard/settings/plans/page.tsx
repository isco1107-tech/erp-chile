import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { can, getAuthContext } from '@/lib/auth/guards';
import PlansAndModulesClient from '@/components/settings/PlansAndModulesClient';

export const metadata = { title: 'Planes y módulos' };

export default async function PlansPage() {
  const context = await getAuthContext();

  if (!can(context, 'settings:company')) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Configuración" title="Planes y módulos" />
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para ver esta sección. Está reservada para Dueños y Administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuración"
        title="Planes y módulos"
        description="Mira cuánto cuesta cada módulo y cada plan, arma tu selección y pídele a Aether que la active. No se activa ni se cobra nada hasta que un ejecutivo te contacte y lo confirmes."
        actions={
          <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>
            ← Volver
          </Link>
        }
      />
      <PlansAndModulesClient features={context.features} />
    </div>
  );
}
