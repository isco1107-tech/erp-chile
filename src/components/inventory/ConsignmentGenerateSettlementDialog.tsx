'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/chile/tax';
import { parseClpAmount } from '@/lib/consignment/amount';
import { formatCommission } from '@/lib/consignment/commission';
import { settlementTotals } from '@/lib/consignment/settlement';
import { createIdempotencyTracker } from '@/lib/idempotency';
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
export default function ConsignmentGenerateSettlementDialog({ consignorId, onClose, onDone }: Props) {
  const [pending, setPending] = useState<PendingSettlement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Un reintento de la misma confirmación (doble clic, respuesta perdida) lleva la misma clave y no genera otra liquidación.
  const idempotency = useRef(createIdempotencyTracker());

  useEffect(() => {
    let active = true;
    setLoadError('');
    getPendingSettlementAction(consignorId)
      .then((result) => {
        if (!active) return;
        if (result.success) setPending(result.data);
        else setLoadError(result.error);
      })
      .catch(() => active && setLoadError('No se pudo calcular lo pendiente. Revisa tu conexión e intenta de nuevo'));
    return () => {
      active = false;
    };
  }, [consignorId, reloadKey]);

  // Un solo valor alimenta la vista previa, el botón y el envío: `null` = lo escrito no es un monto válido.
  const adjustmentAmount = adjustment.trim() === '' ? 0 : parseClpAmount(adjustment);
  const totals = useMemo(() => settlementTotals(pending?.lines ?? [], adjustmentAmount ?? 0), [pending, adjustmentAmount]);

  const empty = pending !== null && pending.lines.length === 0;
  const negative = totals.payoutAmount < 0;
  const canSubmit = pending !== null && !saving && adjustmentAmount !== null && !negative && !(empty && adjustmentAmount === 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (adjustmentAmount === null) return;
    setError('');
    const payload = {
      consignorId,
      adjustmentAmount,
      adjustmentNote: adjustmentNote.trim() || undefined,
      note: note.trim() || undefined,
      expectedPayoutAmount: totals.payoutAmount,
    };
    const parsed = settlementGenerateSchema.safeParse({ ...payload, idempotencyKey: idempotency.current.keyFor(payload) });
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
        // Si las ventas cambiaron mientras tanto, se vuelve a calcular para que la persona confirme lo nuevo.
        if (result.error.startsWith('Las ventas cambiaron')) setReloadKey((key) => key + 1);
        return;
      }
      idempotency.current.reset();
      toast.success(`${result.message ?? 'Liquidación generada'} · ${formatCurrency(result.data.payoutAmount)} al seller`);
      await onDone();
    } catch {
      setError('No se pudo generar la liquidación. Revisa tu conexión: si ya se generó, aparecerá en la lista');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Liquidar a {pending?.consignor.name ?? 'seller'}</DialogTitle>
          <DialogDescription>
            Ventas emitidas de su mercadería menos tu comisión{pending?.consignor.commissionBps != null ? ` (por defecto ${formatCommission(pending.consignor.commissionBps)})` : ''}. Lo que anules o devuelvas después aparece como ajuste en la siguiente liquidación.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {pending === null && !loadError && <p className="text-sm text-muted-foreground">Calculando…</p>}
          {loadError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">{loadError}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Reintentar
              </Button>
            </div>
          )}
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
                        {DTE_TYPE_LABELS[line.dteType]} {line.folio ? `#${line.folio}` : ''}
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
                  <Input
                    id="settlement-adjustment"
                    inputMode="numeric"
                    placeholder="Ej: -1.500 o 3.000"
                    value={adjustment}
                    onChange={(e) => setAdjustment(e.target.value)}
                    aria-invalid={adjustmentAmount === null}
                    aria-describedby="settlement-adjustment-help"
                    className="mt-1.5"
                  />
                  <p id="settlement-adjustment-help" className={adjustmentAmount === null ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
                    {adjustmentAmount === null
                      ? 'Escribe un monto entero en pesos, ej: -1500 o 3.000 (el punto separa miles; sin comas ni decimales).'
                      : 'Negativo descuenta al seller (p. ej. una nota de crédito por precio); positivo se suma.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="settlement-adjustment-note">Motivo del ajuste</Label>
                  <Input id="settlement-adjustment-note" value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} disabled={!adjustmentAmount} className="mt-1.5" />
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
                  <dd className={negative ? 'text-base font-semibold text-destructive' : 'text-base font-semibold text-foreground'}>{formatCurrency(totals.payoutAmount)}</dd>
                </div>
              </dl>
              {negative && (
                <p role="alert" className="text-sm text-destructive">
                  {totals.linesPayout < 0
                    ? 'Las devoluciones superan lo vendido: no hay nada que pagarle todavía. Ese saldo queda pendiente y se descuenta en la próxima liquidación.'
                    : 'El ajuste manual deja el total en negativo: corrígelo para que la liquidación no sea menor a cero.'}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Montos netos (sin IVA). Esta liquidación es el estado de cuenta del seller: no registra el pago ni genera asientos ni documentos tributarios.</p>
            </>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? 'Generando…' : 'Generar liquidación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
