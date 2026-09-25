'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookCheck, Building2, Coins, Plus, Search, TrendingDown, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { formatCurrency } from '@/lib/chile/tax';
import { USEFUL_LIFE_PRESETS, effectiveLifeMonths } from '@/lib/assets/depreciation';
import { formatShortDate } from '@/lib/intelligence/format';
import { deleteFixedAssetAction, disposeFixedAssetAction, getFixedAssetsAction, postDepreciationAction, saveFixedAssetAction } from '@/modules/fixed-assets/actions/fixed-assets.actions';
import { DEPRECIATION_METHOD_LABELS, DEPRECIATION_METHODS } from '@/modules/fixed-assets/schema';
import type { AssetRow, AssetsSummary } from '@/modules/fixed-assets/services/fixed-assets.service';

interface FormValues {
  id?: string;
  code: string;
  name: string;
  category: string;
  description: string;
  location: string;
  responsible: string;
  acquisitionDate: string;
  depreciationStartDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeYears: number;
  method: (typeof DEPRECIATION_METHODS)[number];
  supplier: ContactOption | null;
  invoiceReference: string;
  notes: string;
}

const EMPTY: FormValues = {
  code: '',
  name: '',
  category: USEFUL_LIFE_PRESETS[0].category,
  description: '',
  location: '',
  responsible: '',
  acquisitionDate: '',
  depreciationStartDate: '',
  acquisitionCost: 0,
  residualValue: 1,
  usefulLifeYears: USEFUL_LIFE_PRESETS[0].normalYears ?? 0,
  method: 'LINEAL',
  supplier: null,
  invoiceReference: '',
  notes: '',
};

const toDateInput = (value: Date | string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');

function toForm(asset: AssetRow): FormValues {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    category: asset.category,
    description: asset.description ?? '',
    location: asset.location ?? '',
    responsible: asset.responsible ?? '',
    acquisitionDate: toDateInput(asset.acquisitionDate),
    depreciationStartDate: toDateInput(asset.depreciationStartDate),
    acquisitionCost: asset.acquisitionCost,
    residualValue: asset.residualValue,
    usefulLifeYears: Math.round(asset.usefulLifeMonths / 12),
    method: asset.method,
    supplier: asset.supplier,
    invoiceReference: asset.invoiceReference ?? '',
    notes: asset.notes ?? '',
  };
}

