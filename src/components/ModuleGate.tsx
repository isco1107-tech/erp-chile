import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { getModule, type FeatureKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/auth/permissions';

interface ModuleGateProps {
  moduleKey: FeatureKey;
  /** Permiso mínimo dentro del módulo. Si falta, se muestra el aviso de rol. */
  permission?: Permission;
  children: React.ReactNode;
}

function LockedView({ title, message, hint }: { title: string; message: string; hint: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-8 text-center">
      <div className="rounded-full bg-muted p-3">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
        Volver al Dashboard
      </Link>
    </div>
  );
}

/**
 * Puerta de módulo para rutas completas. Se monta en el `layout.tsx` de cada
 * módulo para que la protección cubra también sus subrutas (`/new`, `/[id]`):
 * ocultar el enlace del sidebar no basta, la URL directa tiene que quedar
 * cerrada igual.
 */
export default async function ModuleGate({ moduleKey, permission, children }: ModuleGateProps) {
  try {
    const context = await getAuthContext();
    const mod = getModule(moduleKey);

    if (!context.features[moduleKey]) {
      return (
        <LockedView
          title="Módulo no incluido en tu plan actual"
          message={`${mod.label} no está habilitado para ${context.companyName}. Contacta al administrador para habilitarlo.`}
          hint={`Plan actual: ${context.planName}`}
        />
      );
    }

    if (permission && !can(context, permission)) {
      return (
        <LockedView
          title="No tienes acceso a esta sección"
          message={`Tu rol no incluye el permiso necesario para ${mod.label.toLowerCase()}.`}
          hint="Pide a un Administrador de tu empresa que ajuste tu rol."
        />
      );
    }

    return <>{children}</>;
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }
}
