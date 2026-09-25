'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Contact, Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/EmptyState';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import { createSalesOrderAction, getQuotePrefillAction, getReservedStockAction, type QuotePrefill } from '@/modules/sales/actions/sales-orders.actions';
import { getContactPricingAction } from '@/modules/sales/actions/price-lists.actions';
import { listSellersAction } from '@/modules/sales/actions/commissions.actions';
import type { ContactPricing } from '@/modules/sales/services/price-lists.service';
import { computeDocument } from '@/modules/sales/calc';
import { resolveUnitPrice } from '@/modules/sales/pricing';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, salesOrderCreateSchema } from '@/modules/sales/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';

let keyCounter = 0;
const newKey = () => `line-${++keyCounter}`;

interface Line {
  key: string;
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  isExempt: boolean;
  priceAuto: boolean;
}

type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Nota de venta: cliente, bodega, vendedor, entrega y líneas. Los precios
 * salen de la lista del cliente (si tiene) y cada línea muestra cuánto hay
 * disponible (stock menos lo comprometido en otras notas abiertas).
 */
export default function SalesOrderForm({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [reserved, setReserved] = useState<Record<string, number>>({});
  const [pricing, setPricing] = useState<ContactPricing | null>(null);
  const [quote, setQuote] = useState<QuotePrefill | null>(null);

  const [contact, setContact] = useState<Contact | null>(null);
  const [contactQuery, setContactQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDITO_30');
  const [sellerId, setSellerId] = useState('self');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((r) => r.success && setContacts(r.data.filter((c) => c.isCustomer)));
    listProductsAction().then((r) => r.success && setProducts(r.data));
    listSellersAction().then((r) => r.success && setSellers(r.data));
    listWarehousesAction().then((r) => {
      if (!r.success) return;
      setWarehouses(r.data);
      setWarehouseId((current) => current || ((r.data.find((w) => w.isDefault) ?? r.data[0])?.id ?? ''));
    });
  }, []);

  // Desde una cotización: mismo cliente, bodega, forma de pago y líneas.
  useEffect(() => {
    if (!quoteId) return;
    getQuotePrefillAction(quoteId).then((r) => {
      if (!r.success) return void toast.error(r.error);
      setQuote(r.data);
      setWarehouseId(r.data.warehouseId);
      setPaymentMethod(r.data.paymentMethod as PaymentMethod);
      setNotes(r.data.notes ?? '');
      setLines(
        r.data.lines.map((line) => ({
          key: newKey(),
          productId: line.productId ?? undefined,
          sku: line.sku ?? undefined,
          description: line.description,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          discountPercent: String(line.discountPercent),
          isExempt: line.isExempt,
          priceAuto: false,
        }))
      );
    });
  }, [quoteId]);

  useEffect(() => {
    if (!quote || contact) return;
    const match = contacts.find((c) => c.id === quote.contactId);
    if (match) setContact(match);
  }, [quote, contacts, contact]);

  useEffect(() => {
    if (!contact) return setPricing(null);
    let cancelled = false;
    getContactPricingAction(contact.id).then((r) => !cancelled && r.success && setPricing(r.data));
    if (contact.creditDays > 0 && !deliveryDate) {
      // Sin fecha pactada, se sugiere entregar en una semana.
      const suggested = new Date(Date.now() + 7 * 86_400_000);
      setDeliveryDate(suggested.toISOString().slice(0, 10));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact]);

  const productIds = useMemo(() => [...new Set(lines.map((l) => l.productId).filter((id): id is string => Boolean(id)))], [lines]);
  useEffect(() => {
    if (productIds.length === 0) return;
    getReservedStockAction(productIds).then((r) => r.success && setReserved(r.data));
  }, [productIds]);

  const contactResults = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts
      .filter((c) => c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q) || (c.nombreFantasia ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [contactQuery, contacts]);

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [productQuery, products]);

  const tiersFor = (productId: string) => pricing?.tiers[productId] ?? [];

  function addProduct(product: ProductWithStock) {
    const tiers = tiersFor(product.id);
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: '1',
        unitPrice: String(resolveUnitPrice(product.netPrice, tiers, 1)),
        discountPercent: '0',
        isExempt: product.isExempt,
        priceAuto: tiers.length > 0,
      },
    ]);
    setProductQuery('');
  }

  function update(key: string, field: keyof Line, value: string | boolean) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, [field]: value } as Line;
        if (field === 'unitPrice') next.priceAuto = false;
        if (field === 'quantity' && line.priceAuto && line.productId) {
          const product = products.find((p) => p.id === line.productId);
          next.unitPrice = String(resolveUnitPrice(product?.netPrice ?? 0, tiersFor(line.productId), Number(value) || 0));
        }
        return next;
      })
    );
  }

  const { items: computed, totals } = computeDocument(
    lines.map((line) => ({ ...line, quantity: Number(line.quantity) || 0, unitPrice: Number(line.unitPrice) || 0, discountPercent: Number(line.discountPercent) || 0 }))
  );

  function availability(line: { productId?: string; quantity: number | string }): { available: number; short: boolean } | null {
    if (!line.productId) return null;
    const product = products.find((p) => p.id === line.productId);
    if (!product || !product.isTrackable) return null;
    const available = product.totalStock - (reserved[line.productId] ?? 0);
    return { available, short: (Number(line.quantity) || 0) > available };
  }

  async function save() {
    const payload = {
      contactId: contact?.id ?? '',
      warehouseId,
      paymentMethod,
      deliveryDate: deliveryDate || undefined,
      notes: notes.trim() || undefined,
      sellerId: sellerId !== 'self' ? sellerId : undefined,
      quoteId: quote?.quoteId,
      items: lines.map((line) => ({
        productId: line.productId,
        sku: line.sku,
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        discountPercent: Number(line.discountPercent) || 0,
        isExempt: line.isExempt,
      })),
    };
    const parsed = salesOrderCreateSchema.safeParse(payload);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Revisa los datos');
    setSaving(true);
    try {
      const result = await createSalesOrderAction(parsed.data);
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Nota de venta creada');
      router.push(`/dashboard/sales/orders/${result.data.id}`);
    } catch {
      toast.error('No se pudo contactar al servidor. Tus datos siguen aquí: vuelve a intentarlo.');
    } finally {
      setSaving(false);
    }
  }

  const shortLines = lines.filter((line) => availability(line)?.short).length;

  return (
    <div className="space-y-5">
      {quote && (
        <p className="rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm">
          Convirtiendo la <span className="font-semibold">cotización #{quote.folio ?? '—'}</span> en nota de venta. Revisa cantidades y precios antes de guardar.
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-card sm:grid-cols-2 lg:grid-cols-4" aria-label="Datos de la nota">
        <div className="sm:col-span-2">
          <Label>Cliente</Label>
          {contact ? (
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-input px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{contact.nombreFantasia ?? contact.razonSocial}</span>
                <span className="text-muted-foreground"> · {contact.rut}</span>
              </span>
              {!quote && (
                <Button type="button" size="xs" variant="ghost" onClick={() => setContact(null)}>
                  Cambiar
                </Button>
              )}
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" placeholder="Buscar por RUT, razón social o nombre" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} autoFocus />
              {contactResults.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card text-sm shadow-popover">
                  {contactResults.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setContact(c); setContactQuery(''); }}>
                        {c.nombreFantasia ?? c.razonSocial} <span className="text-muted-foreground">· {c.rut}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {pricing?.priceListName && (
            <p className="mt-1 text-xs text-muted-foreground">
              Precios de la lista <span className="font-medium text-foreground">{pricing.priceListName}</span>
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="order-warehouse">Bodega de despacho</Label>
          <Select items={Object.fromEntries(warehouses.map((w) => [w.id, w.name]))} value={warehouseId} onValueChange={(v) => setWarehouseId(v as string)}>
            <SelectTrigger id="order-warehouse" className="mt-1.5">
              <SelectValue placeholder="Selecciona bodega" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="order-payment">Forma de pago</Label>
          <Select items={PAYMENT_METHOD_LABELS} value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
            <SelectTrigger id="order-payment" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="order-delivery">Fecha de entrega</Label>
          <Input id="order-delivery" type="date" className="mt-1.5" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>

        {sellers.length > 1 && (
          <div>
            <Label htmlFor="order-seller">Vendedor</Label>
            <Select
              items={{ self: 'Yo', ...Object.fromEntries(sellers.map((s) => [s.id, s.name])) }}
              value={sellerId}
              onValueChange={(v) => setSellerId(v as string)}
            >
              <SelectTrigger id="order-seller" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Yo</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={sellers.length > 1 ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-3'}>
          <Label htmlFor="order-notes">Observaciones</Label>
          <Input id="order-notes" className="mt-1.5" placeholder="Dirección de entrega, contacto, condiciones…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card" aria-label="Productos">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8" placeholder="Agregar producto por SKU o nombre" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
          {productResults.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card text-sm shadow-popover">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted" onClick={() => addProduct(p)}>
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-muted-foreground">{p.sku}</span> {p.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(resolveUnitPrice(p.netPrice, tiersFor(p.id), 1))} · stock {p.totalStock}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <EmptyState title="Sin productos" description="Busca un producto arriba para agregarlo a la nota." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Producto</th>
                  <th className="px-2 py-2 font-medium">Cantidad</th>
                  <th className="px-2 py-2 font-medium">Precio neto</th>
                  <th className="px-2 py-2 font-medium">% Desc.</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {computed.map((line) => {
                  const avail = availability(line);
                  return (
                    <tr key={line.key}>
                      <td className="px-2 py-2">
                        <Input value={line.description} onChange={(e) => update(line.key, 'description', e.target.value)} className="h-8 min-w-[220px]" aria-label="Descripción" />
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {line.sku ? <span className="font-mono">{line.sku}</span> : 'Línea libre'}
                          {line.isExempt && ' · exento'}
                          {line.priceAuto && ' · precio de lista'}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} step="any" value={line.quantity} onChange={(e) => update(line.key, 'quantity', e.target.value)} className="h-8 w-24" aria-label="Cantidad" />
                        {avail && (
                          <p className={cn('mt-0.5 text-[11px] tabular-nums', avail.short ? 'font-medium text-warning' : 'text-muted-foreground')}>
                            Disponible {avail.available}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} step={1} value={line.unitPrice} onChange={(e) => update(line.key, 'unitPrice', e.target.value)} className="h-8 w-28" aria-label="Precio neto" />
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" min={0} max={100} step="any" value={line.discountPercent} onChange={(e) => update(line.key, 'discountPercent', e.target.value)} className="h-8 w-20" aria-label="Descuento" />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{formatCurrency(line.total)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar línea" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines((prev) => [...prev, { key: newKey(), description: '', quantity: '1', unitPrice: '0', discountPercent: '0', isExempt: false, priceAuto: false }])}
        >
          <Plus className="size-4" aria-hidden="true" /> Línea libre (servicio, flete…)
        </Button>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {shortLines > 0 && (
            <p className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {shortLines} línea(s) superan lo disponible. La nota se puede guardar igual; el stock se valida al despachar.
            </p>
          )}
        </div>
        <div className="w-full space-y-1 rounded-xl border border-border bg-card p-4 text-sm shadow-card sm:w-80">
          <div className="flex justify-between"><span className="text-muted-foreground">Neto</span><span className="tabular-nums">{formatCurrency(totals.netAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Exento</span><span className="tabular-nums">{formatCurrency(totals.exemptAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IVA 19%</span><span className="tabular-nums">{formatCurrency(totals.ivaAmount)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(totals.totalAmount)}</span></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/dashboard/sales/orders" className="inline-flex h-9 items-center rounded-md px-4 text-sm text-muted-foreground hover:text-foreground">
          Cancelar
        </Link>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar nota de venta'}
        </Button>
      </div>
    </div>
  );
}
