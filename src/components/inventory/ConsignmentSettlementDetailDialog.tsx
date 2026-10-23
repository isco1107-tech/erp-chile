'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';
import { getSettlementAction } from '@/modules/inventory/actions/consignment.actions';
import type { SettlementDetail } from '@/modules/inventory/services/consignment-settlement.service';
import { SETTLEMENT_STATUS_BADGE, formatShortDate } from './consignment-format';

/** El estado de cuenta de una liquidación: cada línea con su neto, comisión y lo que se paga. */
export default function ConsignmentSettlementDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSettlementAction(id)
      .then((result) => {
        if (!active) return;
        if (result.success) setDetail(result.data);
        else setError(result.error);
      })
      .catch(() => active && setError('No se pudo cargar la liquidación. Revisa tu conexión e intenta de nuevo'));
    return () => {
      active = false;
    };
  }, [id]);

  const badge = detail ? SETTLEMENT_STATUS_BADGE[detail.status] : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{detail ? `Liquidación N° ${detail.number} · ${detail.consignorName}` : 'Liquidación'}</DialogTitle>
          <DialogDescription>
            {detail ? `${detail.consignorRut} · generada el ${formatShortDate(detail.createdAt)}` : error ? 'No se pudo cargar' : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {detail && badge && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              {detail.paidAt && (
                <span className="text-muted-foreground">
                  Pagada el {formatShortDate(detail.paidAt)}
                  {detail.paymentReference ? ` · ${detail.paymentReference}` : ''}
                </span>
              )}
              {detail.voidedAt && (
                <span className="text-muted-foreground">
                  Anulada el {formatShortDate(detail.voidedAt)}
                  {detail.voidReason ? ` · ${detail.voidReason}` : ''}
                </span>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] table-auto text-sm">
                <thead className="sticky top-0 bg-muted/95 text-left">
                  <tr>
                    <th className="p-2 font-medium">Producto</th>
                    <th className="p-2 text-right font-medium">Cant.</th>
                    <th className="p-2 text-right font-medium">Neto</th>
                    <th className="p-2 text-right font-medium">Comisión</th>
                    <th className="p-2 text-right font-medium">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="p-2">
                        {line.description}
                        {line.sku && <span className="block font-mono text-xs text-muted-foreground">{line.sku}</span>}
                      </td>
                      <td className="p-2 text-right">{line.quantity.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-right">{formatCurrency(line.netAmount)}</td>
                      <td className="p-2 text-right">{formatCurrency(line.commissionAmount)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(line.payoutAmount)}</td>
                    </tr>
                  ))}
                  {detail.lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-muted-foreground">
                        Solo ajuste manual, sin ventas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-xs text-muted-foreground">Unidades</dt>
                <dd className="font-medium">{detail.units.toLocaleString('es-CL')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Neto vendido</dt>
                <dd className="font-medium">{formatCurrency(detail.netSales)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tu comisión</dt>
                <dd className="font-medium">{formatCurrency(detail.commissionAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ajuste</dt>
                <dd className="font-medium">{formatCurrency(detail.adjustmentAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">A pagar al seller</dt>
                <dd className="text-base font-semibold text-foreground">{formatCurrency(detail.payoutAmount)}</dd>
              </div>
            </dl>
            {detail.adjustmentNote && <p className="text-xs text-muted-foreground">Ajuste: {detail.adjustmentNote}</p>}
            {detail.note && <p className="text-xs text-muted-foreground">Nota: {detail.note}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
