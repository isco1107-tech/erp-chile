'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { TenantStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  setTenantStatusAction,
  updateTenantPlanAction,
} from '@/modules/platform/actions/platform.actions';
import {
  PLAN_NAMES,
  PLAN_PRESETS,
  TENANT_STATUSES,
  TENANT_STATUS_LABELS,
} from '@/modules/platform/schema';
import { type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { EXTRA_USER_PRICE, PRICED_MODULES } from '@/lib/pricing/catalog';
import { MAX_WAREHOUSES, inferPlanName, planListPrice, tenantListPrice } from '@/lib/pricing/presets';
import { calculateIva } from '@/lib/chile/tax';
import { formatCurrency } from '@/lib/chile/tax';
import { buildModuleCatalog, type CatalogItem } from '@/lib/navigation/module-catalog';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useConfirm } from '@/components/ui/confirm-provider';
const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface Props {
  companyId: string;
  companyName: string;
  initialStatus: TenantStatus;
  initialPlanName: string;
  initialMaxUsers: number;
  initialMaxWarehouses: number;
  initialFeatures: CompanyFeatureFlags;
  initialDisabledNavItems: string[];
  userCount: number;
  warehouseCount: number;
}

/** Catálogo por área (puro, derivado de los registros de menú y módulos). */
const CATALOG = buildModuleCatalog();

