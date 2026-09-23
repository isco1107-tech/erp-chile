'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { copyPackagesAction, createPackageAction, deletePackageAction, listPackagesAction, updatePackageAction } from '@/modules/sponsorships/actions/packages.actions';
import type { SponsorshipPackageRow } from '@/modules/sponsorships/services/packages.service';
import { SPONSORSHIP_TIER_LABELS, SPONSORSHIP_TIERS } from '@/modules/sponsorships/schema';
import { cn } from '@/lib/utils';

type TierKey = (typeof SPONSORSHIP_TIERS)[number];

interface PackageForm {
  id?: string;
  tier: TierKey;
  name: string;
  price: number;
  maxSlots: string;
  benefitsText: string;
  description: string;
  isPublic: boolean;
  showPricePublic: boolean;
  order: number;
}

const EMPTY_FORM: PackageForm = {
  tier: 'GOLD',
  name: '',
  price: 0,
  maxSlots: '',
  benefitsText: '',
  description: '',
  isPublic: true,
  showPricePublic: false,
  order: 0,
};

/** Beneficios típicos por nivel, para no partir con la hoja en blanco. */
const BENEFIT_SUGGESTIONS = [
  'Logo en backdrop de prensa y alfombra roja',
  'Mención en vivo del conductor durante la gala',
  'Pantalla LED: spot de 20 segundos',
  'Publicación en redes oficiales del certamen',
  'Entrega de banda o premio especial en el escenario',
  'Mesa VIP para 10 personas en la gala',
  'Activación de marca en el foyer',
  'Presencia de candidatas en evento de la marca',
];

