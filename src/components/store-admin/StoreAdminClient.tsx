'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ExternalLink, Hourglass, PackageCheck, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import type { StoreReadinessReport } from '@/lib/ecommerce/readiness';
import { cn } from '@/lib/utils';
import { getStoreSettingsAction, setStoreOpenAction, updateStoreSettingsAction } from '@/modules/ecommerce/actions/store.actions';
import type { StoreStats } from '@/modules/ecommerce/services/store-orders.service';
import type { StoreSettingsView, StoreSiteRow } from '@/modules/ecommerce/services/store-settings.service';
import OrdersPanel from './OrdersPanel';
import StoreBrandPanel from './StoreBrandPanel';
import ProductsPanel from './ProductsPanel';
import { GeneralPanel, PaymentsPanel, ShippingPanel } from './SettingsPanels';
import { draftFrom, inputFrom, isDirty, type SettingsDraft } from './settings-draft';
import { ACTION_ERROR } from './store-admin-shared';

export type StoreTab = 'orders' | 'products' | 'shipping' | 'payments' | 'settings' | 'brand';

const TABS: Array<{ value: StoreTab; label: string }> = [
  { value: 'orders', label: 'Pedidos' },
  { value: 'products', label: 'Productos' },
  { value: 'shipping', label: 'Envíos' },
  { value: 'payments', label: 'Pagos' },
  { value: 'settings', label: 'Ajustes' },
  { value: 'brand', label: 'Diseño y dominio' },
];

export interface StoreAdminClientProps {
  sites: StoreSiteRow[];
  siteId: string;
  initialSettings: StoreSettingsView;
  initialReadiness: StoreReadinessReport;
  initialStats: StoreStats;
  warehouses: Array<{ id: string; name: string }>;
  canWrite: boolean;
  canFulfill: boolean;
  canManage: boolean;
  canUploadImages: boolean;
  initialTab: StoreTab;
}

