import React from 'react';
import type { DteType } from '@prisma/client';
import {
  CircleDollarSign,
  TrendingUp,
  Percent,
  Boxes,
  PackageSearch,
  PackagePlus,
  ShoppingCart,
} from 'lucide-react';
import { getAuthContext, can } from '@/lib/auth/guards';
import { MODULES } from '@/lib/auth/modules';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/chile/tax';
import { KpiCard, type TrendDirection } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { ActionCard } from '@/components/ui/ActionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { RecentSalesTable } from '@/components/dashboard/RecentSalesTable';

const SALES_TYPES: DteType[] = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'NOTA_CREDITO_61', 'NOTA_DEBITO_56'];

const DTE_TYPE_LABELS: Partial<Record<DteType, string>> = {
  FACTURA_33: 'Factura afecta',
  FACTURA_EXENTA_34: 'Factura exenta',
  BOLETA_39: 'Boleta',
  NOTA_CREDITO_61: 'Nota de crédito',
  NOTA_DEBITO_56: 'Nota de débito',
};

/** Orden y colores literales del brief para series de gráficos (chart-1..5). */
const MIX_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function documentSign(type: DteType): number {
  return type === 'NOTA_CREDITO_61' ? -1 : 1;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' }).replace('.', '');
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Saludo según la hora real en Chile (America/Santiago), no la del servidor. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(new Date())
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Variación porcentual real contra el período anterior. Devuelve `null` (sin
 * fila de tendencia) cuando no hay base de comparación válida, en vez de
 * inventar un "+100%" cuando el mes anterior fue cero.
 */
function percentChange(current: number, previous: number): { direction: TrendDirection; text: string } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const direction: TrendDirection = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral';
  const sign = change > 0 ? '+' : '';
  return { direction, text: `${sign}${change.toFixed(1)}%` };
}

