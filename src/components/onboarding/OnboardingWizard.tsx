'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import type { Role } from '@prisma/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateCompanyProfileAction, updateCompanySettingsAction, getCompanySettingsAction, getCompanyProfileAction } from '@/lib/actions/company';
import { getSetupReadinessAction } from '@/modules/setup/actions/setup.actions';
import type { SetupItemId, SetupReadinessReport } from '@/lib/setup/readiness';
import { openAssistant } from '@/components/shared/assistant-events';
import { isOnboardingDismissed, onboardingStorageKey, setOnboardingWizardOpen } from './onboarding-state';
import { createWarehouseAction } from '@/modules/inventory/actions/inventory.actions';
import { createCashRegisterAction } from '@/modules/pos/actions/pos.actions';
import { inviteUserAction } from '@/lib/actions/users';
import type { IndustryType } from '@prisma/client';

const INDUSTRY_OPTIONS: { value: IndustryType; label: string }[] = [
  { value: 'SERVICES', label: 'Servicios' },
  { value: 'COMMERCE', label: 'Comercio' },
  { value: 'DISTRIBUTION', label: 'Distribución' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'LIGHT_MANUFACTURING', label: 'Manufactura ligera' },
];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'ACCOUNTANT', label: 'Contador' },
  { value: 'SALES', label: 'Ventas' },
  { value: 'WAREHOUSE', label: 'Bodega' },
];

// `items` (valor -> etiqueta) es lo que le permite a `Select.Value` mostrar
// el texto correcto ANTES de que el usuario abra el desplegable — sin esto
// muestra el valor crudo del enum (ej. "COMMERCE" en vez de "Comercio").
const INDUSTRY_ITEMS = Object.fromEntries(INDUSTRY_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_ITEMS = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));

type StepId = 'tax' | 'warehouse' | 'catalog' | 'invite';

const STEP_LABELS: Record<StepId, string> = {
  tax: 'Datos tributarios',
  warehouse: 'Bodega y caja',
  catalog: 'Catálogo',
  invite: 'Invitar equipo',
};

/** Ítem de "Primeros pasos" que indica que el paso ya está resuelto (para mostrar ✓). */
const STEP_DONE_ITEM: Record<StepId, SetupItemId | null> = {
  tax: 'company-profile',
  warehouse: 'cash-register',
  catalog: 'products',
  invite: 'team',
};

interface OnboardingWizardProps {
  companyId: string;
  hasPos: boolean;
  /** Inventario contratado: sin él no hay bodega ni catálogo que configurar. */
  hasInventory: boolean;
  /** Multibodega contratado: solo entonces se puede crear una bodega adicional. */
  hasMultipleWarehouses: boolean;
  defaultWarehouseId: string | null;
  /** Si se auto-abre al montar (empresa "elegible" según `getOnboardingStatus` + no descartado antes). Reabrir a mano (evento `REOPEN_EVENT`) funciona siempre, sin importar esto. */
  autoOpen: boolean;
}

/** Nombre del evento para reabrir la guía a mano desde cualquier otra pantalla — ver `ReopenOnboardingButton.tsx` (Configuración). */
export const REOPEN_ONBOARDING_EVENT = 'erp:reopen-onboarding';

/**
 * No hay campo "onboarding completado" en el schema (ver plan): la
 * elegibilidad ya se decidió server-side con una heurística
 * (`getOnboardingStatus`) antes de montar este componente. Acá solo se
 * recuerda, por navegador, que el usuario ya lo cerró — así no reaparece en
 * cada carga del dashboard mientras la empresa siga "vacía" según esa misma
 * heurística.
 *
 * Reabrir a mano es independiente de esa heurística: una vez que la empresa
 * deja de ser "elegible" (ya cargó un producto, invitó a alguien, etc.), la
 * única forma de volver a ver la guía era borrar `localStorage` a mano — acá
 * "Ver guía de configuración" en Configuración funciona siempre, sin
 * importar la elegibilidad ni lo que haya en `localStorage`.
 *
 * Los pasos dependen de los módulos contratados, y cada uno muestra ✓ si el
 * dato real ya existe (mismo checklist de "Primeros pasos" del Inicio).
 */
