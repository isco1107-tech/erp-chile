'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { ProductSearch } from '@/components/purchases/ProductSearch';
import { deleteBomAction, saveBomAction } from '@/modules/manufacturing/actions/manufacturing.actions';
import type { BomRow } from '@/modules/manufacturing/services/manufacturing.service';

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
}

function money2(value: number): string {
  return `$${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

function parseDecimal(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BomsClient({ boms, canWrite, showCosts }: { boms: BomRow[]; canWrite: boolean; showCosts: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<BomRow | 'new' | null>(null);

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Recetas">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <p className="text-sm text-muted-foreground">{boms.length} receta{boms.length === 1 ? '' : 's'}</p>
        {canWrite && (
          <Button type="button" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" /> Nueva receta
          </Button>
        )}
      </div>
      {boms.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="Aún no hay recetas"
          description="Una receta dice qué insumos y en qué cantidad se consumen para fabricar un producto. Con ella, cada orden de producción descuenta los insumos y deja el producto a su costo real."
          actionLabel={canWrite ? 'Nueva receta' : undefined}
          onAction={canWrite ? () => setEditing('new') : undefined}
        />
      ) : (
        <ul className="divide-y divide-border">
          {boms.map((bom) => (
            <li key={bom.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{bom.name}</p>
                  {!bom.isActive && <StatusBadge tone="neutral">Desactivada</StatusBadge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  Produce {qty(bom.outputQuantity)} {bom.unit} de <span className="font-medium text-foreground">{bom.productName}</span> <span className="font-mono text-xs">{bom.productSku}</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {bom.components.map((component) => (
                    <li key={component.productId} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {qty(component.quantity)} {component.unit} · {component.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {showCosts && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Costo de insumos por unidad</p>
                    <p className="font-semibold tabular-nums">{money2(bom.estimatedUnitCost)}</p>
                  </div>
                )}
                {canWrite && (
                  <div className="flex gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${bom.name}`} onClick={() => setEditing(bom)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Eliminar ${bom.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `¿Eliminar la receta "${bom.name}"?`, description: bom.orderCount > 0 ? 'Las órdenes ya hechas con ella se conservan.' : undefined, confirmLabel: 'Eliminar' }))) return;
                        const result = await deleteBomAction(bom.id);
                        if (!result.success) toast.error(result.error);
                        else {
                          toast.success(result.message ?? 'Receta eliminada');
                          router.refresh();
                        }
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <BomDialog bom={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </section>
  );
}

interface ComponentDraft {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: string;
}

function BomDialog({ bom, onClose, onSaved }: { bom: BomRow | null; onClose: () => void; onSaved: () => void }) {
  const [output, setOutput] = useState<{ id: string; name: string; sku: string; unit: string } | null>(bom ? { id: bom.productId, name: bom.productName, sku: bom.productSku, unit: bom.unit } : null);
  const [name, setName] = useState(bom?.name ?? '');
  const [outputQuantity, setOutputQuantity] = useState(bom ? String(bom.outputQuantity).replace('.', ',') : '1');
  const [notes, setNotes] = useState(bom?.notes ?? '');
  const [isActive, setIsActive] = useState(bom?.isActive ?? true);
  const [components, setComponents] = useState<ComponentDraft[]>(
    () => bom?.components.map((component) => ({ productId: component.productId, name: component.name, sku: component.sku, unit: component.unit, quantity: String(component.quantity).replace('.', ',') })) ?? []
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!output) {
      toast.error('Elige el producto que se fabrica');
      return;
    }
    setSaving(true);
    try {
      const result = await saveBomAction(bom?.id ?? null, {
        productId: output.id,
        name: name.trim() || output.name,
        outputQuantity: parseDecimal(outputQuantity),
        notes: notes.trim() || undefined,
        isActive,
        components: components.map((component) => ({ productId: component.productId, quantity: parseDecimal(component.quantity) })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Receta guardada');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{bom ? 'Editar receta' : 'Nueva receta'}</DialogTitle>
          <DialogDescription>Las cantidades de insumos son las que se consumen para producir la cantidad indicada del producto terminado.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Producto terminado</Label>
            {output ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {output.name} <span className="font-mono text-xs text-muted-foreground">{output.sku}</span>
                </span>
                <Button type="button" size="xs" variant="ghost" onClick={() => setOutput(null)}>Cambiar</Button>
              </div>
            ) : (
              <ProductSearch
                onlyTrackable
                placeholder="Busca el producto que se fabrica"
                onPick={(product) => {
                  setOutput({ id: product.id, name: product.name, sku: product.sku, unit: product.unit });
                  if (!name.trim()) setName(`Receta ${product.name}`);
                }}
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="bom-name">Nombre de la receta</Label>
              <Input id="bom-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bom-output">Produce ({output?.unit ?? 'UN'})</Label>
              <Input id="bom-output" inputMode="decimal" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Insumos</Label>
            <ProductSearch
              onlyTrackable
              placeholder="Agrega un insumo"
              onPick={(product) => {
                if (components.some((component) => component.productId === product.id)) {
                  toast.error('Ese insumo ya está en la receta');
                  return;
                }
                setComponents((current) => [...current, { productId: product.id, name: product.name, sku: product.sku, unit: product.unit, quantity: '1' }]);
              }}
            />
            <ul className="divide-y divide-border rounded-lg border border-border">
              {components.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Sin insumos todavía</li>}
              {components.map((component) => (
                <li key={component.productId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {component.name} <span className="font-mono text-xs text-muted-foreground">{component.sku}</span>
                  </span>
                  <Input
                    aria-label={`Cantidad de ${component.name}`}
                    inputMode="decimal"
                    className="w-28"
                    value={component.quantity}
                    onChange={(e) => setComponents((current) => current.map((item) => (item.productId === component.productId ? { ...item, quantity: e.target.value } : item)))}
                  />
                  <span className="w-10 text-xs text-muted-foreground">{component.unit}</span>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${component.name}`} onClick={() => setComponents((current) => current.filter((item) => item.productId !== component.productId))}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bom-notes">Notas del proceso</Label>
            <textarea id="bom-notes" className={textareaClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} label="Receta activa" />
            <span>Receta activa (disponible para nuevas órdenes)</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar receta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
