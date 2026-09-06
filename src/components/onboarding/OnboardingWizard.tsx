'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateCompanyProfileAction, updateCompanySettingsAction, getCompanySettingsAction } from '@/lib/actions/company';
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

const STEP_LABELS = ['Datos tributarios', 'Bodega y POS', 'Catálogo', 'Invitar equipo'];

function storageKey(companyId: string): string {
  return `onboarding-dismissed:${companyId}`;
}

interface OnboardingWizardProps {
  companyId: string;
  hasPos: boolean;
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
 */
export default function OnboardingWizard({ companyId, hasPos, defaultWarehouseId, autoOpen }: OnboardingWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!autoOpen) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey(companyId)) === '1';
    } catch {
      // Storage no disponible (navegación privada estricta, etc): mejor mostrar el wizard que reventar.
    }
    if (!dismissed) setOpen(true);
  }, [autoOpen, companyId]);

  useEffect(() => {
    function handleReopen() {
      setStep(1);
      setOpen(true);
    }
    window.addEventListener(REOPEN_ONBOARDING_EVENT, handleReopen);
    return () => window.removeEventListener(REOPEN_ONBOARDING_EVENT, handleReopen);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(companyId), '1');
    } catch {
      // Sin storage, simplemente reaparecerá la próxima vez — degradación aceptable.
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) dismiss(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configuremos tu empresa</DialogTitle>
          <DialogDescription>Cuatro pasos rápidos para dejar el ERP listo para operar. Puedes omitir cualquiera y volver después desde Configuración.</DialogDescription>
        </DialogHeader>

        <ProgressRow label={STEP_LABELS[step - 1]!} value={(step / STEP_LABELS.length) * 100} className="mb-4" />

        {step === 1 && <StepTaxData onDone={() => setStep(2)} />}
        {step === 2 && <StepWarehousePos hasPos={hasPos} defaultWarehouseId={defaultWarehouseId} onDone={() => setStep(3)} />}
        {step === 3 && <StepCatalog onDone={() => setStep(4)} />}
        {step === 4 && <StepInvite onDone={dismiss} />}

        <DialogFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={dismiss}>Cerrar</Button>
          {step < STEP_LABELS.length && (
            <Button type="button" variant="outline" onClick={() => setStep(step + 1)}>Omitir este paso</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepTaxData({ onDone }: { onDone: () => void }) {
  const [giro, setGiro] = useState('');
  const [actividadEconomicaCodigo, setActividadEconomicaCodigo] = useState('');
  const [industryType, setIndustryType] = useState<IndustryType>('COMMERCE');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCompanySettingsAction().then((result) => {
      if (result.success) setIndustryType(result.data.industryType);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const profileResult = await updateCompanyProfileAction({ giro: giro || undefined, actividadEconomicaCodigo: actividadEconomicaCodigo || undefined });
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
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="onb-giro">Giro Comercial</Label>
        <Input id="onb-giro" value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Ej: Venta al por menor de..." />
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

function StepWarehousePos({ hasPos, defaultWarehouseId, onDone }: { hasPos: boolean; defaultWarehouseId: string | null; onDone: () => void }) {
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
    } finally {
      setCreatingCashRegister(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
        Ya creamos una bodega principal para tu empresa. Puedes agregar otra si operas más de una ubicación.
      </div>
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

      {hasPos && (
        <div className="border-t border-border pt-4">
          <Label htmlFor="onb-caja">Nombre de la caja (Punto de Venta)</Label>
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

function StepCatalog({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        Puedes cargar tu catálogo de productos ahora con el importador masivo (Excel/CSV), o hacerlo más tarde desde Configuración.
      </div>
      <div className="flex gap-2">
        <a
          href="/dashboard/settings/import"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Abrir importador de catálogo
        </a>
        <Button type="button" variant="outline" onClick={onDone}>Lo hago después</Button>
      </div>
    </div>
  );
}

function StepInvite({ onDone }: { onDone: () => void }) {
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
      onDone();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
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
        ¿Dudas más adelante? Usa el botón de ayuda flotante (ícono de interrogación, abajo a la izquierda) — te explica cómo hacer algo paso a paso, o lo hace por ti si se lo pides.
      </p>
    </div>
  );
}
