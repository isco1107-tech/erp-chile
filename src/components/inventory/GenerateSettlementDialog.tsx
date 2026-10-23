'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/chile/tax';
import { formatCommission } from '@/lib/consignment/commission';
import { settlementTotals } from '@/lib/consignment/settlement';
import { generateSettlementAction, getPendingSettlementAction } from '@/modules/inventory/actions/consignment.actions';
import { settlementGenerateSchema } from '@/modules/inventory/schema';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import type { PendingSettlement } from '@/modules/inventory/services/consignment-settlement.service';
import { formatShortDate } from './consignment-format';

interface Props {
  consignorId: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}

/** Vista previa de lo que se le va a liquidar al seller y confirmación. Nada se guarda hasta confirmar. */
export default function GenerateSettlementDialog({ consignorId, onClose, onDone }: Props) {
  const [pending, setPending] = useState<PendingSettlement | null>(null);
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getPendingSettlementAction(consignorId).then((result) => {
      if (!active) return;
      if (result.success) setPending(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [consignorId]);

  const adjustmentAmount = adjustment.trim() === '' ? 0 : Number(adjustment.replace(',', '.'));
  const totals = useMemo(() => settlementTotals(pending?.lines ?? [], Number.isFinite(adjustmentAmount) ? Math.round(adjustmentAmount) : 0), [pending, adjustmentAmount]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = settlementGenerateSchema.safeParse({
      consignorId,
      adjustmentAmount: Number.isFinite(adjustmentAmount) ? adjustmentAmount : Number.NaN,
      adjustmentNote: adjustmentNote.trim() || undefined,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setSaving(true);
    try {
      const result = await generateSettlementAction(parsed.data);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Liquidación generada');
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  const empty = pending !== null && pending.lines.length === 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Liquidar a {pending?.consignor.name ?? 'seller'}</DialogTitle>
          <DialogDescription>
            Ventas emitidas de su mercadería menos tu comisión{pending?.consignor.commissionBps != null ? ` (por defecto ${formatCommission(pending.consignor.commissionBps)})` : ''}. Lo que anules o devuelvas después aparece como ajuste en la siguiente liquidación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {pending === null && !error && <p className="text-sm text-muted-foreground">Calculando…</p>}
          {empty && <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">No hay ventas pendientes de liquidar. Aun así puedes registrar un ajuste manual.</p>}

          {pending && pending.lines.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[620px] table-auto text-sm">
                <thead className="sticky top-0 bg-muted/95 text-left">
                  <tr>
                    <th className="p-2 font-medium">Documento</th>
                    <th className="p-2 font-medium">Producto</th>
                    <th className="p-2 text-right font-medium">Cant.</th>
                    <th className="p-2 text-right font-medium">Neto</th>
                    <th className="p-2 text-right font-medium">Comisión</th>
                    <th className="p-2 text-right font-medium">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.lines.map((line) => (
                    <tr key={line.salesDocumentItemId} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">
                        {DTE_TYPE_LABELS[line.dteType as keyof typeof DTE_TYPE_LABELS] ?? line.dteType} {line.folio ? `#${line.folio}` : ''}
                        <span className="block text-xs text-muted-foreground">{formatShortDate(line.issueDate)}</span>
                      </td>
                      <td className="p-2">{line.description}</td>
                      <td className="p-2 text-right">{line.quantity.toLocaleString('es-CL')}</td>
                      <td className="p-2 text-right">{formatCurrency(line.netAmount)}</td>
                      <td className="p-2 text-right">{formatCurrency(line.commissionAmount)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(line.payoutAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pending && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="settlement-adjustment">Ajuste manual (CLP, opcional)</Label>
                  <Input id="settlement-adjustment" inputMode="numeric" placeholder="Ej: -1500 o 3000" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} className="mt-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">Negativo descuenta al seller (p. ej. una nota de crédito por precio); positivo se suma.</p>
                </div>
                <div>
                  <Label htmlFor="settlement-adjustment-note">Motivo del ajuste</Label>
                  <Input id="settlement-adjustment-note" value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} disabled={adjustmentAmount === 0 || !Number.isFinite(adjustmentAmount)} className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label htmlFor="settlement-note">Nota (opcional)</Label>
                <Input id="settlement-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: ventas de octubre" className="mt-1.5" />
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Unidades</dt>
                  <dd className="font-medium">{totals.units.toLocaleString('es-CL')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Neto vendido</dt>
                  <dd className="font-medium">{formatCurrency(totals.netSales)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tu comisión</dt>
                  <dd className="font-medium">{formatCurrency(totals.commissionAmount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Le pagas al seller</dt>
                  <dd className="text-base font-semibold text-foreground">{formatCurrency(totals.payoutAmount)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">Montos netos (sin IVA). Esta liquidación es el estado de cuenta del seller: no genera asientos ni documentos tributarios.</p>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || pending === null || (empty && adjustmentAmount === 0)}>
              {saving ? 'Generando…' : 'Generar liquidación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
