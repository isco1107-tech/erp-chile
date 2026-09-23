'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { AFP_INSTITUTIONS, AFP_LABELS, type AfpInstitutionKey } from '@/lib/chile/payroll';
import { saveEmployeeAction } from '@/modules/hr/actions/hr.actions';
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, GRATIFICATION_MODE_LABELS, GRATIFICATION_MODES } from '@/modules/hr/schema';

export interface EmployeeFormValues {
  id?: string;
  rut: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  position: string;
  department: string;
  hireDate: string;
  contractType: (typeof CONTRACT_TYPES)[number];
  weeklyHours: number;
  baseSalary: number;
  gratificationMode: (typeof GRATIFICATION_MODES)[number];
  mealAllowance: number;
  transportAllowance: number;
  afp: AfpInstitutionKey;
  healthInsurance: 'FONASA' | 'ISAPRE';
  isapreName: string;
  isaprePlanUf: string;
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  notes: string;
}

export const EMPTY_EMPLOYEE: EmployeeFormValues = {
  rut: '',
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
  address: '',
  position: '',
  department: '',
  hireDate: '',
  contractType: 'INDEFINIDO',
  weeklyHours: 42,
  baseSalary: 0,
  gratificationMode: 'ART_50',
  mealAllowance: 0,
  transportAllowance: 0,
  afp: 'HABITAT',
  healthInsurance: 'FONASA',
  isapreName: '',
  isaprePlanUf: '',
  bankName: '',
  bankAccountType: '',
  bankAccountNumber: '',
  notes: '',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Ficha del trabajador. El padre cambia la `key` en cada apertura para partir del `initial` recibido. */
export function EmployeeFormDialog({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; initial: EmployeeFormValues; onSaved: () => void }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...values,
        birthDate: values.birthDate || undefined,
        hireDate: values.hireDate || undefined,
        isaprePlanUf: values.healthInsurance === 'ISAPRE' && values.isaprePlanUf ? Number(values.isaprePlanUf.replace(',', '.')) : undefined,
      };
      const result = await saveEmployeeAction(initial.id ?? null, payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? 'Editar ficha del trabajador' : 'Nuevo trabajador'}</DialogTitle>
          <DialogDescription>Datos del contrato y de previsión con los que se calculan sus liquidaciones.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Datos personales">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="emp-rut">RUT</Label>
                <RutInput id="emp-rut" value={values.rut} onChange={(rut) => set('rut', rut)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="emp-name">Nombre completo</Label>
                <Input id="emp-name" value={values.fullName} onChange={(e) => set('fullName', e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="emp-birth">Fecha de nacimiento</Label>
                <Input id="emp-birth" type="date" value={values.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="emp-email">Correo</Label>
                <Input id="emp-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="emp-phone">Teléfono</Label>
                <Input id="emp-phone" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="emp-address">Dirección</Label>
                <Input id="emp-address" value={values.address} onChange={(e) => set('address', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="Contrato">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="emp-position">Cargo</Label>
                <Input id="emp-position" value={values.position} onChange={(e) => set('position', e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="emp-dept">Área</Label>
                <Input id="emp-dept" value={values.department} onChange={(e) => set('department', e.target.value)} placeholder="Ventas, Bodega…" />
              </div>
              <div>
                <Label htmlFor="emp-hire">Fecha de ingreso</Label>
                <Input id="emp-hire" type="date" value={values.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="emp-contract">Tipo de contrato</Label>
                <select id="emp-contract" className={nativeSelectClass} value={values.contractType} onChange={(e) => set('contractType', e.target.value as EmployeeFormValues['contractType'])}>
                  {CONTRACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CONTRACT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp-hours">Jornada semanal (horas)</Label>
                <Input id="emp-hours" type="number" min={1} max={45} value={values.weeklyHours} onChange={(e) => set('weeklyHours', Number(e.target.value))} />
              </div>
            </div>
          </Section>

          <Section title="Remuneración mensual">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="emp-salary">Sueldo base</Label>
                <CurrencyInput id="emp-salary" value={values.baseSalary} onChange={(v) => set('baseSalary', v)} />
              </div>
              <div>
                <Label htmlFor="emp-grat">Gratificación</Label>
                <select id="emp-grat" className={nativeSelectClass} value={values.gratificationMode} onChange={(e) => set('gratificationMode', e.target.value as EmployeeFormValues['gratificationMode'])}>
                  {GRATIFICATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {GRATIFICATION_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp-meal">Colación (no imponible)</Label>
                <CurrencyInput id="emp-meal" value={values.mealAllowance} onChange={(v) => set('mealAllowance', v)} />
              </div>
              <div>
                <Label htmlFor="emp-transport">Movilización (no imponible)</Label>
                <CurrencyInput id="emp-transport" value={values.transportAllowance} onChange={(v) => set('transportAllowance', v)} />
              </div>
            </div>
          </Section>

          <Section title="Previsión y salud">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="emp-afp">AFP</Label>
                <select id="emp-afp" className={nativeSelectClass} value={values.afp} onChange={(e) => set('afp', e.target.value as AfpInstitutionKey)}>
                  {AFP_INSTITUTIONS.map((afp) => (
                    <option key={afp} value={afp}>
                      {AFP_LABELS[afp]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp-health">Salud</Label>
                <select id="emp-health" className={nativeSelectClass} value={values.healthInsurance} onChange={(e) => set('healthInsurance', e.target.value as EmployeeFormValues['healthInsurance'])}>
                  <option value="FONASA">Fonasa</option>
                  <option value="ISAPRE">Isapre</option>
                </select>
              </div>
              {values.healthInsurance === 'ISAPRE' && (
                <>
                  <div>
                    <Label htmlFor="emp-isapre">Isapre</Label>
                    <Input id="emp-isapre" value={values.isapreName} onChange={(e) => set('isapreName', e.target.value)} placeholder="Nombre" />
                  </div>
                  <div>
                    <Label htmlFor="emp-plan">Plan (UF)</Label>
                    <Input id="emp-plan" inputMode="decimal" value={values.isaprePlanUf} onChange={(e) => set('isaprePlanUf', e.target.value)} placeholder="Ej.: 3,25" />
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section title="Pago">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="emp-bank">Banco</Label>
                <Input id="emp-bank" value={values.bankName} onChange={(e) => set('bankName', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="emp-acctype">Tipo de cuenta</Label>
                <select id="emp-acctype" className={nativeSelectClass} value={values.bankAccountType} onChange={(e) => set('bankAccountType', e.target.value)}>
                  <option value="">Sin especificar</option>
                  <option value="Cuenta corriente">Cuenta corriente</option>
                  <option value="Cuenta vista / RUT">Cuenta vista / RUT</option>
                  <option value="Cuenta de ahorro">Cuenta de ahorro</option>
                </select>
              </div>
              <div>
                <Label htmlFor="emp-accnum">N° de cuenta</Label>
                <Input id="emp-accnum" value={values.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="emp-notes">Notas</Label>
              <textarea id="emp-notes" className={textareaClass} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </Section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : initial.id ? 'Guardar cambios' : 'Crear trabajador'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
