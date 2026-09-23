import Link from 'next/link';
import { Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlowDiagram } from '@/components/intelligence/FlowDiagram';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getBusinessFlows } from '@/modules/intelligence/services/flows.service';

export const metadata = { title: 'Flujos del negocio' };

export default async function BusinessFlowsPage() {
  const context = await getAuthContext();
  if (!context.features.hasIntelligence || !can(context, 'intelligence:view')) return null;

  const data = await getBusinessFlows(context.companyId, { hasSalesPipeline: context.features.hasSalesPipeline });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de Negocio"
        title="Flujos del negocio"
        description={`Cómo avanza tu operación de punta a punta en los últimos ${data.windowDays} días, reconstruido desde tus documentos reales. Sin registrar nada extra.`}
        actions={
          <>
            <Link href="/dashboard/intelligence" className={buttonVariants({ variant: 'outline' })}>
              ← Radiografía 360
            </Link>
            {can(context, 'automation:manage') && (
              <Link href="/dashboard/settings/automations" className={buttonVariants({ variant: 'default' })}>
                <Zap aria-hidden="true" />
                Automatizar un flujo
              </Link>
            )}
          </>
        }
      />

      {data.flows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="Todavía no hay flujos que mostrar"
            description="Aparecen solos cuando hay cotizaciones, ventas, órdenes de compra, facturas de proveedor u oportunidades del CRM en los últimos 6 meses."
          />
        </div>
      ) : (
        data.flows.map((flow) => <FlowDiagram key={flow.key} flow={flow} />)
      )}
    </div>
  );
}