/** Interruptor accesible con apariencia de switch. */
function Toggle({
  checked,
  onChange,
  id,
  label,
  disabled = false,
  small = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id: string;
  label: string;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        small ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0 rounded-full bg-white shadow transition-transform',
          small ? 'size-4' : 'size-5',
          checked ? (small ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

/** Una pantalla del menú con su interruptor "visible en el menú". */
function ScreenRow({ item, visible, blocked, onChange }: { item: CatalogItem; visible: boolean; blocked: boolean; onChange: (visible: boolean) => void }) {
  return (
    <li className={cn('flex items-center justify-between gap-3 py-1.5 pl-3', blocked && 'opacity-50')}>
      <span className="text-sm">
        {item.label}
        {item.locked && <span className="ml-2 text-xs text-muted-foreground">siempre visible</span>}
      </span>
      <Toggle id={`screen-${item.id}`} label={`${item.label}: visible en el menú`} checked={item.locked || visible} disabled={item.locked || blocked} small onChange={onChange} />
    </li>
  );
}

/** Precio de lista del ítem del tarifario que activa este módulo (si se vende). */
function priceLabel(key: FeatureKey): string | null {
  const item = PRICED_MODULES.find((m) => m.grants.includes(key));
  return item ? `Lista: ${formatCurrency(item.price)} + IVA/mes${item.grants.length > 1 ? ` (precio único de «${item.label}»)` : ''}` : null;
}

export default function TenantModulesForm(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();

  const [features, setFeatures] = useState<CompanyFeatureFlags>(props.initialFeatures);
  const [hiddenScreens, setHiddenScreens] = useState<Set<string>>(() => new Set(props.initialDisabledNavItems));
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => new Set());
  const toggleArea = (label: string) =>
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const setScreenVisible = (id: string, visible: boolean) =>
    setHiddenScreens((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  const [planName, setPlanName] = useState(props.initialPlanName);
  const [maxUsers, setMaxUsers] = useState(String(props.initialMaxUsers));
  const [maxWarehouses, setMaxWarehouses] = useState(String(props.initialMaxWarehouses));
  const [status, setStatus] = useState<TenantStatus>(props.initialStatus);
  const [saving, setSaving] = useState(false);

  const listPrice = tenantListPrice(planName, features, Number(maxUsers) || 0);
  const fit = inferPlanName(features, Number(maxUsers) || 0);

  function applyPreset(name: string) {
    setPlanName(name);
    const preset = PLAN_PRESETS[name as keyof typeof PLAN_PRESETS];
    if (!preset) return;
    setFeatures({ ...preset.features });
    setMaxUsers(String(preset.maxUsers));
    setMaxWarehouses(String(preset.maxWarehouses));
  }

  function toggleModule(key: FeatureKey, value: boolean) {
    // Lo que se vende como un solo ítem (Entradas y votación del público) se
    // enciende y se apaga junto: no se contrata una mitad.
    const bundle = PRICED_MODULES.find((m) => m.grants.includes(key))?.grants ?? [key];
    setFeatures((prev) => ({ ...prev, ...Object.fromEntries(bundle.map((k) => [k, value])) }));
  }

  async function handleSave() {
    const users = Number(maxUsers);
    const warehouses = Number(maxWarehouses);

    if (!Number.isInteger(users) || users < 1) {
      toast.error('El máximo de usuarios debe ser un entero mayor a cero');
      return;
    }
    if (!Number.isInteger(warehouses) || warehouses < 1 || warehouses > MAX_WAREHOUSES) {
      toast.error(`El máximo de bodegas debe ser un entero entre 1 y ${MAX_WAREHOUSES}`);
      return;
    }
    // Bajar el límite por debajo de lo ya usado no borra nada, pero deja al
    // cliente sin poder invitar. Se avisa antes de guardar.
    if (users < props.userCount && !await confirm(
      `La empresa ya tiene ${props.userCount} usuarios y estás fijando el máximo en ${users}. No se eliminará a nadie, pero no podrá invitar hasta liberar cupos. ¿Continuar?`
    )) {
      return;
    }
    if (warehouses < props.warehouseCount && !await confirm(
      `La empresa ya tiene ${props.warehouseCount} bodegas y estás fijando el máximo en ${warehouses}. ¿Continuar?`
    )) {
      return;
    }

    setSaving(true);
    try {
      const result = await updateTenantPlanAction(props.companyId, {
        planName,
        maxUsers: users,
        maxWarehouses: warehouses,
        features,
        disabledNavItems: [...hiddenScreens],
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cambios guardados');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(next: TenantStatus) {
    if (
      (next === 'SUSPENDED' || next === 'CANCELLED') &&
      !await confirm(`Se cortará el acceso de todos los usuarios de ${props.companyName} de inmediato. ¿Continuar?`)
    ) {
      return;
    }

    const previous = status;
    setStatus(next);
    const result = await setTenantStatusAction(props.companyId, { status: next });
    if (!result.success) {
      setStatus(previous);
      toast.error(result.error);
      return;
    }
    toast.success('Estado actualizado');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold">Estado de la cuenta</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              className={selectClass}
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as TenantStatus)}
            >
              {TENANT_STATUSES.map((value) => (
                <option key={value} value={value}>{TENANT_STATUS_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Solo <strong>Activa</strong> y <strong>Prueba</strong> permiten operar. Los demás estados envían a
            todos sus usuarios a la pantalla de cuenta suspendida.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold">Plan y límites</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="planName">Plan</Label>
            <select id="planName" className={selectClass} value={planName} onChange={(e) => applyPreset(e.target.value)}>
              {!PLAN_NAMES.includes(planName) && <option value={planName}>{planName} (plan anterior)</option>}
              {PLAN_NAMES.map((plan) => (
                <option key={plan} value={plan}>{plan} — {formatCurrency(planListPrice(plan) ?? 0)} + IVA/mes</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Cambiar el plan precarga módulos y límites.</p>
          </div>
          <div>
            <Label htmlFor="maxUsers">Máximo de usuarios</Label>
            <Input id="maxUsers" type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">En uso: {props.userCount}</p>
          </div>
          <div>
            <Label htmlFor="maxWarehouses">Máximo de bodegas</Label>
            <Input
              id="maxWarehouses"
              type="number"
              min={1}
              max={MAX_WAREHOUSES}
              value={maxWarehouses}
              onChange={(e) => setMaxWarehouses(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">En uso: {props.warehouseCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Precio de lista</h2>
        {listPrice ? (
          <div className="space-y-1 text-sm">
            <p>
              Plan {planName}: {formatCurrency(listPrice.planPrice)}
              {listPrice.extras.map((m) => ` + ${m.label} ${formatCurrency(m.price)}`).join('')}
              {listPrice.extraUsers > 0 && ` + ${listPrice.extraUsers} usuario(s) adicional(es) ${formatCurrency(listPrice.extraUsers * EXTRA_USER_PRICE)}`}
            </p>
            <p className="font-semibold">
              {formatCurrency(listPrice.net)} + IVA al mes ({formatCurrency(listPrice.net + calculateIva(listPrice.net))} con IVA)
            </p>
            {listPrice.missingFromPlan.length > 0 && (
              <p className="text-xs text-warning">
                Tiene apagados módulos que trae el plan ({listPrice.missingFromPlan.map((m) => m.label).join(', ')}); el precio del plan no se rebaja por eso.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            El plan «{planName}» ya no se ofrece, así que no hay precio de lista. Elige uno de los planes vigentes para ver cuánto corresponde.
          </p>
        )}
        {fit.planName !== planName && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="min-w-0 flex-1">
              Según los módulos que tiene encendidos le corresponde el plan <strong>{fit.planName}</strong>
              {fit.price.extras.length > 0 && ` + ${fit.price.extras.map((m) => m.label).join(', ')}`}: {formatCurrency(fit.price.net)} + IVA al mes.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setPlanName(fit.planName)}>
              Usar «{fit.planName}»
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Referencial: es la lista pública de Configuración → Planes y módulos. Aether no cobra desde aquí.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Módulos por área</h2>
            <p className="text-xs text-muted-foreground">
              <strong>Módulo</strong>: lo contratado; apagado, sus rutas y permisos quedan bloqueados para toda la empresa, incluido el Dueño.{' '}
              <strong>Pantalla</strong>: si aparece en el menú de la empresa; apagada, deja de verse y su ruta muestra &quot;sección desactivada&quot;.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpenAreas(new Set(CATALOG.map((a) => a.label)))}>
              Expandir todo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpenAreas(new Set())}>
              Contraer todo
            </Button>
          </div>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {CATALOG.map((area) => {
            const open = openAreas.has(area.label);
            const activeModules = area.modules.filter((mod) => features[mod.key]).length;
            const screens = [...area.modules.flatMap((mod) => mod.items), ...area.baseItems];
            const hiddenCount = screens.filter((item) => !item.locked && hiddenScreens.has(item.id)).length;
            const panelId = `area-${area.label.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <section key={area.label}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleArea(area.label)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span>
                    <span className="text-sm font-semibold">{area.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {area.modules.length > 0 && `${activeModules} de ${area.modules.length} módulo${area.modules.length === 1 ? '' : 's'}`}
                      {area.modules.length > 0 && screens.length > 0 && ' · '}
                      {screens.length > 0 && `${screens.length - hiddenCount} de ${screens.length} pantalla${screens.length === 1 ? '' : 's'} en el menú`}
                    </span>
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
                </button>
                {open && (
                  <div id={panelId} className="space-y-3 px-4 pb-4">
                    {area.modules.map((mod) => (
                      <div key={mod.key} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <Label htmlFor={`toggle-${mod.key}`} className="text-sm font-medium">
                              {mod.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">{mod.description}</p>
                            {priceLabel(mod.key) && <p className="text-xs font-medium text-foreground">{priceLabel(mod.key)}</p>}
                          </div>
                          <Toggle id={`toggle-${mod.key}`} label={`${mod.label}: módulo contratado`} checked={features[mod.key]} onChange={(value) => toggleModule(mod.key, value)} />
                        </div>
                        {mod.items.length > 0 && (
                          <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">
                            {mod.items.map((item) => (
                              <ScreenRow key={item.id} item={item} visible={!hiddenScreens.has(item.id)} blocked={!features[mod.key]} onChange={(v) => setScreenVisible(item.id, v)} />
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    {area.baseItems.length > 0 && (
                      <div className="rounded-lg border border-dashed border-border p-3">
                        <p className="text-sm font-medium">Incluido en todo plan</p>
                        <p className="text-xs text-muted-foreground">No depende de un módulo: se muestra u oculta del menú de la empresa.</p>
                        <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">
                          {area.baseItems.map((item) => (
                            <ScreenRow key={item.id} item={item} visible={!hiddenScreens.has(item.id)} blocked={false} onChange={(v) => setScreenVisible(item.id, v)} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar plan, módulos y menú'}
        </Button>
      </div>
    </div>
  );
}
