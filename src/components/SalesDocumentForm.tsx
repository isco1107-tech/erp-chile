'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
}

const REFERENCE_DTE_TYPES = new Set(['NOTA_CREDITO_61', 'NOTA_DEBITO_56', 'GUIA_DESPACHO_52']);

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

export default function SalesDocumentForm() {
  const router = useRouter();

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

  useEffect(() => {
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
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
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
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  function addProductLine(product: ProductWithStock) {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: '1',
        unitPrice: String(product.netPrice),
        isExempt: dteType === 'FACTURA_EXENTA_34',
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
        isExempt: dteType === 'FACTURA_EXENTA_34',
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
      items: items.map((i) => ({
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
      const confirmed = confirm(
        'Se asignará un folio correlativo y se descontará el stock de la bodega seleccionada. Esta acción no se puede deshacer (solo anular). ¿Continuar?'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const result = await createSalesDocumentAction(parsed.data, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Documento guardado');
      router.push(`/dashboard/sales/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="dteType">
            Tipo de Documento
            <InfoTooltip text={TAX_GLOSSARY.dte} />
          </Label>
          <select id="dteType" value={dteType} onChange={(e) => setDteType(e.target.value as (typeof DTE_TYPES)[number])} className={selectClass}>
            {DTE_TYPES.map((t) => (
              <option key={t} value={t}>{DTE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="warehouse">Bodega de salida</Label>
          <select id="warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={selectClass}>
            <option value="">Seleccione bodega</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="paymentMethod">Forma de pago</Label>
          <select id="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])} className={selectClass}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>{PAYMENT_METHOD_LABELS[p]}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Cliente</Label>
          {selectedContact ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedContact(null)}>Cambiar</Button>
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
              <select id="referenceType" value={referenceType} onChange={(e) => setReferenceType(e.target.value)} className={selectClass}>
                <option value="">Seleccione</option>
                {DTE_TYPES.map((t) => (
                  <option key={t} value={t}>{DTE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </>
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
              placeholder="Buscar producto por SKU o Nombre"
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
