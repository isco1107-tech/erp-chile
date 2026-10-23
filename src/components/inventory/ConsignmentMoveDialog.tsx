'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { receiveConsignedStockAction, returnConsignedStockAction } from '@/modules/inventory/actions/consignment.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { consignmentReceiveSchema, consignmentReturnSchema } from '@/modules/inventory/schema';
import type { ConsignedProductRow } from '@/modules/inventory/services/consignment.service';

export type MoveMode = 'receive' | 'return';

interface Props {
  mode: MoveMode;
  product: ConsignedProductRow;
  sellerName: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}

/** Recibir mercadería del seller o devolvérsela: el stock sube o baja, sin compra, costo ni asiento. */
export default function ConsignmentMoveDialog({ mode, product, sellerName, onClose, onDone }: Props) {
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listWarehousesAction().then((result) => {
      if (!result.success) return;
      const list = result.data.map((warehouse) => ({ id: warehouse.id, name: warehouse.name }));
      setWarehouses(list);
      setWarehouseId((current) => current || list[0]?.id || '');
    });
  }, []);

  const receiving = mode === 'receive';
  const available = product.byWarehouse;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const payload = {
      productId: product.id,
      warehouseId,
      quantity: Number(quantity),
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(receiving && product.tracksLots ? { lotNumber: lotNumber.trim() || undefined, expiryDate } : {}),
    };
    const parsed = (receiving ? consignmentReceiveSchema : consignmentReturnSchema).safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }

    setSaving(true);
    try {
      const result = receiving ? await receiveConsignedStockAction(parsed.data) : await returnConsignedStockAction(parsed.data);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Movimiento registrado');
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{receiving ? 'Recibir mercadería del seller' : 'Devolver mercadería al seller'}</DialogTitle>
          <DialogDescription>
            {product.name} · {sellerName}. {receiving ? 'Sube el stock sin registrar una compra: la mercadería sigue siendo del seller.' : 'Baja el stock sin venderlo: la mercadería vuelve al seller.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="consignment-warehouse">Bodega</Label>
            <select id="consignment-warehouse" className={nativeSelectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.length === 0 && <option value="">Cargando…</option>}
              {warehouses.map((warehouse) => {
                const here = available.find((row) => row.warehouse === warehouse.name)?.quantity;
                return (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {!receiving && here !== undefined ? ` (hay ${here.toLocaleString('es-CL')})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <Label htmlFor="consignment-quantity">Cantidad ({product.unit})</Label>
            <Input id="consignment-quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(',', '.'))} className="mt-1.5" autoFocus />
          </div>

          {receiving && product.tracksLots && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="consignment-lot">Lote</Label>
                <Input id="consignment-lot" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="consignment-expiry">Vencimiento</Label>
                <Input id="consignment-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="consignment-reference">Referencia (opcional)</Label>
            <Input id="consignment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: guía del seller, N° de entrega" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="consignment-notes">Notas (opcional)</Label>
            <Input id="consignment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : receiving ? 'Recibir' : 'Devolver'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
