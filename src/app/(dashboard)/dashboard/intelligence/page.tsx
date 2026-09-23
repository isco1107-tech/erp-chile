import Link from 'next/link';
import { Boxes, CircleDollarSign, Clock4, Percent, TrendingUp, Wallet } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard, type TrendDirection } from '@/components/ui/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { HealthGauge } from '@/components/intelligence/HealthGauge';
import { SalesTrendChart } from '@/components/intelligence/SalesTrendChart';
import { SimulatorClient } from '@/components/intelligence/SimulatorClient';
import {
  CashCycleVisual,
  CustomerSection,
  HealthDimensions,
  InsightList,
  ProductSection,
  SectionCard,
  TaxCalendar,
} from '@/components/intelligence/RadiographySections';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { formatDays, formatPct, formatSignedPct } from '@/lib/intelligence/format';
import { getRadiography } from '@/modules/intelligence/services/radiography.service';

export const metadata = { title: 'Radiografía 360' };

export default async function IntelligencePage() {
  const context = await getAuthContext();
  // El layout ya muestra el bloqueo; esto evita además calcular (y exponer en
  // el payload) la radiografía cuando el usuario no puede verla — en App
  // Router la página se ejecuta aunque el layout no renderice sus hijos.
  if (!context.features.hasIntelligence || !can(context, 'intelligence:view')) return null;

  const data = await getRadiography(context.companyId, { hasPayroll: context.features.hasPayroll });
  const { kpis, health } = data;
  const growthDirection: TrendDirection = kpis.growthPct === null ? 'neutral' : kpis.growthPct > 0.5 ? 'up' : kpis.growthPct < -0.5 ? 'down' : 'neutral';
  const updatedAt = new Date(data.generatedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inteligencia de Negocio"
        title="Radiografía 360"
        description={`Una lectura completa de ${context.companyName} con sus documentos reales de los últimos 12 meses. Calculada el ${updatedAt}.`}
        actions={
          <>
            <Link href="/dashboard/intelligence/cash-forecast" className={buttonVariants({ variant: 'outline' })}>
              Caja a 13 semanas
            </Link>
            <Link href="/dashboard/intelligence/flows" className={buttonVariants({ variant: 'default' })}>
              Flujos del negocio
            </Link>
          </>
        }
      />

      {!data.coverage.sales && !data.coverage.receivables && !data.coverage.inventory ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="Todavía no hay datos suficientes para la radiografía"
            description="Emite ventas, registra compras o carga tu inventario: cada indicador se enciende apenas tiene datos reales con qué calcularse."
            action={
              <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                Volver al inicio
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-12 gap-5">
            <SectionCard
              title="Salud de la empresa"
              description="Promedio ponderado de las dimensiones con datos disponibles."
              className="col-span-12 lg:col-span-4"
            >
              {health.overall !== null && health.grade !== null ? (
                <div className="flex flex-col items-center gap-4 pt-2">
                  <HealthGauge score={health.overall} grade={health.grade} />
                  <p className="text-center text-xs text-muted-foreground">
                    {health.dimensions.length} de 6 dimensiones evaluadas. Las que faltan se activan cuando existan datos (por ejemplo, inventario o cartera por cobrar).
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos suficientes para calcular el puntaje.</p>
              )}
            </SectionCard>
            <SectionCard title="Diagnóstico por dimensión" description="Qué está bien, qué preocupa y qué hacer." className="col-span-12 lg:col-span-8">
              {health.dimensions.length > 0 ? <HealthDimensions dimensions={health.dimensions} /> : <p className="text-sm text-muted-foreground">Sin dimensiones evaluables todavía.</p>}
            </SectionCard>
          </section>

          <SectionCard title="Señales de hoy" description="Detectadas automáticamente sobre tus datos, ordenadas por urgencia.">
            <InsightList insights={data.insights} />
          </SectionCard>

          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="Ventas netas 12 meses" value={formatCurrency(kpis.netSales12m)} icon={CircleDollarSign} tone="accent" />
            <KpiCard
              label="Ventas últimos 90 días"
              value={formatCurrency(kpis.netSales90d)}
              icon={TrendingUp}
              tone="info"
              trend={kpis.growthPct === null ? undefined : formatSignedPct(kpis.growthPct)}
              trendDirection={growthDirection}
              hint="vs. 90 días anteriores"
            />
            <KpiCard label="Margen bruto (90 días)" value={formatPct(kpis.grossMarginPct90d)} icon={Percent} tone="success" />
            <KpiCard label="Ciclo de caja" value={formatDays(kpis.cycle.ccc)} icon={Clock4} tone="warning" />
            <KpiCard
              label="Por cobrar (vencido)"
              value={formatCurrency(kpis.receivables)}
              icon={Wallet}
              tone={kpis.overdueReceivables > 0 ? 'danger' : 'accent'}
              trend={kpis.overdueReceivables > 0 ? formatCurrency(kpis.overdueReceivables) : undefined}
              trendDirection="down"
              hint="ya vencido"
            />
            <KpiCard label="Capital en inventario" value={formatCurrency(kpis.inventoryValue)} icon={Boxes} tone="info" />
          </section>

          <section className="grid grid-cols-12 gap-5">
            <div className="col-span-12 xl:col-span-8">
              <SalesTrendChart monthly={data.monthly} forecast={data.forecast} />
            </div>
            <SectionCard title="Ciclo de conversión de caja" description="Días que tu plata pasa atrapada en la operación." className="col-span-12 xl:col-span-4">
              <CashCycleVisual cycle={kpis.cycle} />
            </SectionCard>
          </section>

          <SectionCard id="clientes" title="Clientes: valor, concentración y riesgo" description="Segmentación RFM (recencia, frecuencia y monto) y clasificación ABC de los últimos 12 meses.">
            <CustomerSection customers={data.customers} />
          </SectionCard>

          <SectionCard id="productos" title="Productos: qué gana plata y qué la inmoviliza" description="Matriz venta × margen, clasificación ABC y stock sin rotación.">
            <ProductSection products={data.products} />
          </SectionCard>

          <section className="grid grid-cols-12 gap-5">
            <SectionCard
              id="simulador"
              title="Simulador: ¿qué pasaría si…?"
              description="Mueve las palancas y mira el impacto anual en utilidad y en caja."
              className="col-span-12 xl:col-span-8"
            >
              <SimulatorClient baseline={data.simulatorBaseline} />
            </SectionCard>
            <SectionCard title="Calendario tributario" description="Próximos vencimientos y estimación del F29." className="col-span-12 xl:col-span-4">
              <TaxCalendar tax={data.tax} />
            </SectionCard>
          </section>
        </>
      )}
    </div>
  );
}
