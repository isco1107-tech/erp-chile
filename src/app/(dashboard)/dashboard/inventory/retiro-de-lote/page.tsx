import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import LotTraceView from '@/components/inventory/LotTraceView';
import { roundQty } from '@/lib/retail/live-metrics';
import { getTraceableProduct, searchTraceableProducts } from '@/modules/inventory/services/traceability.service';
import { listLotOptions, traceLot } from '@/modules/inventory/services/genealogy.service';

export const metadata = { title: 'Retiro de lote' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const BASE = '/dashboard/inventory/retiro-de-lote';

/**
 * Genealogía de un lote para un retiro del mercado o una auditoría: de qué proveedor y documento
 * vino, en qué se transformó, a qué clientes llegó y cuánto queda en bodega. La selección viaja por
 * la dirección. Los clientes solo los ve quien tiene acceso a Ventas.
 */
export default async function LotRecallPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  const query = one(params.q) ?? '';
  const productId = one(params.producto);
  const lotNumber = one(params.lote);

  const header = (
    <PageHeader
      eyebrow="Inventario"
      title="Retiro de lote"
      description="Sigue un lote hacia atrás (proveedor, recepción, producción) y hacia adelante (clientes, pérdidas, existencias) para un retiro del mercado o una auditoría."
    />
  );
  const form = (
    <form method="get" className="flex flex-wrap items-end gap-2" role="search">
      <div className="relative min-w-0 flex-1 basis-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input name="q" defaultValue={query} placeholder="Buscar el producto por nombre, SKU o código de barras" className="pl-8" aria-label="Buscar un producto" />
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );

  if (!productId) {
    const results = query ? await searchTraceableProducts(context.companyId, query) : [];
    return (
      <div className="space-y-6">
        {header}
        {form}
        {!query ? (
          <EmptyState title="Elige el producto del lote" description="Búscalo y luego elige el lote que quieres rastrear." />
        ) : results.length === 0 ? (
          <EmptyState title="Sin resultados" description={`No hay productos que coincidan con «${query}».`} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {results.map((p) => (
              <li key={p.id}>
                <Link href={`${BASE}?producto=${encodeURIComponent(p.id)}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="min-w-0 break-words font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.sku}{p.tracksLots ? ' · maneja lotes' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const product = await getTraceableProduct(context.companyId, productId);
  if (!product) {
    return (
      <div className="space-y-6">
        {header}
        {form}
        <EmptyState title="Producto no encontrado" description="Puede que se haya eliminado o que no sea de tu empresa." />
      </div>
    );
  }

  if (!lotNumber) {
    const lots = await listLotOptions(context.companyId, productId);
    return (
      <div className="space-y-6">
        {header}
        {form}
        <h2 className="break-words text-lg font-semibold">{product.name} <span className="text-sm font-normal text-muted-foreground">· elige un lote</span></h2>
        {lots.length === 0 ? (
          <EmptyState title="Este producto no tiene lotes" description={product.tracksLots ? 'Aún no ha entrado mercadería con lote.' : 'Activa «Maneja lotes y vencimiento» en la ficha del producto para seguirlo por lote.'} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {lots.map((lot) => (
              <li key={lot.lotNumber}>
                <Link href={`${BASE}?producto=${encodeURIComponent(productId)}&lote=${encodeURIComponent(lot.lotNumber)}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="min-w-0 break-words font-medium">Lote {lot.lotNumber}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {lot.expiryDate ? `vence ${lot.expiryDate.toISOString().slice(0, 10)}` : 'sin vencimiento'}
                    <StatusBadge tone={lot.quantity > 0 ? 'info' : 'neutral'}>{roundQty(lot.quantity).toLocaleString('es-CL')} {product.unit}</StatusBadge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const trace = await traceLot(context.companyId, productId, lotNumber, { includeCustomers: can(context, 'sales:read') });
  if (!trace) {
    return (
      <div className="space-y-6">
        {header}
        {form}
        <EmptyState title="Lote no encontrado" description="No hay movimientos ni existencias de ese lote." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {form}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold">{trace.product.name}</h2>
          <p className="break-words text-sm text-muted-foreground">
            Lote {trace.lotNumber} · SKU {trace.product.sku}{trace.expiryDate ? ` · vence ${trace.expiryDate.toISOString().slice(0, 10)}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`${BASE}?producto=${encodeURIComponent(productId)}`} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted">Otro lote</Link>
          <a href={`/api/inventory/lot-trace/export?producto=${encodeURIComponent(productId)}&lote=${encodeURIComponent(lotNumber)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Download className="size-4" aria-hidden="true" /> Descargar Excel
          </a>
        </div>
      </div>
      <LotTraceView trace={trace} />
    </div>
  );
}
