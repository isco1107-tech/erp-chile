'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import { createPurchaseOrderAction } from '@/modules/purchases/actions/purchase-order.actions';
import { formatCurrency } from '@/lib/chile/tax';

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `po-item-${keyCounter}`;
}

interface LineItemDraft {
  key: string;
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unitCost: string;
}

export default function PurchaseOrderForm() {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactQuery, setContactQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((r) => { if (r.success) setContacts(r.data); });
    listProductsAction().then((r) => { if (r.success) setProducts(r.data); });
  }, []);

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
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [productQuery, products]);

  const total = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);

  function addProductLine(product: ProductWithStock) {
    setItems((prev) => [
      ...prev,
      { key: newKey(), productId: product.id, sku: product.sku, description: product.name, quantity: '1', unitCost: String(product.costPricePMP) },
    ]);
    setProductQuery('');
  }

  function addLine() {
    setItems((prev) => [...prev, { key: newKey(), description: '', quantity: '1', unitCost: '0' }]);
  }

  function updateItem<K extends keyof LineItemDraft>(key: string, field: K, value: LineItemDraft[K]) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function handleSave() {
    if (!selectedContact) {
      toast.error('Seleccione un proveedor');
      return;
    }
    if (items.length === 0) {
      toast.error('Agregue al menos un ítem');
      return;
    }
    setSaving(true);
    try {
      const result = await createPurchaseOrderAction({
        contactId: selectedContact.id,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          description: i.description,
          quantity: Number(i.quantity) || 0,
          unitCost: Number(i.unitCost) || 0,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Orden creada');
      router.push(`/dashboard/purchases/orders/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Proveedor</Label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
              <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedContact(null)}>Cambiar</Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input placeholder="Buscar proveedor por RUT o Razón Social" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} />
              {filteredContacts.length > 0 && (
                <ul className="rounded-lg border border-border text-sm">
                  {filteredContacts.map((c) => (
                    <li key={c.id} className="cursor-pointer px-2.5 py-1.5 hover:bg-muted" onClick={() => { setSelectedContact(c); setContactQuery(''); }}>
                      {c.rut} — {c.razonSocial}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="expectedDate">Fecha esperada (opcional)</Label>
          <Input id="expectedDate" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Ítems</Label>
        <Input placeholder="Buscar producto por SKU o nombre" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
        {filteredProducts.length > 0 && (
          <ul className="rounded-lg border border-border text-sm">
            {filteredProducts.map((p) => (
              <li key={p.id} className="cursor-pointer px-2.5 py-1.5 hover:bg-muted" onClick={() => addProductLine(p)}>
                {p.sku} — {p.name}
              </li>
            ))}
          </ul>
        )}
        <Button type="button" size="sm" variant="outline" onClick={addLine}>+ Línea de gasto</Button>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[600px] table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Descripción</th>
                <th className="p-2 font-medium">Cantidad</th>
                <th className="p-2 font-medium">Costo Unit.</th>
                <th className="p-2 font-medium">Total</th>
                <th className="p-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Sin ítems</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.key} className="border-t border-border">
                  <td className="p-2">
                    <Input value={item.description} onChange={(e) => updateItem(item.key, 'description', e.target.value)} disabled={Boolean(item.productId)} />
                  </td>
                  <td className="p-2">
                    <Input type="number" min="0" step="any" className="w-24" value={item.quantity} onChange={(e) => updateItem(item.key, 'quantity', e.target.value)} />
                  </td>
                  <td className="p-2">
                    <Input type="number" min="0" className="w-28" value={item.unitCost} onChange={(e) => updateItem(item.key, 'unitCost', e.target.value)} />
                  </td>
                  <td className="p-2 font-medium">{formatCurrency((Number(item.quantity) || 0) * (Number(item.unitCost) || 0))}</td>
                  <td className="p-2">
                    <Button type="button" size="xs" variant="destructive" onClick={() => removeItem(item.key)}>✕</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <span className="font-semibold">Total estimado</span>
        <span className="text-lg font-bold">{formatCurrency(total)}</span>
      </div>

      <Button type="button" disabled={saving} onClick={handleSave}>
        {saving ? 'Creando...' : 'Crear Orden de Compra'}
      </Button>
    </div>
  );
}
