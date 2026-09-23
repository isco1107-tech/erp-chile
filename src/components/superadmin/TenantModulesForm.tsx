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
import { MODULES, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';

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
  userCount: number;
  warehouseCount: number;
}

/** Interruptor accesible: es un checkbox real con apariencia de switch. */
function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export default function TenantModulesForm(props: Props) {
  const confirm = useConfirm();
  const router = useRouter();

  const [features, setFeatures] = useState<CompanyFeatureFlags>(props.initialFeatures);
  const [planName, setPlanName] = useState(props.initialPlanName);
  const [maxUsers, setMaxUsers] = useState(String(props.initialMaxUsers));
  const [maxWarehouses, setMaxWarehouses] = useState(String(props.initialMaxWarehouses));
  const [status, setStatus] = useState<TenantStatus>(props.initialStatus);
  const [saving, setSaving] = useState(false);

  function applyPreset(name: string) {
    setPlanName(name);
    const preset = PLAN_PRESETS[name as keyof typeof PLAN_PRESETS];
    if (!preset) return;
    setFeatures({ ...preset.features });
    setMaxUsers(String(preset.maxUsers));
    setMaxWarehouses(String(preset.maxWarehouses));
  }

  function toggleModule(key: FeatureKey, value: boolean) {
    setFeatures((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const users = Number(maxUsers);
    const warehouses = Number(maxWarehouses);

    if (!Number.isInteger(users) || users < 1) {
      toast.error('El máximo de usuarios debe ser un entero mayor a cero');
      return;
    }
    if (!Number.isInteger(warehouses) || warehouses < 1) {
      toast.error('El máximo de bodegas debe ser un entero mayor a cero');
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
              {!PLAN_NAMES.includes(planName as (typeof PLAN_NAMES)[number]) && (
                <option value={planName}>{planName} (personalizado)</option>
              )}
              {PLAN_NAMES.map((plan) => (
                <option key={plan} value={plan}>{plan}</option>
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
              value={maxWarehouses}
              onChange={(e) => setMaxWarehouses(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">En uso: {props.warehouseCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-1 text-sm font-semibold">Módulos contratados</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Al desactivar un módulo, sus rutas quedan bloqueadas y sus permisos dejan de aplicarse para todos los
          usuarios de la empresa, incluido el Dueño.
        </p>
        <div className="divide-y divide-border">
          {/*
            `hasAccounting` queda fuera a propósito: el módulo tiene schema,
            permisos y motor de asientos (src/modules/accounting/) pero CERO
            Server Actions y CERO pantalla en el dashboard — activarlo hoy le
            mostraría al cliente un módulo "contratado" sin nada usable
            detrás. Sacarlo de esta lista hasta que exista
            src/app/(dashboard)/dashboard/accounting/. No se toca el flag en
            sí ni CompanyFeatures: si algún día se activa a mano, el sistema
            lo sigue respetando, solo que nadie puede activarlo por error
            desde acá mientras tanto.
          */}
          {MODULES.filter((mod) => mod.key !== 'hasAccounting').map((mod) => (
            <div key={mod.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <Label htmlFor={`toggle-${mod.key}`} className="text-sm font-medium">{mod.label}</Label>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
              <Toggle
                id={`toggle-${mod.key}`}
                checked={features[mod.key]}
                onChange={(value) => toggleModule(mod.key, value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar plan y módulos'}
        </Button>
      </div>
    </div>
  );
}
