import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import ProductionTimelineClient from '@/components/production/ProductionTimelineClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Escaleta en Vivo' };

export default async function ProductionTimelinePage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Producción en vivo"
        title="Escaleta en vivo"
        description="El show minuto a minuto: segmentos, candidatas, pies técnicos y vestuario por bloque. En modo show se marca el tiempo real y se ve el atraso acumulado."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando escaleta…</p>}>
        <ProductionTimelineClient canWrite={can(context, 'production:write')} />
      </Suspense>
    </div>
  );
}
