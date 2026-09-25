'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { textareaClass } from '@/components/ui/field-classes';
import { createPurchaseRequestAction, updatePurchaseRequestAction } from '@/modules/purchases/actions/purchase-request.actions';
import { ProductSearch } from './ProductSearch';

interface Line {
  key: string;
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unit: string;
}

export interface PurchaseRequestFormInitial {
  id: string;
  title: string;
  neededBy: string;
  notes: string;
  items: { productId: string | null; productSku: string | null; description: string; quantity: number; unit: string | null }[];
}

let counter = 0;
const nextKey = () => `req-line-${(counter += 1)}`;

export default function PurchaseRequestForm({ initial }: { initial?: PurchaseRequestFormInitial }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [neededBy, setNeededBy] = useState(initial?.neededBy ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items.map((item) => ({
        key: nextKey(),
        productId: item.productId ?? undefined,
        sku: item.productSku ?? undefined,
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit ?? '',
      })) ?? []
  );
  const [saving, setSaving] = useState(false);

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save(submit: boolean) {
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        neededBy,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          productId: line.productId,
          description: line.description.trim(),
          quantity: Number(line.quantity.replace(',', '.')) || 0,
          unit: line.unit.trim() || undefined,
        })),
      };
      const result = initial ? await updatePurchaseRequestAction(initial.id, payload) : await createPurchaseRequestAction(payload, submit);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      const id = initial ? initial.id : (result.data as { id: string }).id;
      router.push(`/dashboard/purchase-requests/${id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="req-title">¿Qué se necesita?</Label>
          <Input id="req-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Insumos de iluminación para el evento de noviembre" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-needed">Para cuándo</Label>
          <Input id="req-needed" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="req-notes">Justificación o comentarios (opcional)</Label>
          <textarea id="req-notes" className={textareaClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Para qué se usa, proveedor sugerido, especificaciones…" />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Ítems">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <ProductSearch
              onPick={(product) =>
                setLines((current) => [...current, { key: nextKey(), productId: product.id, sku: product.sku, description: product.name, quantity: '1', unit: product.unit }])
              }
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { key: nextKey(), description: '', quantity: '1', unit: '' }])}>
            <Plus className="size-4" aria-hidden="true" /> Ítem sin catálogo
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="w-32 px-4 py-2 font-medium">Cantidad</th>
                <th className="w-28 px-4 py-2 font-medium">Unidad</th>
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Busca un producto del catálogo o agrega un ítem libre.</td>
                </tr>
              )}
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-4 py-2">
                    {line.productId ? (
                      <p className="font-medium">
                        {line.description}
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{line.sku}</span>
                      </p>
                    ) : (
                      <Input value={line.description} aria-label="Descripción" maxLength={200} onChange={(e) => update(line.key, { description: e.target.value })} placeholder="Descripción del ítem" />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Input inputMode="decimal" aria-label="Cantidad" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} />
                  </td>
                  <td className="px-4 py-2">
                    <Input aria-label="Unidad" maxLength={20} value={line.unit} onChange={(e) => update(line.key, { unit: e.target.value })} placeholder="UN" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar ítem" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {initial ? (
          <Button type="button" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={saving} onClick={() => save(false)}>
              Guardar borrador
            </Button>
            <Button type="button" disabled={saving} onClick={() => save(true)}>
              <Send className="size-4" aria-hidden="true" /> {saving ? 'Enviando…' : 'Enviar a aprobación'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
