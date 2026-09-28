'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { stockMovementSchema } from '@/modules/inventory/schema';
import { goodsReceiptCreateSchema, purchaseDocumentCreateSchema, PURCHASE_DOCUMENT_TYPE_LABELS } from '@/modules/purchases/schema';
import { computeDocument } from '@/modules/sales/calc';
import type { ContingencyOrder, ContingencyProduct, ContingencySupplier, ContingencyWarehouse } from '@/modules/offline/services/contingency-data.service';
import {
  buildContingencyOperation,
  movementLabel,
  OFFLINE_MOVEMENT_LABELS,
  OFFLINE_MOVEMENT_TYPES,
  OFFLINE_PURCHASE_TYPES,
  pendingAfterQueue,
  purchaseLabel,
  receiptLabel,
  todayInChile,
  type OfflineMovementType,
  type OfflinePurchaseType,
} from '@/lib/offline/contingency';
import type { QueuedOperation } from '@/lib/offline/queue-rules';

type Enqueue = (operation: QueuedOperation) => Promise<boolean>;

interface Identity {
  companyId: string;
  userId: string;
  enqueue: Enqueue;
}

const optionLabel = (product: ContingencyProduct) => `${product.sku} · ${product.name}`;
const quantityFormat = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });

function firstIssue(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Revisa los datos';
}

/**
 * Buscador de producto con la lista del equipo (sin servidor). Acepta el
 * texto de la sugerencia o el SKU exacto. Para vaciarlo, el padre lo vuelve a
 * montar con otra `key`.
 */
function ProductPicker({ id, products, onChange }: { id: string; products: ContingencyProduct[]; onChange: (productId: string) => void }) {
  const [text, setText] = useState('');
  const listId = `${id}-options`;
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={text}
        autoComplete="off"
        placeholder="Escribe el SKU o el nombre"
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          const needle = value.trim().toLowerCase();
          const match = products.find((p) => optionLabel(p) === value) ?? products.find((p) => p.sku.toLowerCase() === needle);
          onChange(match?.id ?? '');
        }}
      />
      <datalist id={listId}>
        {products.map((product) => (
          <option key={product.id} value={optionLabel(product)} />
        ))}
      </datalist>
    </>
  );
}

function WarehouseSelect({ id, warehouses, value, onChange, exclude }: { id: string; warehouses: ContingencyWarehouse[]; value: string; onChange: (id: string) => void; exclude?: string }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={nativeSelectClass}>
      <option value="">Selecciona una bodega</option>
      {warehouses
        .filter((w) => w.id !== exclude)
        .map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
    </select>
  );
}

// ─── Movimiento de stock ────────────────────────────────────────────────────

