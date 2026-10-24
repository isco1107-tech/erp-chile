import Link from 'next/link';
import { Link2, ReceiptText, ShoppingBasket, Warehouse as WarehouseIcon } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { moduleEnabled } from '@/lib/auth/modules';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BASKET_PERIOD_OPTIONS,
  MAX_BASKET_PRODUCTS,
  MIN_TOGETHER_OPTIONS,
  describePair,
  parseBasketPeriod,
  parseMinTogether,
} from '@/lib/retail/basket';
import { getWarehouseOf, listWarehousesForLog } from '@/modules/inventory/services/movement-log.service';
import { getBasket, type BasketProduct } from '@/modules/retail/services/basket.service';

export const metadata = { title: 'Canasta cruzada' };
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;
const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
const times = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}×`;

function ProductCell({ product }: { product: BasketProduct }) {
  return (
    <>
      <span className="block font-medium break-words">{product.name}</span>
      <span className="block text-xs break-words text-muted-foreground">
        <span className="font-mono">{product.sku}</span>
        {product.supplier ? ` · ${product.supplier}` : ''}
      </span>
    </>
  );
}

/** Qué productos se compran juntos en UNA bodega, y qué pares valen como combo. */
export default async function BasketPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!moduleEnabled(context.features, 'hasBasketAnalysis') || !can(context, 'retail:read')) return null;

  const warehouses = await listWarehousesForLog(context.companyId);
  if (warehouses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Métricas de retail" title="Canasta cruzada" />
        <EmptyState title="Aún no hay bodegas" description="Crea una bodega en Inventario para empezar a analizar las boletas." />
      </div>
    );
  }

  const requested = one(params.bodega);
  const warehouse = (requested ? await getWarehouseOf(context.companyId, requested) : null) ?? warehouses.find((entry) => entry.isDefault) ?? warehouses[0]!;
  const periodDays = parseBasketPeriod(one(params.periodo));
  const minTogether = parseMinTogether(one(params.minimo));
  const differentSuppliers = one(params.proveedores) === 'distintos';

  const data = await getBasket(context.companyId, { warehouseId: warehouse.id, periodDays, minTogether, differentSuppliers });

  const query = (overrides: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({ bodega: warehouse.id, periodo: String(periodDays), minimo: String(minTogether), proveedores: differentSuppliers ? 'distintos' : undefined, ...overrides }).filter(
        (entry): entry is [string, string] => Boolean(entry[1])
      )
    ).toString();
  const selectClass = 'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Métricas de retail"
        title="Canasta cruzada"
        description="Qué productos se compran juntos en la misma boleta, cuántas veces más que lo normal, y cuáles valen como combo o promoción conjunta."
      />

      <nav aria-label="Bodegas" className="flex flex-wrap gap-2">
        {warehouses.map((entry) => (
          <Link
            key={entry.id}
            href={`/dashboard/retail/canasta?${query({ bodega: entry.id })}`}
            aria-current={entry.id === warehouse.id ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${entry.id === warehouse.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
          >
            <WarehouseIcon className="size-4" aria-hidden="true" /> {entry.name}
          </Link>
        ))}
      </nav>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
        <input type="hidden" name="bodega" value={warehouse.id} />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Período
          <select name="periodo" defaultValue={String(periodDays)} className={selectClass}>
            {BASKET_PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                Últimos {option} días
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Juntos en al menos
          <select name="minimo" defaultValue={String(minTogether)} className={selectClass}>
            {MIN_TOGETHER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} boletas
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="proveedores" value="distintos" defaultChecked={differentSuppliers} className="size-4 accent-primary" />
          Solo productos de proveedores distintos
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Aplicar
          </button>
          <Link href={`/dashboard/retail/canasta?${new URLSearchParams({ bodega: warehouse.id }).toString()}`} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Limpiar
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <KpiCard
          label="Boletas analizadas"
          labelExtra={<InfoTooltip text={`Boletas y facturas emitidas en esta bodega en el período. Las de más de ${MAX_BASKET_PRODUCTS} productos distintos (compras mayoristas) no entran.`} />}
          value={data.tickets.toLocaleString('es-CL')}
          icon={ReceiptText}
          tone="accent"
        />
        <KpiCard
          label="Productos por boleta"
          labelExtra={<InfoTooltip text={`Productos distintos por boleta, en promedio. Con dos o más productos: ${data.multiTickets.toLocaleString('es-CL')} boletas.`} />}
          value={data.avgProducts === null ? '—' : data.avgProducts.toLocaleString('es-CL', { maximumFractionDigits: 1 })}
          icon={ShoppingBasket}
          tone="info"
        />
        <KpiCard
          label="Pares que van juntos"
          labelExtra={<InfoTooltip text="Pares de productos que aparecen juntos al menos 1,2 veces más de lo que darían las ventas de cada uno por separado." />}
          value={data.related.toLocaleString('es-CL')}
          icon={Link2}
          tone="success"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Combos sugeridos</CardTitle>
          <CardDescription>Pares con una relación fuerte (1,5 veces o más) en los que uno lleva al otro en al menos 1 de cada 5 boletas.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.combos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay pares con una relación lo bastante fuerte. Prueba un período más largo o un mínimo de boletas menor.</p>
          ) : (
            <ul className="space-y-3" data-testid="basket-combos">
              {data.combos.map((pair) => (
                <li key={`${pair.a}-${pair.b}`} className="rounded-lg border border-border p-3">
                  <p className="font-medium break-words">
                    {pair.productA.name} + {pair.productB.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{describePair(pair, { a: pair.productA.name, b: pair.productB.name })}</p>
                  {pair.productA.supplier && pair.productB.supplier && pair.productA.supplier !== pair.productB.supplier && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      De {pair.productA.supplier} y {pair.productB.supplier}: una promoción conjunta entre los dos.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos que se compran juntos</CardTitle>
          <CardDescription>
            Del par más relacionado al menos. «Veces lo normal» compara cuántas boletas los traen juntos con las que los traerían si cada uno se comprara por su cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.pairs.length === 0 ? (
            <EmptyState
              title="Sin pares que mostrar"
              description={data.multiTickets === 0 ? 'No hay boletas con dos o más productos en el período.' : `Ningún par aparece junto en ${minTogether} boletas o más con una relación positiva.`}
            />
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden" aria-label="Pares">
                {data.pairs.map((pair) => (
                  <li key={`${pair.a}-${pair.b}`} className="space-y-1 py-3">
                    <p className="text-sm font-medium break-words">
                      {pair.productA.name} + {pair.productB.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pair.together} boletas · {times(pair.lift)} lo normal · {pct(Math.max(pair.confidenceAB, pair.confidenceBA))} lleva el otro
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-sm" data-testid="basket-pairs">
                  <thead className="text-left text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3">Producto</th>
                      <th scope="col" className="py-2 pr-3">Va con</th>
                      <th scope="col" className="py-2 pr-3 text-right">Boletas juntos</th>
                      <th scope="col" className="py-2 pr-3 text-right">% de las boletas</th>
                      <th scope="col" className="py-2 pr-3 text-right">Con el 1.º, lleva el 2.º</th>
                      <th scope="col" className="py-2 pr-3 text-right">Con el 2.º, lleva el 1.º</th>
                      <th scope="col" className="py-2 text-right">Veces lo normal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pairs.map((pair) => (
                      <tr key={`${pair.a}-${pair.b}`} className="border-t border-border align-top">
                        <td className="max-w-60 py-2 pr-3">
                          <ProductCell product={pair.productA} />
                        </td>
                        <td className="max-w-60 py-2 pr-3">
                          <ProductCell product={pair.productB} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pair.together.toLocaleString('es-CL')}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(pair.supportPct)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(pair.confidenceAB)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(pair.confidenceBA)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{times(pair.lift)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Ir juntos en la boleta no significa que uno cause la compra del otro: es una pista para probar un combo, una exhibición cercana o una promoción conjunta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