export function FixedAssetsClient({ canWrite, canPostEntries }: { canWrite: boolean; canPostEntries: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<{ assets: AssetRow[]; summary: AssetsSummary } | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [disposing, setDisposing] = useState<AssetRow | null>(null);
  const [disposal, setDisposal] = useState({ date: '', amount: 0 });
  const [detail, setDetail] = useState<AssetRow | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [postPeriod, setPostPeriod] = useState('');

  const load = useCallback(async () => {
    const result = await getFixedAssetsAction();
    if (result.success) setData(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.assets.filter((a) => [a.code, a.name, a.category, a.location, a.responsible].some((t) => t?.toLowerCase().includes(q))) : data.assets;
  }, [data, query]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const result = await saveFixedAssetAction(form.id ?? null, {
        code: form.code,
        name: form.name,
        category: form.category,
        description: form.description,
        location: form.location,
        responsible: form.responsible,
        acquisitionDate: form.acquisitionDate || undefined,
        depreciationStartDate: form.depreciationStartDate || undefined,
        acquisitionCost: form.acquisitionCost,
        residualValue: form.residualValue,
        usefulLifeMonths: form.usefulLifeYears * 12,
        method: form.method,
        supplierContactId: form.supplier?.id ?? '',
        invoiceReference: form.invoiceReference,
        notes: form.notes,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      setForm(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function dispose() {
    if (!disposing) return;
    const result = await disposeFixedAssetAction(disposing.id, { disposalDate: disposal.date || undefined, disposalAmount: disposal.amount });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Baja registrada');
    setDisposing(null);
    await load();
  }

  async function remove(asset: AssetRow) {
    if (!(await confirm({ title: `¿Eliminar ${asset.code} · ${asset.name}?`, description: 'Si el bien se vendió o se perdió, registra la baja: así queda el historial.', confirmLabel: 'Eliminar' }))) return;
    const result = await deleteFixedAssetAction(asset.id);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Eliminado');
    await load();
  }

  async function postDepreciation() {
    const [year, month] = postPeriod.split('-').map(Number);
    const result = await postDepreciationAction({ year, month });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Contabilizado');
    setPostOpen(false);
  }

  if (!data) return <p className="text-sm text-muted-foreground">Cargando activos…</p>;
  const { summary } = data;
  const lifePreview = form ? effectiveLifeMonths({ usefulLifeMonths: form.usefulLifeYears * 12, method: form.method }) : 0;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Valor de adquisición" value={formatCurrency(summary.grossCost)} icon={Building2} tone="accent" trend={`${summary.count} bienes activos`} hint="en uso" />
        <KpiCard label="Depreciación acumulada" value={formatCurrency(summary.accumulated)} icon={TrendingDown} tone="warning" />
        <KpiCard label="Valor libro" value={formatCurrency(summary.bookValue)} icon={Wallet} tone="success" />
        <KpiCard label="Depreciación de este mes" value={formatCurrency(summary.currentMonthDepreciation)} icon={Coins} tone="info" />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por código, nombre o ubicación" className="pl-8" aria-label="Buscar activos" />
        </div>
        <div className="ml-auto flex gap-2">
          {canPostEntries && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const now = new Date();
                setPostPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                setPostOpen(true);
              }}
            >
              <BookCheck aria-hidden="true" />
              Contabilizar depreciación
            </Button>
          )}
          {canWrite && (
            <Button type="button" onClick={() => setForm({ ...EMPTY })} data-tutorial="module-primary-action">
              <Plus aria-hidden="true" />
              Registrar activo
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState title="Sin activos registrados" description="Registra computadores, vehículos, maquinaria o muebles para controlar su depreciación y valor libro." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 text-right font-medium">Dep. acumulada</th>
                <th className="px-3 py-2 text-right font-medium">Valor libro</th>
                <th className="px-3 py-2 font-medium">Vida útil</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => {
                const progress = asset.state.lifeMonths === 0 ? 0 : (asset.state.monthsDepreciated / asset.state.lifeMonths) * 100;
                return (
                  <tr key={asset.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setDetail(asset)} className="text-left hover:underline">
                        <p className="font-medium text-foreground">{asset.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {asset.code}
                          {asset.location ? ` · ${asset.location}` : ''}
                        </p>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{asset.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(asset.acquisitionCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(asset.state.accumulated)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(asset.state.bookValue)}</td>
                    <td className="px-3 py-2">
                      {asset.method === 'SIN_DEPRECIACION' ? (
                        <span className="text-xs text-muted-foreground">No se deprecia</span>
                      ) : (
                        <div className="w-32">
                          <div className="h-1.5 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${Math.min(100, progress)}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {asset.state.monthsDepreciated} de {asset.state.lifeMonths} meses
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {asset.status === 'DISPOSED' ? (
                        <StatusBadge tone="neutral">De baja</StatusBadge>
                      ) : asset.state.fullyDepreciated ? (
                        <StatusBadge tone="info">Depreciado</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">En uso</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && asset.status === 'ACTIVE' && (
                        <div className="flex justify-end gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setForm(toForm(asset))}>
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDisposing(asset);
                              setDisposal({ date: '', amount: 0 });
                            }}
                          >
                            Dar de baja
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => void remove(asset)}>
                            Eliminar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-2xl">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{form.id ? 'Editar activo' : 'Registrar activo fijo'}</DialogTitle>
                <DialogDescription>El costo va neto: sin el IVA que recuperas como crédito fiscal.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="fa-code">Código</Label>
                    <Input id="fa-code" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="AF-001" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="fa-name">Descripción del bien</Label>
                    <Input id="fa-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Notebook Lenovo ThinkPad" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fa-category">Categoría (tabla SII de referencia)</Label>
                    <select
                      id="fa-category"
                      className={nativeSelectClass}
                      value={form.category}
                      onChange={(e) => {
                        const preset = USEFUL_LIFE_PRESETS.find((p) => p.category === e.target.value);
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                category: e.target.value,
                                usefulLifeYears: preset?.normalYears ?? prev.usefulLifeYears,
                                method: preset && preset.normalYears === null ? 'SIN_DEPRECIACION' : prev.method === 'SIN_DEPRECIACION' ? 'LINEAL' : prev.method,
                              }
                            : prev
                        );
                      }}
                    >
                      {!USEFUL_LIFE_PRESETS.some((p) => p.category === form.category) && <option value={form.category}>{form.category}</option>}
                      {USEFUL_LIFE_PRESETS.map((preset) => (
                        <option key={preset.category} value={preset.category}>
                          {preset.category}
                          {preset.normalYears ? ` · ${preset.normalYears} años` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="fa-method">Método</Label>
                    <select id="fa-method" className={nativeSelectClass} value={form.method} onChange={(e) => set('method', e.target.value as FormValues['method'])}>
                      {DEPRECIATION_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {DEPRECIATION_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="fa-cost">Costo neto</Label>
                    <CurrencyInput id="fa-cost" value={form.acquisitionCost} onChange={(v) => set('acquisitionCost', v)} />
                  </div>
                  <div>
                    <Label htmlFor="fa-residual">Valor residual</Label>
                    <CurrencyInput id="fa-residual" value={form.residualValue} onChange={(v) => set('residualValue', v)} />
                  </div>
                  <div>
                    <Label htmlFor="fa-life">Vida útil normal (años)</Label>
                    <Input id="fa-life" type="number" min={0} max={100} value={form.usefulLifeYears} disabled={form.method === 'SIN_DEPRECIACION'} onChange={(e) => set('usefulLifeYears', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Se deprecia en</Label>
                    <p className="flex h-8 items-center text-sm font-medium text-foreground">{lifePreview === 0 ? 'No aplica' : `${lifePreview / 12} año(s)`}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fa-acq">Fecha de adquisición</Label>
                    <Input id="fa-acq" type="date" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="fa-start">Inicio de la depreciación</Label>
                    <Input id="fa-start" type="date" value={form.depreciationStartDate} onChange={(e) => set('depreciationStartDate', e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">Vacío = la fecha de adquisición (cuando el bien empieza a usarse).</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="fa-location">Ubicación</Label>
                    <Input id="fa-location" value={form.location} onChange={(e) => set('location', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="fa-responsible">Responsable</Label>
                    <Input id="fa-responsible" value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="fa-invoice">N° factura</Label>
                    <Input id="fa-invoice" value={form.invoiceReference} onChange={(e) => set('invoiceReference', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fa-supplier">Proveedor</Label>
                  <ContactSearchSelect id="fa-supplier" value={form.supplier} onChange={(c) => set('supplier', c)} kind="supplier" />
                </div>
                <div>
                  <Label htmlFor="fa-notes">Notas</Label>
                  <textarea id="fa-notes" className={textareaClass} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="button" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disposing !== null} onOpenChange={(open) => !open && setDisposing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar de baja</DialogTitle>
            <DialogDescription>{disposing && `${disposing.code} · ${disposing.name}: deja de depreciarse desde el mes de la baja.`}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="disposal-date">Fecha de baja</Label>
              <Input id="disposal-date" type="date" value={disposal.date} onChange={(e) => setDisposal((d) => ({ ...d, date: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="disposal-amount">Precio de venta (0 si se desechó)</Label>
              <CurrencyInput id="disposal-amount" value={disposal.amount} onChange={(v) => setDisposal((d) => ({ ...d, amount: v }))} />
            </div>
          </div>
          {disposing && disposal.amount > 0 && (
            <p className="text-xs text-muted-foreground">
              Resultado estimado de la venta: {formatCurrency(disposal.amount - disposing.state.bookValue)} ({disposal.amount >= disposing.state.bookValue ? 'utilidad' : 'pérdida'} sobre el valor libro actual).
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisposing(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!disposal.date} onClick={() => void dispose()}>
              Registrar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>
                  {detail.code} · {detail.category} · {DEPRECIATION_METHOD_LABELS[detail.method]}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Adquirido</dt>
                  <dd>{formatShortDate(detail.acquisitionDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cuota mensual</dt>
                  <dd className="tabular-nums">{formatCurrency(detail.state.monthlyDepreciation)}</dd>
                </div>
                {detail.supplier && (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Proveedor</dt>
                    <dd>
                      {detail.supplier.razonSocial} · {detail.supplier.rut}
                      {detail.invoiceReference ? ` · Factura ${detail.invoiceReference}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
              {detail.schedule.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Año</th>
                      <th className="py-1 text-right font-medium">Depreciación</th>
                      <th className="py-1 text-right font-medium">Acumulada</th>
                      <th className="py-1 text-right font-medium">Valor libro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.schedule.map((row) => (
                      <tr key={row.year} className="border-t border-border">
                        <td className="py-1">{row.year}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrency(row.depreciation)}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrency(row.accumulated)}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrency(row.bookValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <DialogFooter>
                <Link href={`/dashboard/fixed-assets/${detail.id}`} className={buttonVariants({ variant: 'outline' })}>
                  Ficha, mantenciones y etiqueta
                </Link>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contabilizar depreciación</DialogTitle>
            <DialogDescription>Crea el asiento Gasto por depreciación (6105) contra Depreciación acumulada (1202) del mes elegido. Se hace una sola vez por mes.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="post-period">Mes</Label>
            <Input id="post-period" type="month" value={postPeriod} onChange={(e) => setPostPeriod(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPostOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!postPeriod} onClick={() => void postDepreciation()}>
              Contabilizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
