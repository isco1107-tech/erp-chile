'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/chile/tax';
import { sendPurchaseOrderAction, cancelPurchaseOrderAction } from '@/modules/purchases/actions/purchase-order.actions';
import { createGoodsReceiptAction, cancelGoodsReceiptAction } from '@/modules/purchases/actions/goods-receipt.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { listLotTrackedProductIdsAction } from '@/modules/inventory/actions/products.actions';
import type { PurchaseOrderWithRelations } from '@/modules/purchases/services/purchase-order.service';
import type { GoodsReceiptWithRelations } from '@/modules/purchases/services/goods-receipt.service';
import type { Warehouse } from '@prisma/client';

import { useConfirm } from '@/components/ui/confirm-provider';
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviada', PARTIALLY_RECEIVED: 'Recibida parcial',
  RECEIVED: 'Recibida', CLOSED: 'Cerrada', CANCELLED: 'Anulada',
};

export default function PurchaseOrderDetailClient({
  order,
  initialReceipts,
}: {
  order: PurchaseOrderWithRelations;
  initialReceipts: GoodsReceiptWithRelations[];
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [receipts, setReceipts] = useState(initialReceipts);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, { lotNumber: string; expiryDate: string }>>({});
  const [lotProductIds, setLotProductIds] = useState<Set<string>>(new Set());

  const total = order.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const canReceive = order.status === 'SENT' || order.status === 'PARTIALLY_RECEIVED';

  function refresh() {
    router.refresh();
  }

  async function handleSend() {
    setBusy(true);
    try {
      const result = await sendPurchaseOrderAction(order.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(result.message);
      refresh();
    } finally { setBusy(false); }
  }

  async function handleCancel() {
    if (!await confirm('¿Anular esta orden de compra?')) return;
    setBusy(true);
    try {
      const result = await cancelPurchaseOrderAction(order.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(result.message);
      refresh();
    } finally { setBusy(false); }
  }

  async function openReceive() {
    setReceiving(true);
    const productIds = order.items.map((item) => item.productId).filter((id): id is string => !!id);
    if (productIds.length > 0) {
      const tracked = await listLotTrackedProductIdsAction(productIds);
      if (tracked.success) setLotProductIds(new Set(tracked.data));
    }
    if (warehouses.length === 0) {
      const r = await listWarehousesAction();
      if (r.success) {
        setWarehouses(r.data);
        const def = r.data.find((w) => w.isDefault) ?? r.data[0];
        if (def) setWarehouseId(def.id);
      }
    }
  }

  async function handleConfirmReceipt() {
    const items = order.items
      .map((item) => ({
        orderItemId: item.id,
        quantity: Number(quantities[item.id]) || 0,
        lotNumber: lots[item.id]?.lotNumber.trim() || undefined,
        expiryDate: lots[item.id]?.expiryDate || undefined,
      }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) { toast.error('Ingrese al menos una cantidad a recibir'); return; }
    if (!warehouseId) { toast.error('Seleccione una bodega'); return; }
    setBusy(true);
    try {
      const result = await createGoodsReceiptAction({ orderId: order.id, warehouseId, items });
      if (!result.success) { toast.error(result.error); return; }
      toast.success(result.message);
      setReceiving(false);
      setQuantities({});
      setLots({});
      refresh();
    } finally { setBusy(false); }
  }

  async function handleCancelReceipt(id: string) {
    if (!await confirm('¿Anular esta recepción? Revierte el stock que aplicó.')) return;
    setBusy(true);
    try {
      const result = await cancelGoodsReceiptAction(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(result.message);
      setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'CANCELLED' } : r)));
      refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 text-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Orden de Compra #{order.folio}</h2>
            <p className="text-muted-foreground">Proveedor: {order.contact.rut} — {order.contact.razonSocial}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{STATUS_LABEL[order.status]}</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] table-auto border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-2">Descripción</th>
                <th className="p-2 text-right">Pedido</th>
                <th className="p-2 text-right">Recibido</th>
                <th className="p-2 text-right">Facturado</th>
                <th className="p-2 text-right">Costo Unit.</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="p-2">{item.description}</td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">{item.receivedQuantity}</td>
                  <td className="p-2 text-right">{item.invoicedQuantity}</td>
                  <td className="p-2 text-right">{formatCurrency(item.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end font-bold">Total: {formatCurrency(total)}</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {order.status === 'DRAFT' && (
            <Button type="button" size="sm" disabled={busy} onClick={handleSend}>Enviar</Button>
          )}
          {canReceive && !receiving && (
            <Button type="button" size="sm" disabled={busy} onClick={openReceive}>Registrar Recepción</Button>
          )}
          {(order.status === 'SENT' || order.status === 'RECEIVED' || order.status === 'PARTIALLY_RECEIVED') && (
            <Link href={`/dashboard/purchases/new?purchaseOrderId=${order.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Facturar
            </Link>
          )}
          {order.status !== 'CANCELLED' && order.status !== 'CLOSED' && (
            <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={handleCancel}>Anular Orden</Button>
          )}
        </div>
      </div>

      {receiving && (
        <div className="rounded-xl border border-border p-6 text-sm">
          <h3 className="mb-3 font-semibold">Registrar recepción de mercadería</h3>
          <div className="mb-3">
            <Label htmlFor="warehouse">Bodega</Label>
            <select id="warehouse" className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Seleccione bodega</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            {order.items.filter((item) => item.quantity - item.receivedQuantity > 0.0001).map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>{item.description} <span className="text-muted-foreground">(pendiente: {item.quantity - item.receivedQuantity})</span></span>
                  <Input type="number" min="0" step="any" className="w-28" aria-label={`Cantidad a recibir de ${item.description}`} value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                </div>
                {item.productId && lotProductIds.has(item.productId) && (
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                    <span>Lote y vencimiento</span>
                    <Input
                      className="h-8 w-36"
                      placeholder="N° de lote"
                      aria-label={`Lote de ${item.description}`}
                      value={lots[item.id]?.lotNumber ?? ''}
                      onChange={(e) => setLots((prev) => ({ ...prev, [item.id]: { lotNumber: e.target.value, expiryDate: prev[item.id]?.expiryDate ?? '' } }))}
                    />
                    <Input
                      type="date"
                      className="h-8 w-40"
                      aria-label={`Vencimiento de ${item.description}`}
                      value={lots[item.id]?.expiryDate ?? ''}
                      onChange={(e) => setLots((prev) => ({ ...prev, [item.id]: { lotNumber: prev[item.id]?.lotNumber ?? '', expiryDate: e.target.value } }))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setReceiving(false)}>Cancelar</Button>
            <Button type="button" size="sm" disabled={busy} onClick={handleConfirmReceipt}>Confirmar Recepción</Button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="rounded-xl border border-border p-6 text-sm">
          <h3 className="mb-3 font-semibold">Recepciones</h3>
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span>
                  Recepción #{r.folio} — {new Date(r.receivedAt).toLocaleDateString('es-CL')} — {r.warehouse.name}
                  {r.status === 'CANCELLED' && <span className="ml-2 text-destructive">(anulada)</span>}
                </span>
                {r.status === 'CONFIRMED' && (
                  <Button type="button" size="xs" variant="destructive" disabled={busy} onClick={() => handleCancelReceipt(r.id)}>Anular</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
