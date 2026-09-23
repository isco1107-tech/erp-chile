'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Contact, Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ContactForm from './ContactForm';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import {
  createPurchaseDocumentAction,
  getPurchaseApprovalThresholdAction,
  updatePurchaseDocumentAction,
} from '@/modules/purchases/actions/purchases.actions';
import type { PurchaseDocumentWithRelations } from '@/modules/purchases/services/purchases.service';
import { getPurchaseOrderAction } from '@/modules/purchases/actions/purchase-order.actions';
import { computeDocument } from '@/modules/sales/calc';
import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PURCHASE_STOCK_DIRECTION,
  purchaseDocumentCreateSchema,
} from '@/modules/purchases/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';

import { useConfirm } from '@/components/ui/confirm-provider';
let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `purchase-item-${keyCounter}`;
}

interface LineItemDraft {
  key: string;
  // Sin productId la línea es puro gasto (servicio, flete, seguro): no entra a
  // inventario ni recalcula PMP.
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unitCost: string;
  isExempt: boolean;
  purchaseOrderItemId?: string;
}

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface Props {
  /** Presente solo en /dashboard/purchases/[id]/edit: precarga el borrador y guarda edición en vez de crear uno nuevo. */
  editingDocument?: PurchaseDocumentWithRelations;
}

export default function PurchaseDocumentForm({ editingDocument }: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchaseOrderId = searchParams.get('purchaseOrderId') || editingDocument?.purchaseOrderId || undefined;
  const [linkedOrderFolio, setLinkedOrderFolio] = useState<number | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [documentType, setDocumentType] = useState<(typeof PURCHASE_DOCUMENT_TYPES)[number]>(
    editingDocument?.documentType ?? 'FACTURA'
  );
  const [selectedContact, setSelectedContact] = useState<Contact | null>(editingDocument?.contact ?? null);
  const [warehouseId, setWarehouseId] = useState(() => editingDocument?.items.find((i) => i.warehouseId)?.warehouseId ?? '');
  const [folio, setFolio] = useState(editingDocument?.folio ?? '');
  const [referenceFolio, setReferenceFolio] = useState(editingDocument?.referenceFolio ?? '');
  const [issueDate, setIssueDate] = useState(() =>
    editingDocument ? new Date(editingDocument.issueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(() => (editingDocument?.dueDate ? new Date(editingDocument.dueDate).toISOString().slice(0, 10) : ''));
  const [paymentMethod, setPaymentMethod] = useState(editingDocument?.paymentMethod ?? '');
  const [notes, setNotes] = useState(editingDocument?.notes ?? '');
  const [items, setItems] = useState<LineItemDraft[]>(() =>
    (editingDocument?.items ?? []).map((item) => ({
      key: newKey(),
      productId: item.productId ?? undefined,
      description: item.description,
      quantity: String(item.quantity),
      unitCost: String(item.unitCost),
      isExempt: item.isExempt,
    }))
  );

  const [contactQuery, setContactQuery] = useState('');
  const [showQuickContact, setShowQuickContact] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [approvalThreshold, setApprovalThreshold] = useState<number | null>(null);

  useEffect(() => {
    listContactsAction().then((r) => {
      if (r.success) setContacts(r.data);
    });
    listProductsAction().then((r) => {
      if (r.success) setProducts(r.data);
    });
    listWarehousesAction().then((r) => {
      if (r.success) {
        setWarehouses(r.data);
        // Al editar, la bodega ya viene precargada desde el borrador — no
        // pisarla con la bodega por defecto de la empresa.
        if (!editingDocument) {
          const defaultWarehouse = r.data.find((w) => w.isDefault) ?? r.data[0];
          if (defaultWarehouse) setWarehouseId(defaultWarehouse.id);
        }
      }
    });
    getPurchaseApprovalThresholdAction().then((r) => {
      if (r.success) setApprovalThreshold(r.data);
    });
  }, []);

  // Al editar, los ítems precargados desde el borrador no traen SKU (no se
  // persiste en `PurchaseDocumentItem`, solo la descripción) — se completa acá
  // apenas carga el catálogo, solo para mostrarlo junto al producto.
  useEffect(() => {
    if (products.length === 0) return;
    setItems((prev) =>
      prev.map((item) =>
        item.productId && !item.sku ? { ...item, sku: products.find((p) => p.id === item.productId)?.sku } : item
      )
    );
  }, [products]);

  // Factura que formaliza una Orden de Compra ya recibida: precarga
  // proveedor e ítems desde lo recibido-y-no-facturado, y ya no pide bodega
  // (el stock se movió al confirmar la recepción, no acá). Al editar un
  // borrador ya existente, sus ítems y proveedor ya vienen precargados desde
  // el propio documento — recalcularlos desde el estado ACTUAL de la OC
  // pisaría lo que el borrador realmente tiene guardado.
  useEffect(() => {
    if (!purchaseOrderId || editingDocument) return;
    getPurchaseOrderAction(purchaseOrderId).then((r) => {
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setLinkedOrderFolio(r.data.folio);
      setSelectedContact(r.data.contact);
      setItems(
        r.data.items
          .filter((item) => item.receivedQuantity - item.invoicedQuantity > 0.0001)
          .map((item) => ({
            key: newKey(),
            productId: item.productId ?? undefined,
            description: item.description,
            quantity: String(item.receivedQuantity - item.invoicedQuantity),
            unitCost: String(item.unitCost),
            isExempt: false,
            purchaseOrderItemId: item.id,
          }))
      );
    });
  }, [purchaseOrderId]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter((c) => c.isSupplier && (c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [contactQuery, contacts]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [productQuery, products]);

  const hasProductLines = items.some((i) => i.productId);
  // Una Factura recibe mercadería, una Nota de Crédito la devuelve y una Nota
  // de Débito solo corrige precio. El servicio impone lo mismo.
  const stockDirection = PURCHASE_STOCK_DIRECTION[documentType];

  const { items: computedItems, totals: documentTotals } = computeDocument(
    items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitCost) || 0,
      quantity: Number(item.quantity) || 0,
      isExempt: item.isExempt,
    }))
  );

  function updateItem<K extends keyof LineItemDraft>(key: string, field: K, value: LineItemDraft[K]) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  /** Línea de inventario: entra a stock y recalcula el PMP al registrar. */
  function addProductLine(product: ProductWithStock) {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: '1',
        // El PMP vigente es solo una sugerencia: el costo real lo fija la
        // factura del proveedor y el usuario lo corrige aquí.
        unitCost: String(product.costPricePMP),
        isExempt: false,
      },
    ]);
    setProductQuery('');
  }

  /** Línea de gasto: servicios, fletes o cargos que no son inventario. */
  function addLine() {
    setItems((prev) => [...prev, { key: newKey(), description: '', quantity: '1', unitCost: '0', isExempt: false }]);
  }

  function unlinkProduct(key: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, productId: undefined, sku: undefined } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function buildPayload() {
    return {
      contactId: selectedContact?.id ?? '',
      warehouseId: warehouseId || undefined,
      documentType,
      folio,
      referenceFolio: documentType === 'NOTA_CREDITO' ? referenceFolio || undefined : undefined,
      issueDate,
      dueDate: dueDate || undefined,
      paymentMethod: paymentMethod || undefined,
      notes: notes || undefined,
      purchaseOrderId,
      items: items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: Number(i.quantity) || 0,
        unitCost: Number(i.unitCost) || 0,
        isExempt: i.isExempt,
        purchaseOrderItemId: i.purchaseOrderItemId,
      })),
    };
  }

  async function handleSave(status: 'DRAFT' | 'ISSUED') {
    const payload = buildPayload();
    const parsed = purchaseDocumentCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    // El backend también valida todo esto, pero avisar acá evita perder el
    // documento completo por un select vacío o un tipo mal elegido.
    if (stockDirection === 'NONE' && hasProductLines) {
      toast.error(
        `Una ${PURCHASE_DOCUMENT_TYPE_LABELS[documentType]} no mueve inventario: desvincule los productos de las líneas`
      );
      return;
    }

    if (hasProductLines && !warehouseId && !purchaseOrderId) {
      toast.error('Seleccione la bodega para las líneas con producto');
      return;
    }

    if (status === 'ISSUED' && hasProductLines) {
      const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? 'la bodega seleccionada';
      const confirmed = await confirm(
        stockDirection === 'IN'
          ? `Se dará entrada al stock en ${warehouseName} y se recalculará el costo PMP de los productos incluidos. ¿Continuar?`
          : `Se descontará el stock de ${warehouseName} al PMP vigente por devolución al proveedor. ¿Continuar?`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const result = editingDocument
        ? await updatePurchaseDocumentAction(editingDocument.id, parsed.data)
        : await createPurchaseDocumentAction(parsed.data, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Documento guardado');
      router.push(`/dashboard/purchases/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {linkedOrderFolio != null && (
        <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-600">
          Formalizando la Orden de Compra #{linkedOrderFolio}. Los ítems recibidos se precargaron; no se moverá stock de nuevo.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="documentType">Tipo de Documento</Label>
          <select
            id="documentType"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as (typeof PURCHASE_DOCUMENT_TYPES)[number])}
            className={selectClass}
          >
            {PURCHASE_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>{PURCHASE_DOCUMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="folio" className="inline-flex items-center gap-1.5">
            Folio del Proveedor
            <InfoTooltip text={TAX_GLOSSARY.folio} />
          </Label>
          <Input id="folio" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="N° de factura/boleta" />
        </div>

        {documentType === 'NOTA_CREDITO' && (
          <div>
            <Label htmlFor="referenceFolio">Folio que corrige</Label>
            <Input
              id="referenceFolio"
              value={referenceFolio}
              onChange={(e) => setReferenceFolio(e.target.value)}
              placeholder="Folio de la factura/boleta original"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Del mismo proveedor. Se usa para validar la devolución y aplicar el crédito contra esa compra.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="issueDate">Fecha de Emisión</Label>
          <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>

        {stockDirection !== 'NONE' && (
          <div>
            <Label htmlFor="warehouse">
              {stockDirection === 'IN' ? 'Bodega de recepción' : 'Bodega de salida'}
            </Label>
            <select id="warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={selectClass}>
              <option value="">Sin movimiento de mercadería</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {!hasProductLines
                ? 'Solo se usa si agrega líneas enlazadas a un producto.'
                : stockDirection === 'IN'
                  ? 'Las líneas con producto entrarán a esta bodega y recalcularán el PMP.'
                  : 'Las líneas con producto saldrán de esta bodega al PMP vigente (devolución).'}
            </p>
          </div>
        )}

        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Proveedor</Label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
              <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedContact(null)}>Cambiar</Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar proveedor por RUT o Razón Social"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
              {filteredContacts.length > 0 && (
                <ul className="rounded-lg border border-border text-sm">
                  {filteredContacts.map((c) => (
                    <li
                      key={c.id}
                      className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                      onClick={() => { setSelectedContact(c); setContactQuery(''); }}
                    >
                      {c.rut} — {c.razonSocial}
                    </li>
                  ))}
                </ul>
              )}
              <Button type="button" size="xs" variant="outline" onClick={() => setShowQuickContact((s) => !s)}>
                {showQuickContact ? 'Cerrar' : '+ Crear Proveedor Rápido'}
              </Button>
              {showQuickContact && (
                <ContactForm
                  editingContact={null}
                  onSaved={(contact) => {
                    setContacts((prev) => [contact, ...prev]);
                    setSelectedContact(contact);
                    setShowQuickContact(false);
                    toast.success('Proveedor creado y seleccionado');
                  }}
                  onCancelEdit={() => setShowQuickContact(false)}
                />
              )}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="dueDate">Vencimiento (opcional)</Label>
          <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="paymentMethod">Forma de pago pactada (opcional)</Label>
          <Input id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Ej: Crédito 30 días" />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ítems del documento</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stockDirection !== 'NONE' && (
            <div className="relative min-w-[240px] flex-1">
              <Input
                placeholder={
                  stockDirection === 'IN'
                    ? 'Buscar producto por SKU o Nombre (entra a stock)'
                    : 'Buscar producto por SKU o Nombre (sale de stock)'
                }
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
              {filteredProducts.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card text-sm shadow-md">
                  {filteredProducts.map((p) => (
                    <li
                      key={p.id}
                      className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                      onClick={() => addProductLine(p)}
                    >
                      {p.sku} — {p.name} (Stock: {p.totalStock}, PMP: {formatCurrency(p.costPricePMP)})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Button type="button" variant="outline" onClick={addLine}>+ Agregar línea de gasto</Button>
        </div>

        {stockDirection === 'NONE' && hasProductLines && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Una {PURCHASE_DOCUMENT_TYPE_LABELS[documentType]} corrige montos, no cantidades. Desvincule los
            productos de las líneas o cambie el tipo de documento antes de registrar.
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Producto</th>
                <th className="p-2 font-medium">Descripción</th>
                <th className="p-2 font-medium">Cantidad</th>
                <th className="p-2 font-medium">Costo Unit.</th>
                <th className="p-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    Exento
                    <InfoTooltip text={TAX_GLOSSARY.exento} />
                  </span>
                </th>
                <th className="p-2 font-medium">Subtotal</th>
                <th className="p-2 font-medium">IVA</th>
                <th className="p-2 font-medium">Total</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {computedItems.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={9}>Sin ítems agregados</td>
                </tr>
              )}
              {computedItems.map((item) => (
                <tr key={item.key} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">
                    {item.productId ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{item.sku}</span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          title="Desvincular producto: la línea pasa a ser gasto y no mueve stock"
                          onClick={() => unlinkProduct(item.key)}
                        >
                          desvincular
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Gasto</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                      className="h-7 min-w-[200px]"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                      className="h-7 w-20"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={item.unitCost}
                      onChange={(e) => updateItem(item.key, 'unitCost', e.target.value)}
                      className="h-7 w-24"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.isExempt}
                      onChange={(e) => updateItem(item.key, 'isExempt', e.target.checked)}
                    />
                  </td>
                  <td className="p-2">{formatCurrency(item.subtotal)}</td>
                  <td className="p-2">{formatCurrency(item.iva)}</td>
                  <td className="p-2 font-medium">{formatCurrency(item.total)}</td>
                  <td className="p-2">
                    <Button type="button" size="xs" variant="destructive" onClick={() => removeItem(item.key)}>✕</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 rounded-xl border border-border p-4 text-sm sm:ml-auto sm:w-80">
        <div className="flex w-full justify-between"><span>Subtotal Neto</span><span>{formatCurrency(documentTotals.netAmount)}</span></div>
        <div className="flex w-full justify-between"><span>Monto Exento</span><span>{formatCurrency(documentTotals.exemptAmount)}</span></div>
        <div className="flex w-full justify-between"><span>IVA (19%)</span><span>{formatCurrency(documentTotals.ivaAmount)}</span></div>
        <div className="flex w-full justify-between border-t border-border pt-1 text-base font-semibold">
          <span>Total</span><span>{formatCurrency(documentTotals.totalAmount)}</span>
        </div>
        {documentType !== 'NOTA_CREDITO' && approvalThreshold != null && documentTotals.totalAmount > approvalThreshold && (
          <p className="mt-1 text-right text-xs text-amber-600">
            Supera {formatCurrency(approvalThreshold)}: quedará pendiente de aprobación al registrarla.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {editingDocument ? (
          <Button type="button" disabled={saving} onClick={() => handleSave('DRAFT')}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        ) : (
          <>
            {/* Un documento que formaliza una OC no admite guardarse como
                borrador: el matching de 3 vías necesita, por línea, a qué
                ítem de la OC corresponde, y ese dato no se persiste — solo
                existe acá, en el formulario. Guardarlo como DRAFT lo
                perdería para siempre. */}
            {!purchaseOrderId && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleSave('DRAFT')}>
                {saving ? 'Guardando...' : 'Guardar Borrador'}
              </Button>
            )}
            <Button type="button" disabled={saving} onClick={() => handleSave('ISSUED')}>
              {saving ? 'Registrando...' : 'Registrar Documento'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