export default function OnboardingWizard({ companyId, hasPos, hasInventory, hasMultipleWarehouses, defaultWarehouseId, autoOpen }: OnboardingWizardProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [report, setReport] = useState<SetupReadinessReport | null>(null);

  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = ['tax'];
    // La bodega principal ya existe: solo hay algo que hacer si se puede sumar otra o si hay caja.
    if ((hasInventory && hasMultipleWarehouses) || hasPos) list.push('warehouse');
    if (hasInventory) list.push('catalog');
    list.push('invite');
    return list;
  }, [hasInventory, hasMultipleWarehouses, hasPos]);

  const refreshReadiness = useCallback(async () => {
    const result = await getSetupReadinessAction();
    if (result.success) setReport(result.data);
  }, []);

  const openWizard = useCallback(() => {
    setStepIndex(0);
    setFinished(false);
    setOpen(true);
    setOnboardingWizardOpen(true);
  }, []);

  useEffect(() => {
    if (!autoOpen) return;
    if (!isOnboardingDismissed(companyId)) openWizard();
  }, [autoOpen, companyId, openWizard]);

  useEffect(() => {
    window.addEventListener(REOPEN_ONBOARDING_EVENT, openWizard);
    return () => window.removeEventListener(REOPEN_ONBOARDING_EVENT, openWizard);
  }, [openWizard]);

  // El avance real se lee al abrir: así los pasos ya resueltos aparecen con ✓.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSetupReadinessAction().then((result) => {
      if (!cancelled && result.success) setReport(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function dismiss() {
    try {
      window.localStorage.setItem(onboardingStorageKey(companyId), '1');
    } catch {
      // Sin storage, simplemente reaparecerá la próxima vez — degradación aceptable.
    }
    setOpen(false);
    setOnboardingWizardOpen(false);
  }

  const doneIds = new Set((report?.items ?? []).filter((item) => item.status === 'ok').map((item) => item.id));
  const isStepDone = (id: StepId): boolean => {
    const itemId = STEP_DONE_ITEM[id];
    return itemId !== null && doneIds.has(itemId);
  };

  const currentId = steps[stepIndex] ?? steps[steps.length - 1]!;
  const isLast = stepIndex >= steps.length - 1;
  const goNext = () => {
    if (isLast) setFinished(true);
    else setStepIndex(stepIndex + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) dismiss(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{finished ? '¡Listo para partir!' : 'Configuremos tu empresa'}</DialogTitle>
          <DialogDescription>
            {finished
              ? 'Lo que no alcanzaste a hacer queda en tu lista de Primeros pasos.'
              : `${steps.length === 1 ? 'Un paso rápido' : `${steps.length} pasos rápidos`} para dejar el ERP listo para operar. Puedes omitir cualquiera y volver después desde Configuración.`}
          </DialogDescription>
        </DialogHeader>

        {finished ? (
          <FinishPanel onClose={dismiss} />
        ) : (
          <>
            <ol className="flex flex-wrap gap-1.5" aria-label="Pasos">
              {steps.map((id, index) => {
                const done = isStepDone(id);
                const active = index === stepIndex;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setStepIndex(index)}
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        active ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {done ? <CheckCircle2 className="size-3.5 text-success" aria-label="Hecho" /> : <span className="tabular-nums">{index + 1}.</span>}
                      {STEP_LABELS[id]}
                    </button>
                  </li>
                );
              })}
            </ol>

            <ProgressRow label={STEP_LABELS[currentId]} value={((stepIndex + 1) / steps.length) * 100} className="mb-2" />

            {currentId === 'tax' && <StepTaxData done={isStepDone('tax')} onSaved={refreshReadiness} onDone={goNext} />}
            {currentId === 'warehouse' && (
              <StepWarehousePos
                hasPos={hasPos}
                canAddWarehouse={hasInventory && hasMultipleWarehouses}
                defaultWarehouseId={defaultWarehouseId}
                posDone={doneIds.has('cash-register')}
                onChanged={refreshReadiness}
                onDone={goNext}
              />
            )}
            {currentId === 'catalog' && <StepCatalog done={isStepDone('catalog')} onNavigate={dismiss} onDone={goNext} />}
            {currentId === 'invite' && <StepInvite done={isStepDone('invite')} onInvited={refreshReadiness} onDone={() => setFinished(true)} />}

            <DialogFooter className="justify-between">
              <Button type="button" variant="ghost" onClick={dismiss}>Cerrar</Button>
              {!isLast && (
                <Button type="button" variant="outline" onClick={goNext}>Omitir este paso</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cierre: dónde sigue el trabajo (la tarjeta "Primeros pasos" del Inicio) y dónde pedir ayuda. */
function FinishPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        En <span className="font-medium text-foreground">Inicio</span> te dejamos la tarjeta <span className="font-medium text-foreground">Primeros pasos</span>: se
        marca sola con lo que ya hiciste y te muestra, en orden, lo que falta (productos, folios, caja, equipo…). Puedes ocultarla y volver a mostrarla cuando quieras.
      </div>
      <p className="text-sm text-muted-foreground">
        ¿Dudas más adelante? Abre el botón <span className="font-medium text-foreground">Asistente</span> de la barra superior: te explica paso a paso cómo hacer algo, o lo hace por ti si se lo pides.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard#primeros-pasos" onClick={onClose} className={buttonVariants()}>
          Ver mis primeros pasos
        </Link>
        <Button type="button" variant="outline" onClick={() => { onClose(); openAssistant('¿Por dónde empiezo?'); }}>
          Preguntar al asistente
        </Button>
      </div>
    </div>
  );
}

function DoneNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

function StepTaxData({ done, onSaved, onDone }: { done: boolean; onSaved: () => void; onDone: () => void }) {
  const [rut, setRut] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [giro, setGiro] = useState('');
  const [address, setAddress] = useState('');
  const [comuna, setComuna] = useState('');
  const [actividadEconomicaCodigo, setActividadEconomicaCodigo] = useState('');
  const [industryType, setIndustryType] = useState<IndustryType>('COMMERCE');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Se parte de lo que la empresa ya tiene guardado: la acción exige RUT y
  // razón social, así que sin leerlos el guardado fallaba siempre.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCompanyProfileAction(), getCompanySettingsAction()]).then(([profile, settings]) => {
      if (cancelled) return;
      if (profile.success) {
        setRut(profile.data.rut);
        setBusinessName(profile.data.businessName);
        setGiro(profile.data.giro ?? '');
        setAddress(profile.data.address ?? '');
        setComuna(profile.data.comuna ?? '');
        setActividadEconomicaCodigo(profile.data.actividadEconomicaCodigo ?? '');
      }
      if (settings.success) setIndustryType(settings.data.industryType);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const profileResult = await updateCompanyProfileAction({
        rut,
        businessName,
        giro: giro.trim() || undefined,
        address: address.trim() || undefined,
        comuna: comuna.trim() || undefined,
        actividadEconomicaCodigo: actividadEconomicaCodigo.trim() || undefined,
      });
      if (!profileResult.success) {
        toast.error(profileResult.error);
        return;
      }
      // `updateCompanySettingsAction` exige el payload completo — se rellena
      // con lo que ya trae la fila (recién sembrada por `createTenant` con
      // los defaults del schema) más el único campo que este paso cambia.
      const current = await getCompanySettingsAction();
      if (!current.success) {
        toast.error(current.error);
        return;
      }
      const settingsResult = await updateCompanySettingsAction({
        industryType,
        allowNegativeStock: current.data.allowNegativeStock,
        ppmRateBasisPoints: current.data.ppmRateBasisPoints,
        honorariumRetentionBps: current.data.honorariumRetentionBps,
        fiscalYear: current.data.fiscalYear,
        purchaseApprovalThreshold: current.data.purchaseApprovalThreshold,
      });
      if (!settingsResult.success) {
        toast.error(settingsResult.error);
        return;
      }
      toast.success('Datos tributarios guardados');
      onSaved();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {done && <DoneNote>Los datos de tu empresa ya están completos. Puedes revisarlos o seguir al siguiente paso.</DoneNote>}
      <p className="text-sm text-muted-foreground">
        Estos datos salen impresos en tus facturas, boletas y cotizaciones, y el SII los pide. Tu RUT y razón social ({businessName || '...'}, {rut || '...'}) se cambian en Configuración → Perfil de Empresa.
      </p>
      <div>
        <Label htmlFor="onb-giro">Giro Comercial</Label>
        <Input id="onb-giro" value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Ej: Venta al por menor de..." />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="onb-address">Dirección</Label>
          <Input id="onb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle y número" />
        </div>
        <div>
          <Label htmlFor="onb-comuna">Comuna</Label>
          <Input id="onb-comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="onb-actividad">Código Actividad Económica (SII)</Label>
        <Input id="onb-actividad" value={actividadEconomicaCodigo} onChange={(e) => setActividadEconomicaCodigo(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="onb-industry">Industria</Label>
        <Select items={INDUSTRY_ITEMS} value={industryType} onValueChange={(value) => setIndustryType(value as IndustryType)}>
          <SelectTrigger id="onb-industry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" onClick={handleSave} disabled={saving || !loaded}>{saving ? 'Guardando...' : 'Guardar y continuar'}</Button>
    </div>
  );
}

function StepWarehousePos({
  hasPos,
  canAddWarehouse,
  defaultWarehouseId,
  posDone,
  onChanged,
  onDone,
}: {
  hasPos: boolean;
  canAddWarehouse: boolean;
  defaultWarehouseId: string | null;
  posDone: boolean;
  onChanged: () => void;
  onDone: () => void;
}) {
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseCode, setWarehouseCode] = useState('');
  const [cashRegisterName, setCashRegisterName] = useState('Caja Principal');
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [creatingCashRegister, setCreatingCashRegister] = useState(false);
  const [extraWarehouseId, setExtraWarehouseId] = useState<string | null>(null);

  async function handleCreateWarehouse() {
    if (!warehouseName.trim() || !warehouseCode.trim()) {
      toast.error('Nombre y código de la bodega son obligatorios');
      return;
    }
    setCreatingWarehouse(true);
    try {
      const result = await createWarehouseAction({ name: warehouseName, code: warehouseCode });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setExtraWarehouseId(result.data.id);
      toast.success('Bodega creada');
    } finally {
      setCreatingWarehouse(false);
    }
  }

  async function handleCreateCashRegister() {
    const warehouseId = extraWarehouseId ?? defaultWarehouseId;
    if (!warehouseId) {
      toast.error('No hay ninguna bodega disponible todavía');
      return;
    }
    setCreatingCashRegister(true);
    try {
      const result = await createCashRegisterAction({ name: cashRegisterName, warehouseId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Caja creada');
      onChanged();
    } finally {
      setCreatingCashRegister(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
        Ya creamos una bodega principal para tu empresa.
        {canAddWarehouse ? ' Puedes agregar otra si operas más de una ubicación.' : ''}
      </div>

      {canAddWarehouse && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="onb-wh-name">Nombre de bodega adicional</Label>
              <Input id="onb-wh-name" value={warehouseName} onChange={(e) => setWarehouseName(e.target.value)} placeholder="Sucursal Centro" />
            </div>
            <div>
              <Label htmlFor="onb-wh-code">Código</Label>
              <Input id="onb-wh-code" value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)} placeholder="SUC-CENTRO" />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleCreateWarehouse} disabled={creatingWarehouse}>
            {creatingWarehouse ? 'Creando...' : 'Crear bodega adicional'}
          </Button>
        </div>
      )}

      {hasPos && (
        <div className={canAddWarehouse ? 'border-t border-border pt-4' : undefined}>
          {posDone && <DoneNote>Ya tienes una caja creada. Puedes crear otra si la necesitas.</DoneNote>}
          <Label htmlFor="onb-caja" className={posDone ? 'mt-3' : undefined}>Nombre de la caja (Punto de Venta)</Label>
          <div className="mt-1 flex gap-2">
            <Input id="onb-caja" value={cashRegisterName} onChange={(e) => setCashRegisterName(e.target.value)} />
            <Button type="button" variant="outline" size="sm" onClick={handleCreateCashRegister} disabled={creatingCashRegister}>
              {creatingCashRegister ? 'Creando...' : 'Crear caja'}
            </Button>
          </div>
        </div>
      )}

      <Button type="button" onClick={onDone}>Continuar</Button>
    </div>
  );
}

function StepCatalog({ done, onNavigate, onDone }: { done: boolean; onNavigate: () => void; onDone: () => void }) {
  return (
    <div className="space-y-4">
      {done && <DoneNote>Ya tienes productos cargados. Puedes seguir sumando más desde el catálogo.</DoneNote>}
      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        Sin productos no puedes vender ni controlar stock. Puedes cargar tu catálogo ahora con el importador masivo (Excel/CSV), o hacerlo más tarde desde Configuración.
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/settings/import" onClick={onNavigate} className={buttonVariants()}>
          Abrir importador de catálogo
        </Link>
        <Button type="button" variant="outline" onClick={onDone}>{done ? 'Continuar' : 'Lo hago después'}</Button>
      </div>
    </div>
  );
}

function StepInvite({ done, onInvited, onDone }: { done: boolean; onInvited: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('ACCOUNTANT');
  const [sending, setSending] = useState(false);

  async function handleInvite() {
    if (!email.trim()) {
      toast.error('Ingresa un correo electrónico');
      return;
    }
    setSending(true);
    try {
      const result = await inviteUserAction({ email, role });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Invitación enviada');
      onInvited();
      onDone();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {done && <DoneNote>Ya invitaste a alguien más. Puedes invitar a otra persona o terminar.</DoneNote>}
      <p className="text-sm text-muted-foreground">Invita a tu primer colaborador o contador — recibirá un correo para crear su cuenta.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="onb-invite-email">Correo electrónico</Label>
          <Input id="onb-invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contador@empresa.cl" />
        </div>
        <div>
          <Label htmlFor="onb-invite-role">Rol</Label>
          <Select items={ROLE_ITEMS} value={role} onValueChange={(value) => setRole(value as Role)}>
            <SelectTrigger id="onb-invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={handleInvite} disabled={sending}>{sending ? 'Enviando...' : 'Enviar invitación'}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Terminar sin invitar</Button>
      </div>
      <p className="border-t border-border pt-3 text-sm text-muted-foreground">
        ¿Dudas más adelante? Usa el botón <span className="font-medium text-foreground">Asistente</span> de la barra superior: te explica cómo hacer algo paso a paso, o lo hace por ti si se lo pides.
      </p>
    </div>
  );
}
