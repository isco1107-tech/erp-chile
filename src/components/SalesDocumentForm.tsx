'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact, Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ContactForm from './ContactForm';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { findProductByCodeAction, listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import { createSalesDocumentAction, getContactCreditStatusAction, type ContactCreditStatus } from '@/modules/sales/actions/sales.actions';
import { computeDocument, exceedsCreditLimit } from '@/modules/sales/calc';
import {
  DTE_TYPES,
  DTE_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  salesDocumentCreateSchema,
} from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { TAX_GLOSSARY } from '@/lib/chile/glossary';

import { useConfirm } from '@/components/ui/confirm-provider';
import { createIdempotencyTracker } from '@/lib/idempotency';
import { isExemptDocument } from '@/lib/chile/dte/codes';
import Link from 'next/link';
import { getOrderDocumentPrefillAction, type OrderDocumentPrefill } from '@/modules/sales/actions/sales-orders.actions';
import { getContactPricingAction } from '@/modules/sales/actions/price-lists.actions';
import { listSellersAction } from '@/modules/sales/actions/commissions.actions';
import type { ContactPricing } from '@/modules/sales/services/price-lists.service';
import { resolveUnitPrice } from '@/modules/sales/pricing';
import { ORDER_DOCUMENT_TYPES } from '@/modules/sales/orders';
let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

interface LineItemDraft {
  key: string;
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  isExempt: boolean;
  discountPercent: string;
  /** Línea de la nota de venta que se factura o despacha. */
  salesOrderItemId?: string;
  /** Tope de la línea según la nota (lo que queda por facturar o despachar). */
  maxQuantity?: number;
  /** El precio lo propuso la lista del cliente (se recalcula al cambiar la cantidad). */
  priceAuto?: boolean;
}

const REFERENCE_DTE_TYPES = new Set(['NOTA_CREDITO_61', 'NOTA_DEBITO_56', 'GUIA_DESPACHO_52']);

/** Cantidad que se propone desde la nota según el tipo de documento. */
function orderQuantityFor(line: OrderDocumentPrefill['lines'][number], dteType: (typeof DTE_TYPES)[number]): number {
  return dteType === 'GUIA_DESPACHO_52' ? line.remainingToDispatch : line.remainingToInvoice;
}