export default async function DashboardPage() {
  const context = await getAuthContext();
  const contracted = MODULES.filter((mod) => context.features[mod.key]);
  const canReadSales = can(context, 'sales:read');
  const canReadInventory = can(context, 'products:read');
  const canReadCosts = can(context, 'products:costs');

  const now = new Date();
  const currentMonth = startOfMonth(now);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [salesDocuments, inventoryStocks, contactCount, productCount] = await Promise.all([
    canReadSales && context.features.hasDteBilling
      ? prisma.salesDocument.findMany({
          where: {
            companyId: context.companyId,
            status: 'ISSUED',
            dteType: { in: SALES_TYPES },
            issueDate: { gte: trendStart, lt: nextMonth },
          },
          include: { contact: true, items: true },
          orderBy: { issueDate: 'desc' },
          take: 1000,
        })
      : Promise.resolve([]),
    canReadInventory && context.features.hasInventory
      ? prisma.stock.findMany({
          where: { companyId: context.companyId },
          include: { product: true, warehouse: true },
        })
      : Promise.resolve([]),
    can(context, 'contacts:read') ? prisma.contact.count({ where: { companyId: context.companyId } }) : Promise.resolve(0),
    canReadInventory && context.features.hasInventory
      ? prisma.product.count({ where: { companyId: context.companyId } })
      : Promise.resolve(0),
  ]);

  const monthlyBuckets = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + index, 1));
    return { key: monthKey(date), label: monthLabel(date), netSales: 0, costOfSales: 0 };
  });
  const bucketByKey = new Map(monthlyBuckets.map((bucket) => [bucket.key, bucket]));

  let monthNetSales = 0;
  let monthVat = 0;
  let monthCost = 0;
  let monthRevenue = 0;
  let prevMonthNetSales = 0;
  let prevMonthCost = 0;
  let prevMonthRevenue = 0;
  let currentMonthDocCount = 0;
  const mixCounts = new Map<DteType, number>();

  for (const document of salesDocuments) {
    const sign = documentSign(document.dteType);
    const bucket = bucketByKey.get(monthKey(document.issueDate));
    const revenue = sign * (document.netAmount + document.exemptAmount);
    const cost = sign * document.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCostPMP), 0);
    if (bucket) {
      bucket.netSales += revenue;
      bucket.costOfSales += cost;
    }
    if (document.issueDate >= currentMonth && document.issueDate < nextMonth) {
      monthNetSales += sign * document.netAmount;
      monthVat += sign * document.ivaAmount;
      monthCost += cost;
      monthRevenue += revenue;
      currentMonthDocCount += 1;
      mixCounts.set(document.dteType, (mixCounts.get(document.dteType) ?? 0) + 1);
    } else if (document.issueDate >= previousMonth && document.issueDate < currentMonth) {
      prevMonthNetSales += sign * document.netAmount;
      prevMonthCost += cost;
      prevMonthRevenue += revenue;
    }
  }

  const margin = monthRevenue - monthCost;
  const marginPercentage = monthRevenue === 0 ? 0 : (margin / monthRevenue) * 100;
  const prevMargin = prevMonthRevenue - prevMonthCost;

  const salesTrend = percentChange(monthNetSales, prevMonthNetSales);
  const marginTrend = percentChange(margin, prevMargin);

  const inventoryValue = inventoryStocks.reduce(
    (sum, stock) => sum + Math.round(stock.quantity * stock.product.costPricePMP),
    0
  );
  const criticalStock = inventoryStocks
    .filter((stock) => stock.product.isTrackable && stock.quantity <= stock.product.minStock && stock.product.minStock > 0)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5);
  const latestSales = salesDocuments.slice(0, 5);

  const mixData = SALES_TYPES.filter((type) => (mixCounts.get(type) ?? 0) > 0).map((type, index) => ({
    name: DTE_TYPE_LABELS[type] ?? type,
    value: mixCounts.get(type) ?? 0,
    color: MIX_COLORS[index % MIX_COLORS.length],
  }));

  const displayName = context.email.split('@')[0];
  const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  const hasSalesModule = canReadSales && context.features.hasDteBilling;
  const hasInventoryModule = canReadInventory && context.features.hasInventory;
  const hasCostsModule = canReadCosts && context.features.hasPmpCosting;

  const kpis: Array<{ key: string; node: React.ReactNode }> = [];
  if (hasSalesModule) {
    kpis.push({
      key: 'ventas-netas',
      node: (
        <KpiCard
          label="Ventas netas del mes"
          value={formatCurrency(monthNetSales)}
          icon={CircleDollarSign}
          tone="accent"
          trend={salesTrend?.text}
          trendDirection={salesTrend?.direction}
        />
      ),
    });
    kpis.push({
      key: 'iva-debito',
      node: (
        <KpiCard
          label="IVA débito del mes"
          labelExtra={<InfoTooltip text={TAX_GLOSSARY.debitoFiscal} />}
          value={formatCurrency(monthVat)}
          icon={Percent}
          tone="warning"
        />
      ),
    });
  }
  if (hasCostsModule && hasSalesModule) {
    kpis.push({
      key: 'margen-pmp',
      node: (
        <KpiCard
          label="Margen PMP del mes"
          labelExtra={<InfoTooltip text={TAX_GLOSSARY.pmp} />}
          value={`${marginPercentage.toFixed(1)}%`}
          icon={TrendingUp}
          tone="success"
          trend={marginTrend?.text}
          trendDirection={marginTrend?.direction}
        />
      ),
    });
  }
  if (hasCostsModule && hasInventoryModule) {
    kpis.push({
      key: 'valor-bodega',
      node: <KpiCard label="Valor de bodega" value={formatCurrency(inventoryValue)} icon={Boxes} tone="info" />,
    });
  }

  const hasActionCard =
    (criticalStock.length > 0 && hasInventoryModule && can(context, 'inventory:write')) ||
    (context.features.hasDteBilling && can(context, 'sales:write'));

  const hasAnyContent = kpis.length > 0 || hasSalesModule || hasInventoryModule || hasActionCard;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {greeting()}, {capitalizedName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {context.companyName} · Plan {context.planName}
            {context.companyStatus === 'TRIAL' ? ' · período de prueba' : ''}
          </p>
        </div>
      </div>

      {!hasAnyContent && (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="Activa un módulo para ver tu dashboard"
            description="Todavía no tenés módulos operativos contratados (ventas, inventario). Contacta a tu administrador para activarlos."
            className="py-16"
          />
        </div>
      )}

      {/* KPIs */}
      {kpis.length > 0 && (
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <React.Fragment key={kpi.key}>{kpi.node}</React.Fragment>
          ))}
        </section>
      )}

      {/* Gráfico de barras + donut (Client Component: recharts no puede vivir en el Server Component, ver DashboardCharts.tsx) */}
      {hasSalesModule && (
        <DashboardCharts monthlyBuckets={monthlyBuckets} mixData={mixData} currentMonthDocCount={currentMonthDocCount} />
      )}

      {/* Tabla reciente + actividad */}
      {(hasSalesModule || hasInventoryModule) && (
        <section className="grid grid-cols-12 gap-5">
          {hasSalesModule && (
            <div className={hasInventoryModule ? 'col-span-12 lg:col-span-7' : 'col-span-12'}>
              <RecentSalesTable documents={latestSales} />
            </div>
          )}

          {hasInventoryModule && (
            <div className={hasSalesModule ? 'col-span-12 lg:col-span-5' : 'col-span-12'}>
              <div className="rounded-lg border border-border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Inventario crítico</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {productCount} productos catalogados · {contactCount} contactos registrados
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-danger-soft">
                    <PackageSearch className="size-5 text-danger" strokeWidth={1.75} />
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {criticalStock.length > 0 ? (
                    criticalStock.map((stock) => (
                      <ProgressRow
                        key={stock.id}
                        label={`${stock.product.sku} — ${stock.product.name}`}
                        value={stock.product.minStock > 0 ? (stock.quantity / stock.product.minStock) * 100 : 0}
                        color="var(--danger)"
                      />
                    ))
                  ) : (
                    <EmptyState title="Sin productos bajo el mínimo" description="Todo el catálogo está sobre su stock mínimo de bodega." />
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Acción destacada + módulos contratados */}
      <section className="grid grid-cols-12 gap-5">
        {hasActionCard && (
          <div className="col-span-12 md:col-span-4">
            {criticalStock.length > 0 && hasInventoryModule && can(context, 'inventory:write') ? (
              <ActionCard
                title="Reponer stock crítico"
                description={`${criticalStock.length} productos bajo el mínimo de bodega`}
                actionLabel="Ir a inventario"
                href="/dashboard/inventory?openStockForm=1"
                icon={PackagePlus}
              />
            ) : (
              <ActionCard
                title="Emitir nueva venta"
                description="Generar una factura o boleta electrónica"
                actionLabel="Nueva venta"
                href="/dashboard/sales/new"
                icon={ShoppingCart}
              />
            )}
          </div>
        )}

        <div className={hasActionCard ? 'col-span-12 md:col-span-8' : 'col-span-12'}>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <h3 className="text-base font-semibold text-foreground">Módulos contratados</h3>
            {contracted.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {contracted.map((mod) => (
                  <span
                    key={mod.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    {mod.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Sin módulos contratados. Contacta a tu administrador.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
