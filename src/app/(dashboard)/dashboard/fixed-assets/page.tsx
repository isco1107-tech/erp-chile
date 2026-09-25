import Link from 'next/link';
import { CalendarClock, Tags } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { FixedAssetsClient } from '@/components/fixed-assets/FixedAssetsClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';
import { listUpcomingMaintenancesAction } from '@/modules/fixed-assets/actions/fixed-assets.actions';

function formatDay(value: Date): string {
  return value.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export const metadata = { title: 'Activo Fijo' };

export default async function FixedAssetsPage() {
  const context = await getAuthContext();
  const upcoming = await listUpcomingMaintenancesAction();
  const maintenances = upcoming.success ? upcoming.data : [];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzas"
        title="Activo Fijo"
        description="Bienes de uso de la empresa con su depreciación lineal o acelerada y su valor libro al día. Con Contabilidad, la depreciación del mes se contabiliza con un clic."
        actions={
          <Link href="/dashboard/fixed-assets/labels" className={buttonVariants({ variant: 'outline' })}>
            <Tags className="size-4" aria-hidden="true" /> Etiquetas
          </Link>
        }
      />
      {maintenances.length > 0 && (
        <section className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm" aria-label="Mantenciones próximas">
          <p className="flex items-center gap-2 font-medium text-warning">
            <CalendarClock className="size-4" aria-hidden="true" /> Mantenciones de los próximos 30 días
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {maintenances.map((item) => (
              <li key={item.assetId}>
                <Link href={`/dashboard/fixed-assets/${item.assetId}`} className={cn('inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs hover:underline', item.overdue && 'font-semibold text-danger')}>
                  {item.code} · {item.name} · {item.overdue ? 'atrasada desde el' : 'el'} {formatDay(item.dueDate)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FixedAssetsClient
        canWrite={can(context, 'assets:write')}
        canPostEntries={context.features.hasAccounting && can(context, 'assets:write') && can(context, 'accounting:manual_entry')}
      />
    </div>
  );
}