export default function SalesDocumentForm({ orderId, initialType }: { orderId?: string; initialType?: (typeof DTE_TYPES)[number] } = {}) {
  const confirm = useConfirm();
  const router = useRouter();
  const idempotency = useRef(createIdempotencyTracker());

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [dteType, setDteType] = useState<(typeof DTE_TYPES)[number]>('BOLETA_39');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('EFECTIVO');
  const [dueDate, setDueDate] = useState('');
  const [referenceFolio, setReferenceFolio] = useState('');
  const [referenceType, setReferenceType] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([]);

  const [contactQuery, setContactQuery] = useState('');
  const [showQuickContact, setShowQuickContact] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [creditStatus, setCreditStatus] = useState<ContactCreditStatus | null>(null);
  const [orderPrefill, setOrderPrefill] = useState<OrderDocumentPrefill | null>(null);
  const [pricing, setPricing] = useState<ContactPricing | null>(null);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [sellerId, setSellerId] = useState('self');

  useEffect(() => {
    listSellersAction().then((r) => { if (r.success) setSellers(r.data); });
    listContactsAction().then((r) => { if (r.success) setContacts(r.data); });
    listProductsAction().then((r) => { if (r.success) setProducts(r.data); });
    listWarehousesAction().then((r) => {
      if (r.success) {
        setWarehouses(r.data);
        const defaultWarehouse = r.data.find((w) => w.isDefault) ?? r.data[0];
        if (defaultWarehouse) setWarehouseId(defaultWarehouse.id);
      }
    });
  }, []);

  // Emisión desde una nota de venta: cliente, bodega, forma de pago, vendedor
  // y líneas con lo que queda pendiente. Las cantidades se pueden bajar
  // (despacho parcial), nunca subir sobre el saldo de la nota.
  useEffect(() => {
    if (!orderId) return;
    getOrderDocumentPrefillAction(orderId).then((r) => {
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      const prefill = r.data;
      const type = initialType && ORDER_DOCUMENT_TYPES.includes(initialType) ? initialType : 'FACTURA_33';
      setOrderPrefill(prefill);
      setDteType(type);
      setWarehouseId(prefill.warehouseId);
      setPaymentMethod(prefill.paymentMethod as (typeof PAYMENT_METHODS)[number]);
      if (prefill.sellerId) setSellerId(prefill.sellerId);
      setItems(
        prefill.lines
          .filter((line) => orderQuantityFor(line, type) > 0)
          .map((line) => ({
            key: newKey(),
            productId: line.productId ?? undefined,
            sku: line.sku ?? undefined,
            description: line.description,
            quantity: String(orderQuantityFor(line, type)),
            unitPrice: String(line.unitPrice),
            isExempt: line.isExempt,
            discountPercent: String(line.discountPercent),
            salesOrderItemId: line.salesOrderItemId,
            maxQuantity: orderQuantityFor(line, type),
          }))
      );
    });
  }, [orderId, initialType]);

  // El cliente de la nota se selecciona cuando llega la lista de contactos.
  useEffect(() => {
    if (!orderPrefill || selectedContact) return;
    const contact = contacts.find((c) => c.id === orderPrefill.contactId);
    if (contact) setSelectedContact(contact);
  }, [orderPrefill, contacts, selectedContact]);

  // Lista de precios del cliente: propone el precio de cada producto nuevo.
  useEffect(() => {
    if (!selectedContact) {
      setPricing(null);
      return;
    }
    let cancelled = false;
    getContactPricingAction(selectedContact.id).then((r) => {
      if (!cancelled && r.success) setPricing(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedContact]);

  // Al cambiar de tipo dentro de una nota, se re-propone el saldo que corresponde.
  function changeDteType(type: (typeof DTE_TYPES)[number]) {
    setDteType(type);
    if (!orderPrefill) return;
    setItems((prev) =>
      prev.map((item) => {
        const line = orderPrefill.lines.find((candidate) => candidate.salesOrderItemId === item.salesOrderItemId);
        if (!line) return item;
        const max = orderQuantityFor(line, type);
        return { ...item, quantity: String(max), maxQuantity: max };
      })
    );
  }

  useEffect(() => {
    if (!selectedContact) {
      setCreditStatus(null);
      return;
    }
    let cancelled = false;
    getContactCreditStatusAction(selectedContact.id).then((r) => {
      if (!cancelled && r.success) setCreditStatus(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedContact]);

  // Sugiere el vencimiento a partir de los días de crédito pactados con el
  // cliente — solo si el campo sigue vacío, para no pisar una fecha que la
  // persona ya haya elegido a mano.
  useEffect(() => {
    if (paymentMethod !== 'CREDITO_30' || !selectedContact || selectedContact.creditDays <= 0 || dueDate) return;
    const suggested = new Date();
    suggested.setDate(suggested.getDate() + selectedContact.creditDays);
    setDueDate(suggested.toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, selectedContact]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)).slice(0, 8);
  }, [contactQuery, contacts]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q).slice(0, 8);
  }, [productQuery, products]);

  // Mismo cálculo que el servidor: el IVA se redondea una vez sobre el neto
  // agregado y se reparte entre líneas, para que el total mostrado en pantalla
  // coincida exactamente con el que se persiste.
  const { items: computedItems, totals: documentTotals } = computeDocument(
    items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice) || 0,
      quantity: Number(item.quantity) || 0,
      discountPercent: Number(item.discountPercent) || 0,
      isExempt: item.isExempt,
    }))
  );

  function updateItem<K extends keyof LineItemDraft>(key: string, field: K, value: LineItemDraft[K]) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        const next = { ...i, [field]: value };
        if (field === 'unitPrice') next.priceAuto = false;
        // Precio por volumen: si el precio lo puso la lista, se recalcula con la cantidad.
        if (field === 'quantity' && i.priceAuto && i.productId && pricing?.tiers[i.productId]) {
          const product = products.find((p) => p.id === i.productId);
          next.unitPrice = String(resolveUnitPrice(product?.netPrice ?? Number(i.unitPrice), pricing.tiers[i.productId], Number(value) || 0));
        }
        return next;
      })
    );
  }

  const listTiers = (productId: string) => pricing?.tiers[productId] ?? [];

  /**
   * Lector de código de barras: escribe el código y envía Enter. Se resuelve
   * contra el código del producto, el de un empaque (agrega sus unidades) o
   * el SKU exacto; si no hay coincidencia exacta, toma el primer resultado.
   */
  async function handleProductSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = productQuery.trim();
    if (!code) return;
    const result = await findProductByCodeAction(code);
    if (result.success && result.data) {
      const { product, factor, packagingName } = result.data;
      addProductLine(product, factor);
      if (packagingName) toast.success(`${packagingName}: ${factor} × ${product.name}`);
      return;
    }
    if (filteredProducts[0]) addProductLine(filteredProducts[0]);
    else toast.error(`Sin resultados para "${code}"`);
  }

  function addProductLine(product: Pick<ProductWithStock, 'id' | 'sku' | 'name' | 'netPrice' | 'isExempt'>, units = 1) {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: String(units),
        unitPrice: String(resolveUnitPrice(product.netPrice, listTiers(product.id), units)),
        priceAuto: listTiers(product.id).length > 0,
        // La exención la fija el catálogo (el servidor la vuelve a leer de ahí):
        // la previsualización tiene que mostrar el mismo IVA que se va a guardar.
        isExempt: product.isExempt,
        discountPercent: '0',
      },
    ]);
    setProductQuery('');
  }

  function addFreeLine() {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        description: '',
        quantity: '1',
        unitPrice: '0',
        isExempt: isExemptDocument(dteType),
        discountPercent: '0',
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function buildPayload() {
    return {
      contactId: selectedContact?.id ?? '',
      warehouseId,
      dteType,
      paymentMethod,
      dueDate: dueDate || undefined,
      referenceFolio: referenceFolio ? Number(referenceFolio) : undefined,
      referenceType: referenceType ? (referenceType as (typeof DTE_TYPES)[number]) : undefined,
      notes: notes || undefined,
      salesOrderId: orderPrefill?.orderId,
      sellerId: sellerId !== 'self' ? sellerId : undefined,
      items: items.map((i) => ({
        salesOrderItemId: i.salesOrderItemId,
        productId: i.productId,
        sku: i.sku,
        description: i.description,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        isExempt: i.isExempt,
        discountPercent: Number(i.discountPercent) || 0,
      })),
    };
  }

  async function handleSave(status: 'DRAFT' | 'ISSUED') {
    const payload = buildPayload();
    const parsed = salesDocumentCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    if (status === 'ISSUED') {
      const confirmed = await confirm(
        'Se asignará un folio correlativo y se descontará el stock de la bodega seleccionada. Esta acción no se puede deshacer (solo anular). ¿Continuar?'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      // Misma clave mientras el documento no cambie: si se pierde la
      // respuesta y el usuario reintenta, recibe el documento ya creado en vez
      // de emitir otro folio y descontar stock dos veces.
      const idempotencyKey = idempotency.current.keyFor({ status, ...parsed.data });
      const result = await createSalesDocumentAction({ ...parsed.data, idempotencyKey }, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      idempotency.current.reset();
      toast.success(result.message ?? 'Documento guardado');
      router.push(`/dashboard/sales/${result.data.id}`);
    } catch {
      toast.error('No se pudo contactar al servidor. Tus datos siguen aquí: vuelve a intentarlo y el documento no se duplicará.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {orderPrefill && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm">
          <span>
            Emitiendo desde la <span className="font-semibold">nota de venta #{orderPrefill.folio}</span>. Las cantidades proponen el saldo pendiente;
            puedes bajarlas para un despacho o facturación parcial.
          </span>
          <Link href={`/dashboard/sales/orders/${orderPrefill.orderId}`} className="text-xs font-medium underline underline-offset-2">
            Ver nota
          </Link>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="dteType">
            Tipo de Documento
            <InfoTooltip text={TAX_GLOSSARY.dte} />
          </Label>
          <Select items={DTE_TYPE_LABELS} value={dteType} onValueChange={(value) => changeDteType(value as (typeof DTE_TYPES)[number])}>
            <SelectTrigger id="dteType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(orderPrefill ? ORDER_DOCUMENT_TYPES : DTE_TYPES).map((t) => (
                <SelectItem key={t} value={t}>{DTE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="warehouse">Bodega de salida</Label>
          <Select
            items={Object.fromEntries(warehouses.map((w) => [w.id, w.name]))}
            value={warehouseId}
            onValueChange={(value) => setWarehouseId(value as string)}
          >
            <SelectTrigger id="warehouse">
              <SelectValue placeholder="Seleccione bodega" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="paymentMethod">Forma de pago</Label>
          <Select items={PAYMENT_METHOD_LABELS} value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as (typeof PAYMENT_METHODS)[number])}>
            <SelectTrigger id="paymentMethod">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((p) => (
                <SelectItem key={p} value={p}>{PAYMENT_METHOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Cliente</Label>
          {selectedContact ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
                {!orderPrefill && (
                  <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedContact(null)}>Cambiar</Button>
                )}
              </div>
              {paymentMethod === 'CREDITO_30' && dteType !== 'NOTA_CREDITO_61' && creditStatus?.available != null && (() => {
                const wouldExceed = exceedsCreditLimit({
                  creditLimit: creditStatus.creditLimit,
                  outstandingBalance: creditStatus.outstandingBalance,
                  documentTotal: documentTotals.totalAmount,
                });
                return (
                  <p className={`text-xs ${wouldExceed ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Crédito disponible: {formatCurrency(creditStatus.available)}
                    {' '}(deuda vigente {formatCurrency(creditStatus.outstandingBalance)} de {formatCurrency(creditStatus.creditLimit ?? 0)})
                    {wouldExceed && ' — esta venta supera el límite'}
                  </p>
                );
              })()}
              {pricing?.priceListName && (
                <p className="text-xs text-muted-foreground">
                  Precios según la lista <span className="font-medium text-foreground">{pricing.priceListName}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar cliente por RUT o Razón Social"
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
                {showQuickContact ? 'Cerrar' : '+ Crear Cliente Rápido'}
              </Button>
              {showQuickContact && (
                <ContactForm
                  editingContact={null}
                  onSaved={(contact) => {
                    setContacts((prev) => [contact, ...prev]);
                    setSelectedContact(contact);
                    setShowQuickContact(false);
                    toast.success('Cliente creado y seleccionado');
                  }}
                  onCancelEdit={() => setShowQuickContact(false)}
                />
              )}
            </div>
          )}
        </div>

        {REFERENCE_DTE_TYPES.has(dteType) && (
          <>
            <div>
              <Label htmlFor="referenceFolio">Folio de referencia</Label>
              <Input id="referenceFolio" type="number" min={0} value={referenceFolio} onChange={(e) => setReferenceFolio(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="referenceType">Tipo de documento referenciado</Label>
              <Select items={DTE_TYPE_LABELS} value={referenceType} onValueChange={(value) => setReferenceType(value as string)}>
                <SelectTrigger id="referenceType">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {DTE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{DTE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {sellers.length > 1 && (
          <div>
            <Label htmlFor="seller">Vendedor</Label>
            <Select
              items={{ self: 'Quien emite', ...Object.fromEntries(sellers.map((s) => [s.id, s.name])) }}
              value={sellerId}
              onValueChange={(value) => setSellerId(value as string)}
            >
              <SelectTrigger id="seller">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Quien emite</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="dueDate">Vencimiento (opcional)</Label>
          <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Input
              placeholder="Escanea el código de barras o busca por SKU o nombre"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={handleProductSearchKey}
              autoComplete="off"
            />
            {filteredProducts.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card text-sm shadow-md">
                {filteredProducts.map((p) => (
                  <li
                    key={p.id}
                    className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                    onClick={() => addProductLine(p)}
                  >
                    {p.sku} — {p.name} (Stock: {p.totalStock}, {formatCurrency(p.netPrice)})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="button" variant="outline" onClick={addFreeLine}>+ Agregar línea libre</Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">SKU</th>
                <th className="p-2 font-medium">Descripción</th>
                <th className="p-2 font-medium">Cantidad</th>
                <th className="p-2 font-medium">Precio Unit.</th>
                <th className="p-2 font-medium">% Desc.</th>
                <th className="p-2 font-medium">Exento</th>
                <th className="p-2 font-medium">Subtotal</th>
                <th className="p-2 font-medium">IVA</th>
                <th className="p-2 font-medium">Total</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {computedItems.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={10}>Sin ítems agregados</td>
                </tr>
              )}
              {computedItems.map((item) => (
                <tr key={item.key} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{item.sku ?? '—'}</td>
                  <td className="p-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                      className="h-7 min-w-[160px]"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      max={item.maxQuantity}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                      className="h-7 w-20"
                      aria-describedby={item.maxQuantity !== undefined ? `${item.key}-max` : undefined}
                    />
                    {item.maxQuantity !== undefined && (
                      <p id={`${item.key}-max`} className="mt-0.5 text-[11px] text-muted-foreground">
                        Saldo: {item.maxQuantity}
                      </p>
                    )}
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.key, 'unitPrice', e.target.value)}
                      className="h-7 w-24"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={item.discountPercent}
                      onChange={(e) => updateItem(item.key, 'discountPercent', e.target.value)}
                      className="h-7 w-16"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.isExempt}
                      disabled={Boolean(item.productId)}
                      title={item.productId ? 'Definido en el catálogo del producto' : 'Marca si esta línea libre está exenta de IVA'}
                      aria-label={item.productId ? 'Exento (definido en el catálogo)' : 'Línea exenta de IVA'}
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
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={() => handleSave('DRAFT')}>
          {saving ? 'Guardando...' : 'Guardar Borrador'}
        </Button>
        <Button type="button" disabled={saving} onClick={() => handleSave('ISSUED')}>
          {saving ? 'Emitiendo...' : 'Emitir Documento (Descontar Stock y Asignar Folio)'}
        </Button>
      </div>
    </div>
  );
}
