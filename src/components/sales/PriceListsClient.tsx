'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPriceListAction } from '@/modules/sales/actions/price-lists.actions';
import type { PriceListRow } from '@/modules/sales/services/price-lists.service';

export default function PriceListsClient({ lists, canWrite }: { lists: PriceListRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    const result = await createPriceListAction({ name, description: description || undefined, isActive: true });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Lista creada');
    router.push(`/dashboard/sales/price-lists/${result.data.id}`);
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Listas</h2>
          {canWrite && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus aria-hidden="true" /> Nueva lista
            </Button>
          )}
        </div>
        {lists.length === 0 ? (
          <EmptyState
            icon={<Tags className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="Aún no tienes listas de precios"
            description="Crea una lista (mayoristas, distribuidores, clientes VIP) y asígnala a tus clientes: al venderles, el precio se propone solo."
            action={canWrite ? <Button size="sm" onClick={() => setOpen(true)}>Crear la primera</Button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {lists.map((list) => (
              <li key={list.id}>
                <Link href={`/dashboard/sales/price-lists/${list.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{list.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{list.description || 'Sin descripción'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
                    <span>{list._count.items} precio(s)</span>
                    <span>{list._count.contacts} cliente(s)</span>
                    <StatusBadge tone={list.isActive ? 'success' : 'neutral'}>{list.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva lista de precios</DialogTitle>
            <DialogDescription>Después podrás cargar los precios uno a uno o calcularlos desde el catálogo con un porcentaje.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pl-name">Nombre</Label>
              <Input id="pl-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Mayoristas" autoFocus />
            </div>
            <div>
              <Label htmlFor="pl-desc">Descripción (opcional)</Label>
              <Input id="pl-desc" className="mt-1.5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para clientes con compras sobre $1.000.000 al mes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving || name.trim().length < 2}>{saving ? 'Creando…' : 'Crear lista'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
