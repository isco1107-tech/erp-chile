'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Banknote, Clock4, Hourglass, Plus, Search, Users } from 'lucide-react';
import type { Employee } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { AFP_LABELS } from '@/lib/chile/payroll';
import { formatShortDate } from '@/lib/intelligence/format';
import { deleteEmployeeAction, getEmployeesAction, reactivateEmployeeAction, terminateEmployeeAction } from '@/modules/hr/actions/hr.actions';
import { CONTRACT_TYPE_LABELS } from '@/modules/hr/schema';
import type { EmployeeRecord, EmployeeRow, HrSummary } from '@/modules/hr/services/employees.service';
import { EMPTY_EMPLOYEE, EmployeeFormDialog, type EmployeeFormValues } from './EmployeeFormDialog';

function toDateInput(value: Date | string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function toForm(employee: EmployeeRecord): EmployeeFormValues {
  return {
    id: employee.id,
    rut: employee.rut,
    fullName: employee.fullName,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    birthDate: toDateInput(employee.birthDate),
    address: employee.address ?? '',
    position: employee.position,
    department: employee.department ?? '',
    hireDate: toDateInput(employee.hireDate),
    contractType: employee.contractType,
    weeklyHours: employee.weeklyHours,
    baseSalary: employee.baseSalary,
    gratificationMode: employee.gratificationMode,
    mealAllowance: employee.mealAllowance,
    transportAllowance: employee.transportAllowance,
    afp: employee.afp,
    healthInsurance: employee.healthInsurance,
    isapreName: employee.isapreName ?? '',
    isaprePlanUf: employee.isaprePlanUf ? String(employee.isaprePlanUf).replace('.', ',') : '',
    bankName: employee.bankName ?? '',
    bankAccountType: employee.bankAccountType ?? '',
    bankAccountNumber: employee.bankAccountNumber ?? '',
    nationality: employee.nationality ?? 'Chilena',
    notes: employee.notes ?? '',
  };
}

export function EmployeesClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<{ employees: EmployeeRow[]; summary: HrSummary } | null>(null);
  const [query, setQuery] = useState('');
  const [showTerminated, setShowTerminated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [formInitial, setFormInitial] = useState<EmployeeFormValues>(EMPTY_EMPLOYEE);
  const [terminating, setTerminating] = useState<EmployeeRow | null>(null);
  const [terminationDate, setTerminationDate] = useState('');

  const load = useCallback(async () => {
    const result = await getEmployeesAction();
    if (result.success) setData(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm(initial: EmployeeFormValues) {
    setFormInitial(initial);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.employees.filter(
      (e) => (showTerminated || e.status === 'ACTIVE') && (!q || [e.fullName, e.rut, e.position, e.department].some((t) => t?.toLowerCase().includes(q)))
    );
  }, [data, query, showTerminated]);

  async function handleTerminate() {
    if (!terminating) return;
    const result = await terminateEmployeeAction(terminating.id, { terminationDate });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Listo');
    setTerminating(null);
    await load();
  }

  async function handleDelete(employee: EmployeeRow) {
    const ok = await confirm({ title: `¿Eliminar a ${employee.fullName}?`, description: 'Solo es posible si no tiene liquidaciones. Si dejó la empresa, registra su término.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    const result = await deleteEmployeeAction(employee.id);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Eliminado');
    await load();
  }

  async function handleReactivate(employee: EmployeeRow) {
    const result = await reactivateEmployeeAction(employee.id);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Reactivado');
    await load();
  }

  if (!data) return <p className="text-sm text-muted-foreground">Cargando trabajadores…</p>;
  const { summary } = data;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Dotación activa" value={String(summary.activeCount)} icon={Users} tone="accent" />
        <KpiCard label="Sueldos base del mes" value={formatCurrency(summary.monthlyBasePayroll)} icon={Banknote} tone="info" />
        <KpiCard
          label="Costo empresa último cierre"
          value={summary.lastPeriod ? formatCurrency(summary.lastPeriod.employerCost) : '—'}
          icon={Clock4}
          tone="warning"
          trend={summary.lastPeriod ? `período ${summary.lastPeriod.label}` : undefined}
          hint="con aportes del empleador"
        />
        <KpiCard
          label="Antigüedad promedio"
          value={summary.averageTenureMonths === null ? '—' : `${(summary.averageTenureMonths / 12).toLocaleString('es-CL', { maximumFractionDigits: 1 })} años`}
          icon={Hourglass}
          tone="success"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, RUT o cargo" className="pl-8" aria-label="Buscar trabajadores" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showTerminated} onChange={(e) => setShowTerminated(e.target.checked)} className="accent-primary" />
          Mostrar desvinculados
        </label>
        {canWrite && (
          <Button type="button" className="ml-auto" onClick={() => openForm(EMPTY_EMPLOYEE)} data-tutorial="module-primary-action">
            <Plus aria-hidden="true" />
            Nuevo trabajador
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title={data.employees.length === 0 ? 'Aún no hay trabajadores registrados' : 'Sin resultados'}
            description={data.employees.length === 0 ? 'Crea la ficha de cada trabajador dependiente para calcular sus liquidaciones.' : 'Prueba con otra búsqueda.'}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Cargo</th>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">Previsión</th>
                <th className="px-3 py-2 text-right font-medium">Sueldo base</th>
                <th className="px-3 py-2 font-medium">Ingreso</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {canWrite && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((employee) => (
                <tr key={employee.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/hr/employees/${employee.id}`} className="font-medium text-foreground hover:underline">
                      {employee.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{employee.rut}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-foreground">{employee.position}</p>
                    {employee.department && <p className="text-xs text-muted-foreground">{employee.department}</p>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {CONTRACT_TYPE_LABELS[employee.contractType]} · {employee.weeklyHours} h
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {AFP_LABELS[employee.afp]} · {employee.healthInsurance === 'ISAPRE' ? (employee.isapreName ?? 'Isapre') : 'Fonasa'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(employee.baseSalary)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatShortDate(employee.hireDate)}</td>
                  <td className="px-3 py-2">
                    {employee.status === 'ACTIVE' ? (
                      <StatusBadge tone="success">Activo</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Desvinculado{employee.terminationDate ? ` · ${formatShortDate(employee.terminationDate)}` : ''}</StatusBadge>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => openForm(toForm(employee))}>
                          Editar
                        </Button>
                        {employee.status === 'ACTIVE' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTerminating(employee);
                              setTerminationDate('');
                            }}
                          >
                            Término
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="ghost" onClick={() => void handleReactivate(employee)}>
                            Reactivar
                          </Button>
                        )}
                        {employee._count.payslips === 0 && (
                          <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => void handleDelete(employee)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmployeeFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={formInitial} onSaved={() => void load()} />

      <Dialog open={terminating !== null} onOpenChange={(open) => !open && setTerminating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar término de contrato</DialogTitle>
            <DialogDescription>{terminating?.fullName}: deja de aparecer en las nóminas posteriores a esta fecha. Su historial se conserva.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="termination-date">Último día trabajado</Label>
            <Input id="termination-date" type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTerminating(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!terminationDate} onClick={() => void handleTerminate()}>
              Registrar término
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
