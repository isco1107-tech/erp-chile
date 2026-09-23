'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NAV_ICONS } from '@/components/shared/SidebarNav';
import { LOCKED_NAV_ITEMS, type NavGroup } from '@/lib/navigation/workspace-nav';
import { updateDisabledNavItemsAction } from '@/modules/workspace/actions/workspace.actions';
import { cn } from '@/lib/utils';

export interface UncontractedModule {
  key: string;
  label: string;
  description: string;
}

interface Props {
  groups: NavGroup[];
  initialDisabled: string[];
  uncontracted: UncontractedModule[];
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export default function WorkspaceModulesClient({ groups, initialDisabled, uncontracted }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialDisabled));
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(initialDisabled));
  const [saving, setSaving] = useState(false);

  const allLinks = useMemo(() => groups.flatMap((group) => group.links), [groups]);
  const toggleable = allLinks.filter((link) => !LOCKED_NAV_ITEMS.includes(link.id));
  const activeCount = allLinks.filter((link) => !disabled.has(link.id)).length;
  const dirty = !sameSet(saved, disabled);

  function setItem(id: string, enabled: boolean) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGroup(group: NavGroup, enabled: boolean) {
    setDisabled((prev) => {
      const next = new Set(prev);
      for (const link of group.links) {
        if (LOCKED_NAV_ITEMS.includes(link.id)) continue;
        if (enabled) next.delete(link.id);
        else next.add(link.id);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateDisabledNavItemsAction({ disabledNavItems: [...disabled] });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const persisted = new Set(result.data);
      setSaved(persisted);
      setDisabled(persisted);
      toast.success(result.message ?? 'Menú actualizado');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card">
        <p className="text-sm text-foreground">
          <span className="font-semibold tabular-nums">{activeCount}</span>
          <span className="text-muted-foreground"> de {allLinks.length} secciones visibles para tu equipo</span>
        </p>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDisabled(new Set())} disabled={disabled.size === 0}>
            Activar todo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDisabled(new Set(toggleable.map((link) => link.id)))}
            disabled={disabled.size === toggleable.length}
          >
            Ocultar todo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const groupToggleable = group.links.filter((link) => !LOCKED_NAV_ITEMS.includes(link.id));
          const groupEnabled = groupToggleable.some((link) => !disabled.has(link.id));

          return (
            <section key={group.label} className="rounded-lg border border-border bg-card shadow-card">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                {groupToggleable.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGroup(group, !groupEnabled)}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {groupEnabled ? 'Ocultar grupo' : 'Mostrar grupo'}
                  </button>
                )}
              </header>
              <ul className="divide-y divide-border">
                {group.links.map((link) => {
                  const Icon = NAV_ICONS[link.icon];
                  const locked = LOCKED_NAV_ITEMS.includes(link.id);
                  const enabled = locked || !disabled.has(link.id);
                  return (
                    <li key={link.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-md',
                          enabled ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm', enabled ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                          {link.label}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{link.href}</p>
                      </div>
                      {locked ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Siempre visible para no dejar a la empresa sin forma de volver">
                          <Lock className="size-3.5" aria-hidden="true" />
                          Siempre visible
                        </span>
                      ) : (
                        <Switch checked={enabled} onCheckedChange={(value) => setItem(link.id, value)} label={`Mostrar ${link.label}`} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {uncontracted.length > 0 && (
        <section className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackageOpen className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Disponibles para agregar a tu plan</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Estos módulos no están incluidos en tu plan actual. Pídele a tu ejecutivo de Aether que los active y aparecerán aquí para encenderlos.
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {uncontracted.map((mod) => (
              <li key={mod.key} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{mod.label}</p>
                  <StatusBadge tone="neutral">No incluido</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{mod.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 shadow-popover backdrop-blur-md lg:pl-[276px]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-sm text-muted-foreground">Tienes cambios sin guardar en el menú.</p>
            <Button type="button" variant="outline" onClick={() => setDisabled(new Set(saved))} disabled={saving}>
              Descartar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
