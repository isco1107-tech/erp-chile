import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dayTimeLabel } from '@/lib/retail/live-metrics';
import { WARRANTY_LABELS, warrantyStatus } from '@/lib/inventory/traceability';
import type { Tone } from '@/components/ui/tone';
import type { SerialJourney } from '@/modules/inventory/services/traceability.service';

const STATUS_TONE: Record<SerialJourney['status'], Tone> = { IN_STOCK: 'success', SOLD: 'info', LOST: 'danger', RETURNED: 'warning' };
const WARRANTY_TONE = { NONE: 'neutral', ACTIVE: 'success', EXPIRED: 'danger' } as const;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Recorrido completo de un número de serie: origen, ubicación, venta, garantía y servicio técnico. */
export default function SerialJourneyView({ journeys, now }: { journeys: SerialJourney[]; now: Date }) {
  return (
    <div className="space-y-4">
      {journeys.map((j) => {
        const warranty = warrantyStatus(j.warrantyUntil, now);
        const facts: Array<[string, string | null]> = [
          ['Ubicación', j.warehouse ?? (j.status === 'IN_STOCK' ? null : 'Fuera de bodega')],
          ['Lote', j.lotNumber],
          ['Proveedor', j.supplier],
          ['Entró por', j.receipt ?? 'Registrada a mano'],
          ['Ingresó', dayTimeLabel(j.receivedAt)],
          ['Vendida en', j.sale ? `${j.sale}${j.soldAt ? ` · ${dayTimeLabel(j.soldAt)}` : ''}` : null],
          ['Cliente', j.customer ? `${j.customer.name} · ${j.customer.rut}` : null],
        ];
        return (
          <Card key={j.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="break-all font-mono">{j.serial}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={STATUS_TONE[j.status]}>{j.statusLabel}</StatusBadge>
                  {j.status === 'SOLD' && <StatusBadge tone={WARRANTY_TONE[warranty.state]}>{WARRANTY_LABELS[warranty.state]}{warranty.daysLeft !== null ? ` (${warranty.daysLeft} d)` : ''}</StatusBadge>}
                </div>
              </div>
              <CardDescription className="break-words">
                <Link href={`/dashboard/inventory/trazabilidad?producto=${encodeURIComponent(j.product.id)}&vista=series`} className="underline">{j.product.name}</Link> · SKU {j.product.sku}
                {j.warrantyUntil ? ` · garantía hasta ${day(j.warrantyUntil)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {facts.filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              {j.tickets.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Servicio técnico</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {j.tickets.map((t) => (
                      <li key={t.folio} className="break-words">Orden #{t.folio} · {t.equipment} · {dayTimeLabel(t.receivedAt)}{t.warranty ? ' · por garantía' : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="mb-1 text-sm font-medium">Historia</p>
                <ol className="space-y-1 border-l border-border pl-3 text-sm">
                  {j.events.map((e) => (
                    <li key={e.id} className="break-words">
                      <span className="font-medium">{e.title}</span>
                      <span className="block text-xs text-muted-foreground">{[dayTimeLabel(e.at), e.actor, e.reference, e.note].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
