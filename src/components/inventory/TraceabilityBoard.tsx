import { ArrowRightLeft, Boxes, PackageCheck, ShoppingCart, Truck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { dayTimeLabel, roundQty } from '@/lib/retail/live-metrics';
import { FLOW_STAGE_HINTS, FLOW_STAGE_LABELS, SERIAL_COVERAGE_LABELS, type FlowStage, type SerialCoverageState } from '@/lib/inventory/traceability';
import type { Tone } from '@/components/ui/tone';
import type { FlowCard, ProductFlow } from '@/modules/inventory/services/traceability.service';

const STAGE_ICON: Record<FlowStage, LucideIcon> = {
  IN_TRANSIT: Truck,
  RECEIVED: PackageCheck,
  IN_WAREHOUSE: Boxes,
  TRANSFERRED: ArrowRightLeft,
  SOLD: ShoppingCart,
  LOST: TriangleAlert,
};

const COVERAGE_TONE: Record<SerialCoverageState, Tone> = { NONE: 'neutral', PARTIAL: 'warning', COMPLETE: 'success', OVER: 'danger' };

function Column({ stage, total, unit, count, children }: { stage: FlowStage; total: number; unit: string; count?: number; children: React.ReactNode }) {
  const Icon = STAGE_ICON[stage];
  return (
    <section className="flex w-72 shrink-0 snap-start flex-col rounded-xl border border-border bg-muted/40 lg:w-auto lg:shrink" aria-label={FLOW_STAGE_LABELS[stage]}>
      <header className="space-y-1 border-b border-border/70 p-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{FLOW_STAGE_LABELS[stage]}</h3>
        </div>
        <p className="text-2xl font-bold tabular-nums">
          {roundQty(total).toLocaleString('es-CL')} <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        </p>
        <p className="text-xs text-muted-foreground">{count !== undefined ? `${count} movimiento${count === 1 ? '' : 's'} · ` : ''}{FLOW_STAGE_HINTS[stage]}</p>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">{text}</p>;
}

function Card({ card, unit }: { card: FlowCard; unit: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-medium">{card.title}</p>
        <span className="shrink-0 font-semibold tabular-nums">
          {roundQty(card.quantity).toLocaleString('es-CL')} {unit}
        </span>
      </div>
      {card.subtitle && <p className="mt-0.5 break-words text-xs text-muted-foreground">{card.subtitle}</p>}
      <p className="mt-1 break-words text-xs text-muted-foreground">
        {[card.at ? dayTimeLabel(card.at) : null, card.actor, card.reference].filter(Boolean).join(' · ')}
      </p>
      {card.evidenceUrl && isAllowedBlobUrl(card.evidenceUrl) && (
        <a href={card.evidenceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-primary underline">
          Ver foto de respaldo
        </a>
      )}
    </article>
  );
}

function CardList({ cards, unit, empty, hiddenCount }: { cards: FlowCard[]; unit: string; empty: string; hiddenCount: number }) {
  if (cards.length === 0) return <Empty text={empty} />;
  return (
    <>
      {cards.map((card) => (
        <Card key={card.id} card={card} unit={unit} />
      ))}
      {hiddenCount > 0 && <p className="px-1 text-center text-xs text-muted-foreground">y {hiddenCount} más en la línea de tiempo y en Movimientos de bodega</p>}
    </>
  );
}

/**
 * Tablero del flujo de un producto: de la orden de compra a la venta o la pérdida.
 * Todo sale de datos registrados (órdenes, kardex, stock); una columna sin datos queda vacía.
 */
export default function TraceabilityBoard({ flow }: { flow: ProductFlow }) {
  const unit = flow.product.unit;
  const hidden = (total: number, shown: number) => Math.max(0, total - shown);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0">
      <div className={cn('flex snap-x gap-3 lg:grid lg:grid-cols-3 2xl:grid-cols-6')}>
        <Column stage="IN_TRANSIT" total={flow.inTransit.total} unit={unit}>
          <CardList cards={flow.inTransit.cards} unit={unit} empty="No hay órdenes de compra por llegar de este producto." hiddenCount={0} />
        </Column>
        <Column stage="RECEIVED" total={flow.received.quantity} unit={unit} count={flow.received.count}>
          <CardList cards={flow.received.cards} unit={unit} empty="Sin llegadas en el período." hiddenCount={hidden(flow.received.count, flow.received.cards.length)} />
        </Column>
        <Column stage="IN_WAREHOUSE" total={flow.inWarehouse.total} unit={unit}>
          {flow.inWarehouse.warehouses.length === 0 ? (
            <Empty text="No hay stock de este producto en ninguna bodega." />
          ) : (
            flow.inWarehouse.warehouses.map((w) => (
              <article key={w.warehouseId} className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium">{w.warehouseName}</p>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {roundQty(w.quantity).toLocaleString('es-CL')} {unit}
                  </span>
                </div>
                {w.lots.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {w.lots.slice(0, 5).map((lot) => (
                      <li key={lot.lotNumber} className="break-words">
                        Lote {lot.lotNumber}: {roundQty(lot.quantity).toLocaleString('es-CL')}
                        {lot.expiryDate ? ` · vence ${lot.expiryDate.toISOString().slice(0, 10)}` : ''}
                      </li>
                    ))}
                    {w.lots.length > 5 && <li>y {w.lots.length - 5} lotes más</li>}
                  </ul>
                )}
                <div className="mt-1.5">
                  <StatusBadge tone={COVERAGE_TONE[w.serials.state]}>
                    {SERIAL_COVERAGE_LABELS[w.serials.state]}
                    {w.serials.state === 'PARTIAL' ? ` (faltan ${w.serials.missing})` : w.serials.state === 'OVER' ? ` (+${w.serials.extra})` : ''}
                  </StatusBadge>
                </div>
              </article>
            ))
          )}
        </Column>
        <Column stage="TRANSFERRED" total={flow.transferred.quantity} unit={unit} count={flow.transferred.count}>
          <CardList cards={flow.transferred.cards} unit={unit} empty="Sin traslados en el período." hiddenCount={hidden(flow.transferred.count, flow.transferred.cards.length)} />
        </Column>
        <Column stage="SOLD" total={flow.sold.quantity} unit={unit} count={flow.sold.count}>
          <CardList cards={flow.sold.cards} unit={unit} empty="Sin ventas en el período." hiddenCount={hidden(flow.sold.count, flow.sold.cards.length)} />
        </Column>
        <Column stage="LOST" total={flow.lost.quantity} unit={unit} count={flow.lost.count}>
          <CardList cards={flow.lost.cards} unit={unit} empty="Sin pérdidas ni devoluciones en el período." hiddenCount={hidden(flow.lost.count, flow.lost.cards.length)} />
        </Column>
      </div>
    </div>
  );
}
