import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import FolioManagerClient from '@/components/dte/FolioManagerClient';
import { getFolioAvailabilityAction } from '@/modules/dte/actions/caf.actions';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Folios del SII' };

/**
 * Administración de CAF (folios autorizados por el SII).
 *
 * Vive bajo Configuración y no dentro de Ventas a propósito: cargar folios es
 * un trámite tributario que hace administración o el contador una vez cada
 * cierto tiempo, no una tarea del flujo diario de venta.
 */
export default async function FoliosSettingsPage() {
  const context = await getAuthContext();
  const canManage = can(context, 'dte:manage_caf');
  const availability = canManage ? await getFolioAvailabilityAction() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Folios del SII</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>
          ← Volver
        </Link>
      </div>

      {!canManage && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para administrar los folios del SII. Esta sección está reservada para Dueños, Administradores y Contadores.
        </p>
      )}

      {canManage && availability && !availability.success && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{availability.error}</p>
      )}

      {canManage && availability?.success && (
        <FolioManagerClient initialAvailability={availability.data} canManage={canManage} />
      )}
    </div>
  );
}
