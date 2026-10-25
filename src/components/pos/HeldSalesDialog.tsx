'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/chile/tax';
import { computeDocument } from '@/modules/sales/calc';
import { countUnits, formatQuantity } from '@/lib/pos/cart';
import { clockLabel } from '@/lib/retail/live-metrics';
import type { HeldSale } from '@/lib/pos/held-sales';

interface Props {
  open: boolean;
  held: HeldSale[];
  /** Hay una venta en curso: al retomar otra, esa pasa a espera. */
  currentHasItems: boolean;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}

/** Ventas dejadas a un lado para atender a otro cliente. Una venta en espera no reserva ni descuenta stock. */
export default function HeldSalesDialog({ open, held, currentHasItems, onResume, onDiscard, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ventas en espera</DialogTitle>
          <DialogDescription>
            {currentHasItems ? 'Al retomar una, la venta que estás haciendo pasa a espera.' : 'Retoma una para seguir donde quedó.'} No reservan stock hasta que se cobran.
          </DialogDescription>
        </DialogHeader>
        {held.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay ventas en espera.</p>
        ) : (
          <ul className="space-y-2">
            {held.map((sale) => {
              const total = computeDocument(sale.lines.map((line) => ({ ...line, unitPrice: line.netPrice }))).totals.totalAmount;
              return (
                <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {clockLabel(new Date(sale.heldAt)).slice(0, 5)} · {formatQuantity(countUnits(sale.lines))} {countUnits(sale.lines) === 1 ? 'unidad' : 'unidades'} · {formatCurrency(total)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sale.lines.map((line) => line.name).join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sale.customerRut ? `${sale.customerName ?? 'Cliente'} · ${sale.customerRut}` : 'Consumidor final'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => onDiscard(sale.id)}>Descartar</Button>
                    <Button type="button" size="sm" onClick={() => onResume(sale.id)}>Retomar</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
