import Link from 'next/link';
import { Search } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TraceabilityBoard from '@/components/inventory/TraceabilityBoard';
import TraceabilityTimeline from '@/components/inventory/TraceabilityTimeline';
import SerialsPanel from '@/components/inventory/SerialsPanel';
import { cn } from '@/lib/utils';
import { FLOW_WINDOW_DAYS, parseFlowWindow } from '@/lib/inventory/traceability';
import { listWarehouses } from '@/modules/inventory/services/stock.service';
import { getProductFlow, listSerials, searchTraceableProducts } from '@/modules/inventory/services/traceability.service';

export const metadata = { title: 'Trazabilidad de productos' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;

/**
 * Trazabilidad de UN producto: el tablero de su recorrido (en camino, recepcionado, en bodega,
 * trasladado, vendido, pérdidas), la línea de tiempo con quién y por qué, y las series por unidad.
 * La selección viaja por la dirección (producto, período y vista), así que se puede compartir.
 */
export default async function TraceabilityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  const query = one(params.q) ?? '';
  const productId = one(params.producto);
  const days = parseFlowWindow(one(params.dias));
  const view = one(params.vista) === 'series' ? 'series' : 'flujo';
  const canWrite = can(context, 'inventory:write');

  const header = (
    <PageHeader
      eyebrow="Inventario"
      title="Trazabilidad de productos"
      description="Sigue el recorrido de un producto desde la orden de compra hasta la venta o la pérdida, y cada unidad por su número de serie."
    />
  );

  const searchForm = (
    <form method="get" className="flex flex-wrap items-end gap-2" role="search">
      <div className="relative min-w-0 flex-1 basis-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input name="q" defaultValue={query} placeholder="Buscar por nombre, SKU o código de barras" className="pl-8" aria-label="Buscar un producto" />
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );

  if (!productId) {
    const results = query ? await searchTraceableProducts(context.companyId, query) : [];
    return (
      <div className="space-y-6">
        {header}
        {searchForm}
        {!query ? (
          <EmptyState title="Elige un producto" description="Búscalo por nombre, SKU o código de barras para ver su recorrido." />
        ) : results.length === 0 ? (
          <EmptyState title="Sin resultados" description={`No hay productos que coincidan con «${query}».`} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {results.map((product) => (
              <li key={product.id}>
                <Link href={`/dashboard/inventory/trazabilidad?producto=${encodeURIComponent(product.id)}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="min-w-0 break-words font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{product.sku}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const flow = await getProductFlow(context.companyId, productId, { days });
  if (!flow) {
    return (
      <div className="space-y-6">
        {header}
        {searchForm}
        <EmptyState title="Producto no encontrado" description="Puede que se haya eliminado o que no sea de tu empresa." />
      </div>
    );
  }

  const [serials, warehouses, suppliers] = await Promise.all([
    view === 'series' ? listSerials(context.companyId, productId) : Promise.resolve([]),
    listWarehouses(context.companyId),
    view === 'series' && can(context, 'contacts:read')
      ? prisma.contact.findMany({ where: { companyId: context.companyId, isSupplier: true }, select: { id: true, razonSocial: true, nombreFantasia: true }, orderBy: { razonSocial: 'asc' }, take: 300 })
      : Promise.resolve([]),
  ]);

  const base = `/dashboard/inventory/trazabilidad?producto=${encodeURIComponent(productId)}`;
  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      {header}
      {searchForm}
      <Card>
        <CardHeader>
          <CardTitle className="break-words">{flow.product.name}</CardTitle>
          <CardDescription>
            SKU {flow.product.sku} · unidad: {flow.product.unit}
            {flow.product.tracksLots ? ' · maneja lotes' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex gap-1" aria-label="Vista">
            {tab('Flujo', `${base}&dias=${days}`, view === 'flujo')}
            {tab('Series', `${base}&dias=${days}&vista=series`, view === 'series')}
          </nav>
          {view === 'flujo' && (
            <nav className="flex items-center gap-1 text-sm" aria-label="Período">
              <span className="mr-1 text-muted-foreground">Período:</span>
              {FLOW_WINDOW_DAYS.map((option) => tab(`${option} días`, `${base}&dias=${option}`, option === days))}
            </nav>
          )}
        </CardContent>
      </Card>

      {view === 'flujo' ? (
        <>
          {flow.truncated && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Hay más movimientos que los que se leen en este período: los totales quedan cortos. Elige un período menor.</p>}
          <TraceabilityBoard flow={flow} />
          <Card>
            <CardHeader>
              <CardTitle>Línea de tiempo</CardTitle>
              <CardDescription>Los últimos movimientos y cambios de series de este producto.</CardDescription>
            </CardHeader>
            <CardContent>
              <TraceabilityTimeline entries={flow.timeline} />
            </CardContent>
          </Card>
        </>
      ) : (
        <SerialsPanel
          productId={flow.product.id}
          productName={flow.product.name}
          serials={serials}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.nombreFantasia?.trim() || s.razonSocial }))}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