export function PackagesClient({ projects, canWrite }: { projects: Array<{ id: string; name: string; code: string }>; canWrite: boolean }) {
  const confirm = useConfirm();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [packages, setPackages] = useState<SponsorshipPackageRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PackageForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    const result = await listPackagesAction(projectId);
    if (result.success) setPackages(result.data);
    else toast.error(result.error);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const list = packages ?? [];
    const capacity = list.reduce((s, p) => s + (p.maxSlots ? p.maxSlots * p.price : 0), 0);
    return {
      plans: list.length,
      sold: list.reduce((s, p) => s + p.soldSlots, 0),
      slots: list.reduce((s, p) => s + (p.maxSlots ?? 0), 0),
      soldValue: list.reduce((s, p) => s + p.soldValue, 0),
      capacity,
    };
  }, [packages]);

  function openNew() {
    setForm({ ...EMPTY_FORM, order: (packages?.length ?? 0) + 1 });
    setFormOpen(true);
  }

  function openEdit(pkg: SponsorshipPackageRow) {
    setForm({
      id: pkg.id,
      tier: pkg.tier,
      name: pkg.name,
      price: pkg.price,
      maxSlots: pkg.maxSlots ? String(pkg.maxSlots) : '',
      benefitsText: pkg.benefits.join('\n'),
      description: pkg.description ?? '',
      isPublic: pkg.isPublic,
      showPricePublic: pkg.showPricePublic,
      order: pkg.order,
    });
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        tier: form.tier,
        name: form.name,
        price: form.price,
        maxSlots: form.maxSlots ? Number(form.maxSlots) : null,
        benefits: form.benefitsText.split('\n').map((b) => b.trim()).filter(Boolean),
        description: form.description,
        isPublic: form.isPublic,
        showPricePublic: form.showPricePublic,
        order: form.order,
      };
      const result = form.id ? await updatePackageAction(form.id, payload) : await createPackageAction({ ...payload, projectId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      setFormOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(pkg: SponsorshipPackageRow) {
    const ok = await confirm({
      title: `¿Eliminar el plan "${pkg.name}"?`,
      description: 'Los contratos y negocios que salieron de este plan se mantienen, solo dejan de estar asociados a él.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deletePackageAction(pkg.id);
    if (!result.success) toast.error(result.error);
    await load();
  }

  async function copy() {
    const result = await copyPackagesAction(copyFrom, projectId);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Copiado');
    setCopyFrom('');
    await load();
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState title="Primero crea un certamen" description="El tarifario de auspicios pertenece a un certamen o evento." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="pkg-project">Certamen</Label>
          <select id="pkg-project" className={cn(nativeSelectClass, 'min-w-[16rem]')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        {canWrite && (
          <div className="ml-auto flex flex-wrap items-end gap-2">
            {projects.length > 1 && (
              <>
                <select aria-label="Copiar planes desde" className={cn(nativeSelectClass, 'w-auto')} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">Copiar planes desde…</option>
                  {projects
                    .filter((p) => p.id !== projectId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <Button type="button" variant="outline" disabled={!copyFrom} onClick={() => void copy()}>
                  <Copy aria-hidden="true" />
                  Copiar
                </Button>
              </>
            )}
            <Button type="button" onClick={openNew}>
              <Plus aria-hidden="true" />
              Nuevo plan
            </Button>
          </div>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Planes" value={String(totals.plans)} icon={Layers} tone="accent" />
        <KpiCard label="Cupos vendidos" value={totals.slots > 0 ? `${totals.sold}/${totals.slots}` : String(totals.sold)} icon={Layers} tone="success" />
        <KpiCard label="Contratado desde el tarifario" value={formatCurrency(totals.soldValue)} icon={Layers} tone="info" hint="efectivo + canje" trend="confirmado" />
        <KpiCard label="Potencial a precio de lista" value={formatCurrency(totals.capacity)} icon={Layers} tone="neutral" hint="planes con cupos" trend="todos vendidos" />
      </section>

      {!packages ? (
        <p className="text-sm text-muted-foreground">Cargando tarifario…</p>
      ) : packages.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            title="Este certamen todavía no tiene tarifario"
            description="Define tus planes (Principal, Oro, Plata, Media Partner…) con precio, cupos y beneficios. Aparecen en el CRM al proponer un auspicio y en el sitio público del certamen."
            action={canWrite ? <Button onClick={openNew}>Crear el primer plan</Button> : undefined}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => {
            const soldOut = pkg.maxSlots !== null && pkg.soldSlots >= pkg.maxSlots;
            return (
              <li key={pkg.id} className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{SPONSORSHIP_TIER_LABELS[pkg.tier]}</p>
                    <h2 className="text-lg font-semibold text-foreground">{pkg.name}</h2>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={pkg.isPublic ? 'Visible en el sitio público' : 'Solo interno'}>
                    {pkg.isPublic ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
                    {pkg.isPublic ? 'Público' : 'Interno'}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{formatCurrency(pkg.price)}</p>
                <p className="text-xs text-muted-foreground">neto, precio de lista{pkg.isPublic && !pkg.showPricePublic ? ' · no se publica' : ''}</p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn(soldOut ? 'font-medium text-success' : 'text-muted-foreground')}>
                      {pkg.maxSlots !== null ? `${pkg.soldSlots}/${pkg.maxSlots} cupos vendidos` : `${pkg.soldSlots} vendidos · cupos ilimitados`}
                    </span>
                    {soldOut && <span className="font-medium text-success">Agotado</span>}
                  </div>
                  {pkg.maxSlots !== null && (
                    <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
                      <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${Math.min(100, (pkg.soldSlots / pkg.maxSlots) * 100)}%` }} />
                    </div>
                  )}
                </div>
                {pkg.benefits.length > 0 && (
                  <ul className="mt-3 list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                    {pkg.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                {canWrite && (
                  <div className="mt-auto flex gap-1 pt-4">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(pkg)}>
                      <Pencil aria-hidden="true" />
                      Editar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => void remove(pkg)}>
                      <Trash2 aria-hidden="true" />
                      Eliminar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar plan' : 'Nuevo plan de auspicio'}</DialogTitle>
            <DialogDescription>Cada beneficio (uno por línea) se convierte en un entregable al firmar el contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pkg-name">Nombre del plan</Label>
                <Input id="pkg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Auspiciador Oro" />
              </div>
              <div>
                <Label htmlFor="pkg-tier">Nivel</Label>
                <select id="pkg-tier" className={nativeSelectClass} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as TierKey })}>
                  {SPONSORSHIP_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {SPONSORSHIP_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="pkg-price">Precio de lista (neto)</Label>
                <CurrencyInput id="pkg-price" value={form.price} onChange={(price) => setForm({ ...form, price })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pkg-slots">Cupos</Label>
                  <Input id="pkg-slots" type="number" min={1} value={form.maxSlots} onChange={(e) => setForm({ ...form, maxSlots: e.target.value })} placeholder="Ilimitado" />
                </div>
                <div>
                  <Label htmlFor="pkg-order">Orden</Label>
                  <Input id="pkg-order" type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="pkg-benefits">Beneficios (uno por línea)</Label>
              <textarea id="pkg-benefits" className={cn(textareaClass, 'min-h-32')} value={form.benefitsText} onChange={(e) => setForm({ ...form, benefitsText: e.target.value })} />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {BENEFIT_SUGGESTIONS.filter((s) => !form.benefitsText.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, benefitsText: prev.benefitsText.trim() ? `${prev.benefitsText.trim()}\n${s}` : s }))}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="pkg-desc">Descripción</Label>
              <textarea id="pkg-desc" className={textareaClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Para qué tipo de marca es este plan" />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <span className="text-sm">Mostrar en el sitio público del certamen</span>
              <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} label="Mostrar en el sitio público" />
            </div>
            {form.isPublic && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <span className="text-sm">Publicar el precio</span>
                <Switch checked={form.showPricePublic} onCheckedChange={(v) => setForm({ ...form, showPricePublic: v })} label="Publicar el precio" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
