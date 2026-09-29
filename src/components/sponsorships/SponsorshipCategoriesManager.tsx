'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from '@/modules/sponsorships/actions/categories.actions';
import type { SponsorshipCategoryRow } from '@/modules/sponsorships/services/categories.service';
import { SPONSORSHIP_CATEGORY_NAME_MAX, SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';

/**
 * Categorías de auspicio de un certamen: las fijas (solo lectura, iguales para
 * todos) y las propias de esta edición, que se pueden crear, renombrar y
 * eliminar (solo si nadie las usa).
 */
export function SponsorshipCategoriesManager({
  projectId,
  categories,
  canWrite,
  onChanged,
}: {
  projectId: string;
  categories: SponsorshipCategoryRow[];
  canWrite: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const result = await createCategoryAction({ projectId, name });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Categoría creada');
      setName('');
      await onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function saveRename(id: string) {
    const result = await renameCategoryAction(id, { name: editName });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setEditingId(null);
    await onChanged();
  }

  async function remove(category: SponsorshipCategoryRow) {
    const ok = await confirm({
      title: `¿Eliminar la categoría "${category.name}"?`,
      description: 'Solo se puede eliminar si ningún contrato, plan ni negocio la usa.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deleteCategoryAction(category.id);
    if (!result.success) toast.error(result.error);
    await onChanged();
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="sponsor-categories-title">
      <div className="flex items-center gap-2">
        <Tags className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="sponsor-categories-title" className="text-sm font-semibold text-foreground">
          Categorías de auspicio
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Las fijas están siempre disponibles. Agrega las que solo existan en este certamen (por ejemplo «Auspiciador Vestuario» o «Aliado Salud»).
      </p>

      <div className="mt-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fijas</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {SPONSORSHIP_TIERS.map((tier) => (
            <li key={tier} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">
              {SPONSORSHIP_TIER_LABELS[tier]}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">De este certamen</p>
        {categories.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">Todavía no agregas categorías propias.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                {editingId === category.id ? (
                  <>
                    <Input
                      aria-label={`Nuevo nombre de ${category.name}`}
                      className="h-8"
                      value={editName}
                      maxLength={SPONSORSHIP_CATEGORY_NAME_MAX}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename(category.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => void saveRename(category.id)}>
                      <Check aria-hidden="true" />
                      Guardar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar">
                      <X aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{category.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {category.usage.total === 0 ? 'Sin uso' : `${category.usage.total} en uso`}
                    </span>
                    {canWrite && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Renombrar ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          aria-label={`Eliminar ${category.name}`}
                          disabled={category.usage.total > 0}
                          title={category.usage.total > 0 ? 'La usan contratos, planes o negocios' : undefined}
                          onClick={() => void remove(category)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="min-w-[14rem] flex-1">
            <Label htmlFor="new-sponsor-category">Nueva categoría</Label>
            <Input
              id="new-sponsor-category"
              value={name}
              maxLength={SPONSORSHIP_CATEGORY_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auspiciador Vestuario"
            />
          </div>
          <Button type="submit" disabled={adding || !name.trim()}>
            <Plus aria-hidden="true" />
            {adding ? 'Agregando…' : 'Agregar'}
          </Button>
        </form>
      )}
    </section>
  );
}
