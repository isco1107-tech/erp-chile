'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, Coins, Plus, Tags, Trash2, TrendingDown, Wallet, Wrench } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { BarcodeSvg } from '@/components/inventory/BarcodeSvg';
import { formatCurrency } from '@/lib/chile/tax';
import { addMaintenanceAction, deleteMaintenanceAction } from '@/modules/fixed-assets/actions/fixed-assets.actions';
import { DEPRECIATION_METHOD_LABELS, MAINTENANCE_KIND_LABELS, MAINTENANCE_KINDS } from '@/modules/fixed-assets/schema';
import type { AssetDetail } from '@/modules/fixed-assets/services/fixed-assets.service';

function formatDay(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export default function AssetSheetClient({ asset, canWrite, today }: { asset: AssetDetail; canWrite: boolean; today: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const nextIso = asset.nextMaintenance ? new Date(asset.nextMaintenance).toISOString().slice(0, 10) : null;
  const overdue = nextIso !== null && nextIso < today;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/fixed-assets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Activo fijo
      </Link>
      <PageHeader
        eyebrow={`${asset.code} · ${asset.category}`}
        title={asset.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={asset.status === 'ACTIVE' ? 'success' : 'neutral'}>{asset.status === 'ACTIVE' ? 'En uso' : 'De baja'}</StatusBadge>
            {asset.location && <span>{asset.location}</span>}
            {asset.responsible && <span>· a cargo de {asset.responsible}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/fixed-assets/labels?ids=${asset.id}`} className={buttonVariants({ variant: 'outline' })}>
              <Tags className="size-4" aria-hidden="true" /> Etiqueta
            </Link>
            {canWrite && asset.status === 'ACTIVE' && (
              <Button type="button" onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden="true" /> Registrar mantención
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Costo de adquisición" value={formatCurrency(asset.acquisitionCost)} icon={Wallet} tone="info" hint={`Adquirido el ${formatDay(asset.acquisitionDate)}`} />
        <KpiCard label="Depreciación acumulada" value={formatCurrency(asset.state.accumulated)} icon={TrendingDown} tone="accent" hint={`${asset.state.monthsDepreciated} de ${asset.state.lifeMonths} meses`} />
        <KpiCard label="Valor libro" value={formatCurrency(asset.state.bookValue)} icon={Coins} tone="success" hint={DEPRECIATION_METHOD_LABELS[asset.method]} />
        <KpiCard
          label="Próxima mantención"
          value={asset.nextMaintenance ? formatDay(asset.nextMaintenance) : 'Sin programar'}
          icon={CalendarClock}
          tone={overdue ? 'danger' : asset.nextMaintenance ? 'warning' : 'neutral'}
          hint={overdue ? 'Atrasada' : `${formatCurrency(asset.maintenanceCost)} gastado en mantenciones`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border border-border bg-card shadow-card" aria-label="Mantenciones">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Bitácora de mantenciones</h2>
          </div>
          {asset.maintenances.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin mantenciones registradas. Programa la próxima para que el sistema te avise.</p>
          ) : (
            <ul className="divide-y divide-border">
              {asset.maintenances.map((maintenance) => (
                <li key={maintenance.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <StatusBadge tone={maintenance.kind === 'CORRECTIVE' ? 'warning' : 'info'} className="mr-2">
                        {MAINTENANCE_KIND_LABELS[maintenance.kind as keyof typeof MAINTENANCE_KIND_LABELS] ?? maintenance.kind}
                      </StatusBadge>
                      {maintenance.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDay(maintenance.date)}
                      {maintenance.provider ? ` · ${maintenance.provider}` : ''}
                      {maintenance.nextDueDate ? ` · próxima: ${formatDay(maintenance.nextDueDate)}` : ''}
                      {maintenance.createdByName ? ` · registró ${maintenance.createdByName}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{maintenance.cost > 0 ? formatCurrency(maintenance.cost) : '—'}</span>
                  {canWrite && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Eliminar mantención"
                      onClick={async () => {
                        if (!(await confirm({ title: '¿Eliminar esta mantención?', confirmLabel: 'Eliminar' }))) return;
                        const result = await deleteMaintenanceAction(asset.id, maintenance.id);
                        if (!result.success) toast.error(result.error);
                        else {
                          toast.success(result.message ?? 'Eliminada');
                          router.refresh();
                        }
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 text-sm shadow-card" aria-label="Datos del bien">
            <h2 className="text-sm font-semibold">Datos del bien</h2>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Inicio depreciación</dt><dd>{formatDay(asset.depreciationStartDate)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Depreciación mensual</dt><dd className="tabular-nums">{formatCurrency(asset.state.monthlyDepreciation)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Valor residual</dt><dd className="tabular-nums">{formatCurrency(asset.residualValue)}</dd></div>
              {asset.supplier && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Proveedor</dt><dd className="text-right">{asset.supplier.razonSocial}</dd></div>}
              {asset.invoiceReference && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Factura</dt><dd>{asset.invoiceReference}</dd></div>}
              {asset.status === 'DISPOSED' && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Baja</dt><dd>{formatDay(asset.disposalDate)}</dd></div>}
            </dl>
          </section>
          <section className="rounded-lg border border-border bg-card p-4 shadow-card" aria-label="Etiqueta">
            <h2 className="text-sm font-semibold">Etiqueta del bien</h2>
            <div className="mt-3 rounded-md border border-border p-3 text-center">
              <p className="text-xs font-semibold">{asset.name}</p>
              <BarcodeSvg value={asset.code} className="mx-auto mt-1 h-12 w-full max-w-[220px]" />
              <p className="font-mono text-xs">{asset.code}</p>
            </div>
          </section>
        </aside>
      </div>

      {adding && (
        <MaintenanceDialog
          assetId={asset.id}
          today={today}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MaintenanceDialog({ assetId, today, onClose, onSaved }: { assetId: string; today: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<(typeof MAINTENANCE_KINDS)[number]>('PREVENTIVE');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState(0);
  const [provider, setProvider] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await addMaintenanceAction(assetId, { date, kind, description: description.trim(), cost, provider: provider.trim() || undefined, nextDueDate });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Mantención registrada');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar mantención</DialogTitle>
          <DialogDescription>El costo es gasto del período: no cambia el valor libro del bien.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mnt-date">Fecha</Label>
            <Input id="mnt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mnt-kind">Tipo</Label>
            <select id="mnt-kind" className={nativeSelectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {MAINTENANCE_KINDS.map((value) => (
                <option key={value} value={value}>{MAINTENANCE_KIND_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mnt-desc">Qué se hizo</Label>
            <textarea id="mnt-desc" className={textareaClass} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mnt-cost">Costo neto</Label>
            <CurrencyInput id="mnt-cost" value={cost} onChange={setCost} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mnt-provider">Proveedor</Label>
            <Input id="mnt-provider" value={provider} maxLength={120} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mnt-next">Próxima mantención (opcional)</Label>
            <Input id="mnt-next" type="date" value={nextDueDate} min={date} onChange={(e) => setNextDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || description.trim().length < 3} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