export function StockMovementOfflineForm({ companyId, userId, enqueue, products, warehouses }: Identity & { products: ContingencyProduct[]; warehouses: ContingencyWarehouse[] }) {
  const trackable = useMemo(() => products.filter((p) => p.isTrackable), [products]);
  const [formKey, setFormKey] = useState(0);
  const [type, setType] = useState<OfflineMovementType>('ADJUSTMENT_IN');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(0);
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const product = trackable.find((p) => p.id === productId);
  const isIn = type === 'ADJUSTMENT_IN';
  const capturesLot = isIn && !!product?.tracksLots;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      productId,
      warehouseId,
      type,
      quantity: Number(quantity),
      unitCost: isIn ? unitCost : undefined,
      targetWarehouseId: type === 'TRANSFER' ? targetWarehouseId || undefined : undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      lotNumber: capturesLot ? lotNumber.trim() || undefined : undefined,
      expiryDate: capturesLot ? expiryDate || undefined : undefined,
    };
    const parsed = stockMovementSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error.issues));
      return;
    }
    setSaving(true);
    try {
      const saved = await enqueue(
        buildContingencyOperation({ companyId, userId, kind: 'STOCK_MOVEMENT', payload: parsed.data, label: movementLabel(type, parsed.data.quantity, product?.name ?? 'producto') })
      );
      if (saved) {
        setProductId('');
        setQuantity('');
        setUnitCost(0);
        setLotNumber('');
        setExpiryDate('');
        setReference('');
        setNotes('');
        setFormKey((k) => k + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div role="radiogroup" aria-label="Tipo de movimiento" className="inline-flex rounded-xl border border-border p-1">
        {OFFLINE_MOVEMENT_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={type === option}
            onClick={() => setType(option)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${type === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {OFFLINE_MOVEMENT_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="offline-stock-product">Producto</Label>
          <ProductPicker key={formKey} id="offline-stock-product" products={trackable} onChange={setProductId} />
        </div>
        <div>
          <Label htmlFor="offline-stock-warehouse">{type === 'TRANSFER' ? 'Bodega de origen' : 'Bodega'}</Label>
          <WarehouseSelect id="offline-stock-warehouse" warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} />
        </div>
        {type === 'TRANSFER' && (
          <div>
            <Label htmlFor="offline-stock-target">Bodega de destino</Label>
            <WarehouseSelect id="offline-stock-target" warehouses={warehouses} value={targetWarehouseId} onChange={setTargetWarehouseId} exclude={warehouseId} />
          </div>
        )}
        <div>
          <Label htmlFor="offline-stock-quantity">Cantidad{product ? ` (${product.unit})` : ''}</Label>
          <Input id="offline-stock-quantity" type="number" min={0} step="any" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        {isIn && (
          <div>
            <Label htmlFor="offline-stock-cost">Costo unitario neto</Label>
            <CurrencyInput id="offline-stock-cost" value={unitCost} onChange={setUnitCost} />
          </div>
        )}
        {capturesLot && (
          <>
            <div>
              <Label htmlFor="offline-stock-lot">Lote</Label>
              <Input id="offline-stock-lot" value={lotNumber} maxLength={40} onChange={(e) => setLotNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="offline-stock-expiry">Vencimiento</Label>
              <Input id="offline-stock-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="offline-stock-reference">Referencia (opcional)</Label>
          <Input id="offline-stock-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="offline-stock-notes">Notas (opcional)</Label>
          <textarea id="offline-stock-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
        </div>
      </div>

      {trackable.length === 0 && <p className="text-sm text-muted-foreground">No hay productos con control de stock en el catálogo guardado.</p>}

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Guardando…' : `Registrar ${OFFLINE_MOVEMENT_LABELS[type].toLowerCase()}`}
      </Button>
    </form>
  );
}

// ─── Compra ─────────────────────────────────────────────────────────────────

interface PurchaseLine {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitCost: number;
  isExempt: boolean;
}

const emptyLine = (key: number): PurchaseLine => ({ key, productId: '', description: '', quantity: '', unitCost: 0, isExempt: false });

export function PurchaseOfflineForm({
  companyId,
  userId,
  enqueue,
  products,
  warehouses,
  suppliers,
}: Identity & { products: ContingencyProduct[]; warehouses: ContingencyWarehouse[]; suppliers: ContingencySupplier[] }) {
  const [formKey, setFormKey] = useState(0);
  const [contactId, setContactId] = useState('');
  const [documentType, setDocumentType] = useState<OfflinePurchaseType>('FACTURA');
  const [folio, setFolio] = useState('');
  const [issueDate, setIssueDate] = useState(() => todayInChile());
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine(1)]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(
    () =>
      computeDocument(lines.map((line) => ({ unitPrice: line.unitCost, quantity: Number(line.quantity) || 0, isExempt: line.isExempt }))).totals,
    [lines]
  );

  function updateLine(key: number, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function chooseProduct(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, productId, description: product ? product.name : line.description } : line)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const supplier = suppliers.find((s) => s.id === contactId);
    const hasProductLines = lines.some((line) => line.productId);
    const payload = {
      contactId,
      warehouseId: hasProductLines ? warehouseId || undefined : undefined,
      documentType,
      folio: folio.trim(),
      issueDate,
      notes: notes.trim() || undefined,
      items: lines.map((line) => ({
        productId: line.productId || undefined,
        description: line.description.trim(),
        quantity: Number(line.quantity) || 0,
        unitCost: line.unitCost,
        isExempt: line.isExempt,
      })),
    };
    const parsed = purchaseDocumentCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error.issues));
      return;
    }
    if (hasProductLines && !parsed.data.warehouseId) {
      toast.error('Selecciona la bodega donde entra la mercadería');
      return;
    }
    setSaving(true);
    try {
      const saved = await enqueue(
        buildContingencyOperation({
          companyId,
          userId,
          kind: 'PURCHASE',
          payload: parsed.data,
          label: purchaseLabel(PURCHASE_DOCUMENT_TYPE_LABELS[documentType], parsed.data.folio, supplier?.name ?? 'proveedor'),
        })
      );
      if (saved) {
        setContactId('');
        setFolio('');
        setNotes('');
        setLines([emptyLine(1)]);
        setFormKey((k) => k + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="offline-purchase-supplier">Proveedor</Label>
          <select id="offline-purchase-supplier" value={contactId} onChange={(e) => setContactId(e.target.value)} className={nativeSelectClass}>
            <option value="">Selecciona un proveedor</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} · {supplier.rut}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="offline-purchase-type">Documento</Label>
          <select id="offline-purchase-type" value={documentType} onChange={(e) => setDocumentType(e.target.value as OfflinePurchaseType)} className={nativeSelectClass}>
            {OFFLINE_PURCHASE_TYPES.map((option) => (
              <option key={option} value={option}>
                {PURCHASE_DOCUMENT_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="offline-purchase-folio">Folio del proveedor</Label>
          <Input id="offline-purchase-folio" value={folio} inputMode="numeric" onChange={(e) => setFolio(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="offline-purchase-date">Fecha de emisión</Label>
          <Input id="offline-purchase-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="offline-purchase-warehouse">Bodega de recepción</Label>
          <WarehouseSelect id="offline-purchase-warehouse" warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} />
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <fieldset key={line.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_9rem_auto_auto] sm:items-end">
            <legend className="sr-only">Línea {index + 1}</legend>
            <div>
              <Label htmlFor={`offline-line-product-${line.key}`}>Producto (opcional)</Label>
              <ProductPicker key={`${formKey}-${line.key}`} id={`offline-line-product-${line.key}`} products={products} onChange={(id) => chooseProduct(line.key, id)} />
            </div>
            <div>
              <Label htmlFor={`offline-line-description-${line.key}`}>Descripción</Label>
              <Input id={`offline-line-description-${line.key}`} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`offline-line-quantity-${line.key}`}>Cantidad</Label>
              <Input id={`offline-line-quantity-${line.key}`} type="number" min={0} step="any" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`offline-line-cost-${line.key}`}>Costo unit. neto</Label>
              <CurrencyInput id={`offline-line-cost-${line.key}`} value={line.unitCost} onChange={(value) => updateLine(line.key, { unitCost: value })} />
            </div>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" checked={line.isExempt} onChange={(e) => updateLine(line.key, { isExempt: e.target.checked })} />
              Exento
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Quitar línea ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </fieldset>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine(Math.max(0, ...prev.map((l) => l.key)) + 1)])}>
          <Plus className="mr-1 size-4" /> Agregar línea
        </Button>
      </div>

      <div>
        <Label htmlFor="offline-purchase-notes">Notas (opcional)</Label>
        <textarea id="offline-purchase-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm tabular-nums text-muted-foreground">
          Neto {formatCurrency(totals.netAmount)}
          {totals.exemptAmount > 0 && ` · Exento ${formatCurrency(totals.exemptAmount)}`} · IVA {formatCurrency(totals.ivaAmount)} ·{' '}
          <span className="font-semibold text-foreground">Total {formatCurrency(totals.totalAmount)}</span>
        </p>
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Registrar compra'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Compara el total con el del documento del proveedor. Notas de crédito, de débito y facturas de una orden de compra se registran con
        conexión, en Compras.
      </p>
    </form>
  );
}

// ─── Recepción de OC ────────────────────────────────────────────────────────

export function GoodsReceiptOfflineForm({
  companyId,
  userId,
  enqueue,
  orders,
  warehouses,
  queued,
}: Identity & { orders: ContingencyOrder[]; warehouses: ContingencyWarehouse[]; queued: QueuedOperation[] }) {
  const [orderId, setOrderId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, { lotNumber: string; expiryDate: string }>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const order = orders.find((o) => o.id === orderId);
  const lines = useMemo(() => (order ? pendingAfterQueue(order.lines, order.id, queued) : []), [order, queued]);

  function chooseOrder(id: string) {
    setOrderId(id);
    setQuantities({});
    setLots({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!order) {
      toast.error('Selecciona una orden de compra');
      return;
    }
    const items = lines
      .map((line) => {
        const lot = lots[line.id];
        return {
          orderItemId: line.id,
          quantity: Number(quantities[line.id] ?? '') || 0,
          lotNumber: line.tracksLots ? lot?.lotNumber.trim() || undefined : undefined,
          expiryDate: line.tracksLots ? lot?.expiryDate || undefined : undefined,
        };
      })
      .filter((item) => item.quantity > 0);
    const over = items.find((item) => item.quantity > (lines.find((l) => l.id === item.orderItemId)?.pending ?? 0));
    if (over) {
      toast.error('Una línea supera lo que falta recibir de la orden');
      return;
    }
    const parsed = goodsReceiptCreateSchema.safeParse({ orderId: order.id, warehouseId, notes: notes.trim() || undefined, items });
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error.issues));
      return;
    }
    setSaving(true);
    try {
      const saved = await enqueue(
        buildContingencyOperation({ companyId, userId, kind: 'GOODS_RECEIPT', payload: parsed.data, label: receiptLabel(order.folio, order.supplierName) })
      );
      if (saved) {
        setQuantities({});
        setLots({});
        setNotes('');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="offline-receipt-order">Orden de compra</Label>
          <select id="offline-receipt-order" value={orderId} onChange={(e) => chooseOrder(e.target.value)} className={nativeSelectClass}>
            <option value="">Selecciona una orden</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                OC #{o.folio} · {o.supplierName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="offline-receipt-warehouse">Bodega de recepción</Label>
          <WarehouseSelect id="offline-receipt-warehouse" warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} />
        </div>
      </div>

      {orders.length === 0 && <p className="text-sm text-muted-foreground">No hay órdenes de compra por recibir en los datos guardados.</p>}

      {order && (
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
              <div>
                <p className="text-sm font-medium text-foreground">{line.description}</p>
                <p className="text-xs text-muted-foreground">Falta recibir {quantityFormat.format(line.pending)}</p>
              </div>
              <div>
                <Label htmlFor={`offline-receipt-qty-${line.id}`}>Recibido</Label>
                <Input
                  id={`offline-receipt-qty-${line.id}`}
                  type="number"
                  min={0}
                  max={line.pending}
                  step="any"
                  inputMode="decimal"
                  disabled={line.pending <= 0}
                  value={quantities[line.id] ?? ''}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
                />
              </div>
              {line.tracksLots && (
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`offline-receipt-lot-${line.id}`}>Lote</Label>
                    <Input
                      id={`offline-receipt-lot-${line.id}`}
                      maxLength={40}
                      value={lots[line.id]?.lotNumber ?? ''}
                      onChange={(e) => setLots((prev) => ({ ...prev, [line.id]: { lotNumber: e.target.value, expiryDate: prev[line.id]?.expiryDate ?? '' } }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`offline-receipt-expiry-${line.id}`}>Vencimiento</Label>
                    <Input
                      id={`offline-receipt-expiry-${line.id}`}
                      type="date"
                      value={lots[line.id]?.expiryDate ?? ''}
                      onChange={(e) => setLots((prev) => ({ ...prev, [line.id]: { lotNumber: prev[line.id]?.lotNumber ?? '', expiryDate: e.target.value } }))}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuantities(Object.fromEntries(lines.filter((l) => l.pending > 0).map((l) => [l.id, String(l.pending)])))}
          >
            Recibir todo lo pendiente
          </Button>
        </div>
      )}

      <div>
        <Label htmlFor="offline-receipt-notes">Notas (opcional)</Label>
        <textarea id="offline-receipt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} />
      </div>

      <Button type="submit" disabled={saving || !order}>
        {saving ? 'Guardando…' : 'Registrar recepción'}
      </Button>
    </form>
  );
}
