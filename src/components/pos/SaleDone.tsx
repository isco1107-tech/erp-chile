'use client';

import { CheckCircle2, Printer, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/chile/tax';

export interface CompletedSale {
  folio: number | null;
  total: number;
  methodLabel: string;
  isCash: boolean;
  received: number;
  change: number;
}

interface Props {
  sale: CompletedSale;
  /** Mensaje del cajón/impresora si algo falló (la venta ya está cobrada y emitida). */
  hardwareProblem: string | null;
  canOpenDrawer: boolean;
  onOpenDrawer: () => void;
  onPrint: () => void;
  onNewSale: () => void;
}

/**
 * Lo que queda a la vista tras cobrar: el vuelto, enorme, hasta que el cajero
 * empiece la próxima venta. No bloquea: escanear el siguiente producto la cierra.
 */
export default function SaleDone({ sale, hardwareProblem, canOpenDrawer, onOpenDrawer, onPrint, onNewSale }: Props) {
  return (
    <section aria-label="Venta completada" className="rounded-2xl border-2 border-success/40 bg-success-soft p-5 text-success shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-6" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Venta completada · Boleta #{sale.folio ?? '—'}</h2>
        </div>
        <span className="text-sm">{sale.methodLabel} · {formatCurrency(sale.total)}</span>
      </div>
      {sale.isCash ? (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 rounded-xl bg-card/70 px-4 py-3">
          <span className="text-sm">Recibido {formatCurrency(sale.received)}</span>
          <span className="flex items-baseline gap-3">
            <span className="text-lg font-semibold">Vuelto</span>
            <span className="text-6xl font-bold tabular-nums" aria-live="polite">{formatCurrency(sale.change)}</span>
          </span>
        </div>
      ) : (
        <p className="mt-3 text-sm">Pago registrado. No hay vuelto que entregar.</p>
      )}
      {hardwareProblem && (
        <p role="alert" className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          {hardwareProblem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {canOpenDrawer && (
          <Button type="button" variant="outline" onClick={onOpenDrawer}>
            <Unlock className="mr-2 size-4" aria-hidden="true" /> Abrir cajón
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onPrint}>
          <Printer className="mr-2 size-4" aria-hidden="true" /> Imprimir boleta #{sale.folio ?? '—'}
        </Button>
        <Button type="button" onClick={onNewSale}>Nueva venta</Button>
      </div>
    </section>
  );
}