export default function StoreAdminClient({ sites, siteId, initialSettings, initialReadiness, initialStats, warehouses, canWrite, canFulfill, canManage, canUploadImages, initialTab }: StoreAdminClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = useState<StoreTab>(initialTab);
  const [settings, setSettings] = useState(initialSettings);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [stats, setStats] = useState(initialStats);
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFrom(initialSettings));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dirty = isDirty(settings, draft);
  const patch = useCallback((changes: Partial<SettingsDraft>) => setDraft((current) => ({ ...current, ...changes })), []);
  const onStats = useCallback((next: StoreStats) => setStats(next), []);

  function selectTab(next: StoreTab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url);
    } catch {
      /* sin historial: la pestaña igual cambia */
    }
  }

  async function refreshReadiness() {
    try {
      const result = await getStoreSettingsAction(siteId);
      if (result.success) {
        setSettings(result.data.settings);
        setReadiness(result.data.readiness);
      }
    } catch {
      /* el aviso de «qué le falta» se actualiza en la próxima acción */
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateStoreSettingsAction(siteId, inputFrom(draft));
      if (result.success) {
        toast.success(result.message ?? 'Ajustes guardados');
        setSettings(result.data.settings);
        setReadiness(result.data.readiness);
        setDraft(draftFrom(result.data.settings));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function toggleOpen() {
    const open = !settings.enabled;
    if (dirty && open) {
      toast.error('Guarda tus cambios de configuración antes de abrir la tienda.');
      return;
    }
    if (!open && !(await confirm({ title: '¿Cerrar la tienda?', description: 'Nadie podrá comprar hasta que la abras de nuevo. Los pedidos que ya hicieron se siguen atendiendo.', confirmLabel: 'Cerrar la tienda', destructive: true }))) return;
    setToggling(true);
    try {
      const result = await setStoreOpenAction(siteId, open);
      if (result.success) {
        toast.success(result.message ?? 'Listo');
        setSettings((current) => ({ ...current, enabled: open }));
        setReadiness(result.data);
      } else {
        toast.error(result.error);
        await refreshReadiness();
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setToggling(false);
    }
  }

  const site = sites.find((entry) => entry.id === siteId);
  const settingsTab = tab === 'shipping' || tab === 'payments' || tab === 'settings';
  const requiredItems = readiness.items.filter((item) => item.required);
  const completed = requiredItems.filter((item) => item.ok).length;
  const setupTab: Record<string, StoreTab> = { warehouse: 'settings', products: 'products', payments: 'payments', delivery: 'shipping', terms: 'settings', support: 'settings', stock: 'products' };
  const optionalMissing = readiness.items.filter((item) => !item.required && !item.ok);

  return (
    <div className="space-y-6">
      <section aria-label="Estado de la tienda" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {sites.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-medium">
              Tienda
              <select className={cn(nativeSelectClass, 'w-auto')} value={siteId} onChange={(event) => router.push(`/dashboard/store?sitio=${encodeURIComponent(event.target.value)}`)}>
                {sites.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}{entry.open ? ' · abierta' : ''}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm font-medium">{settings.siteName}</p>
          )}
          <StatusBadge tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'Abierta al público' : 'Cerrada'}</StatusBadge>
          {site?.status === 'DRAFT' && <StatusBadge tone="warning">Sitio sin publicar</StatusBadge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settings.enabled && (
            <a href={`/web/${settings.siteSlug}/tienda`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4">
              Ver tienda <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          )}
          {canManage && (
            <Button variant={settings.enabled ? 'outline' : 'default'} disabled={toggling || (!settings.enabled && !readiness.canOpen)} title={!settings.enabled && !readiness.canOpen ? 'Completa lo obligatorio de «Qué le falta» para abrirla' : undefined} onClick={toggleOpen}>
              {toggling ? 'Un momento…' : settings.enabled ? 'Cerrar la tienda' : 'Abrir la tienda'}
            </Button>
          )}
        </div>
      </section>

      {(!settings.enabled || optionalMissing.length > 0) && (
        <details open={!readiness.canOpen} className="rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Qué le falta {readiness.missing.length > 0 ? `(${readiness.missing.length} ${readiness.missing.length === 1 ? 'cosa obligatoria' : 'cosas obligatorias'})` : optionalMissing.length > 0 ? `(${optionalMissing.length} ${optionalMissing.length === 1 ? 'recomendación' : 'recomendaciones'})` : '· todo listo'}
          </summary>
          <div className="mt-4 flex items-center gap-3"><progress aria-label="Configuración de la tienda" value={completed} max={requiredItems.length || 1} className="h-2 grow accent-primary" /><span className="text-xs text-muted-foreground">{completed} de {requiredItems.length} pasos listos</span></div>
          <ul className="mt-4 space-y-4">
            {readiness.items.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-sm">
                {item.ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Listo" /> : item.required ? <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Falta, es obligatorio" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Recomendado" />}
                <span className="min-w-0">
                  <span className={cn(item.ok && 'text-muted-foreground')}>{item.label}{!item.ok && !item.required ? ' (recomendado)' : ''}</span>
                  {!item.ok && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                </span>
                {!item.ok && setupTab[item.key] && <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => selectTab(setupTab[item.key]!)}>Configurar</Button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Vendido hoy" value={formatCurrency(stats.salesToday)} icon={Wallet} tone="success" trend={undefined} hint={`${stats.paidToday} ${stats.paidToday === 1 ? 'pedido pagado' : 'pedidos pagados'}`} />
        <KpiCard label="Por confirmar pago" value={String(stats.toConfirm)} icon={Hourglass} tone={stats.toConfirm > 0 ? 'warning' : 'neutral'} hint="Transferencias y pagos al retirar" />
        <KpiCard label="Por preparar" value={String(stats.toPrepare)} icon={PackageCheck} tone={stats.toPrepare > 0 ? 'info' : 'neutral'} hint="Listos para que los armes" />
        <KpiCard label="Requieren atención" value={String(stats.attention)} icon={AlertTriangle} tone={stats.attention > 0 ? 'danger' : 'neutral'} hint="Una venta sin emitir o un pago tardío" />
      </div>

      <div role="tablist" aria-label="Secciones de la tienda" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1.5">
        {TABS.map((entry) => (
          <button key={entry.value} type="button" role="tab" aria-selected={tab === entry.value} onClick={() => selectTab(entry.value)} className={cn('min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors', tab === entry.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {entry.label}
            {entry.value !== 'orders' && entry.value !== 'products' && dirty && <span aria-label="con cambios sin guardar" className="ml-1 text-warning">●</span>}
          </button>
        ))}
      </div>

      {tab === 'brand' && <StoreBrandPanel siteId={siteId} canManage={canManage} />}
      {tab === 'orders' && <OrdersPanel siteId={siteId} canWrite={canWrite} canFulfill={canFulfill} canManage={canManage} onStats={onStats} />}
      {tab === 'products' && <ProductsPanel siteId={siteId} canWrite={canWrite} canUploadImages={canUploadImages} onChanged={refreshReadiness} />}
      {tab === 'shipping' && <ShippingPanel draft={draft} patch={patch} settings={settings} disabled={!canManage || saving} />}
      {tab === 'payments' && <PaymentsPanel draft={draft} patch={patch} settings={settings} disabled={!canManage || saving} />}
      {tab === 'settings' && <GeneralPanel draft={draft} patch={patch} settings={settings} disabled={!canManage || saving} warehouses={warehouses} />}

      {settingsTab && !canManage && <p className="text-sm text-muted-foreground">Solo el dueño y los administradores pueden cambiar la configuración de la tienda.</p>}
      {settingsTab && canManage && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur" role="region" aria-label="Guardar configuración">
          <p className="text-sm text-muted-foreground" aria-live="polite">{dirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}</p>
          <span className="flex gap-2">
            {dirty && <Button variant="outline" disabled={saving} onClick={() => setDraft(draftFrom(settings))}>Descartar</Button>}
            <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
          </span>
        </div>
      )}
    </div>
  );
}
