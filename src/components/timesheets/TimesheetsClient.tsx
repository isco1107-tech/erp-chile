'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, Pencil, Receipt, Timer, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { ContactSearchSelect, type ContactOption } from '@/components/shared/ContactSearchSelect';
import { formatCurrency } from '@/lib/chile/tax';
import { DTE_TYPE_LABELS } from '@/modules/sales/schema';
import { CONTRACT_DTE_TYPES } from '@/modules/contracts/schema';
import { entryAmount, formatMinutes, hoursToMinutes } from '@/modules/timesheets/schema';
import {
  billTimeEntriesAction,
  deleteTimeEntryAction,
  getTimesheetBoardAction,
  saveTimeEntryAction,
  type TimesheetBoard,
} from '@/modules/timesheets/actions/timesheets.actions';

type Range = 'week' | 'month' | 'last-month';
const RANGE_LABELS: Record<Range, string> = { week: 'Esta semana', month: 'Este mes', 'last-month': 'Mes pasado' };

/**
 * La fecha de un registro se guarda como medianoche UTC del día elegido (así
 * la envía un `<input type="date">`). Los límites del rango se arman igual,
 * con el calendario local del usuario pero en UTC; si no, el lunes a las
 * 00:00 de Chile (03:00 UTC) dejaba fuera los registros de ese mismo lunes.
 */
function rangeDates(range: Range): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (range === 'week') {
    const offset = (now.getDay() + 6) % 7; // lunes = 0
    const start = now.getDate() - offset;
    return { from: new Date(Date.UTC(y, m, start)), to: new Date(Date.UTC(y, m, start + 6, 23, 59, 59)) };
  }
  if (range === 'month') return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)) };
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
}

interface EntryForm {
  id: string | null;
  date: string;
  hours: string;
  contact: ContactOption | null;
  projectId: string;
  serviceContractId: string;
  description: string;
  billable: boolean;
  hourlyRate: number;
  userId: string;
}

const todayInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function TimesheetsClient() {
  const router = useRouter();
  const confirm = useConfirm();
  const [range, setRange] = useState<Range>('week');
  const [personFilter, setPersonFilter] = useState('');
  const [board, setBoard] = useState<TimesheetBoard | null>(null);
  const [form, setForm] = useState<EntryForm>({ id: null, date: todayInput(), hours: '', contact: null, projectId: '', serviceContractId: '', description: '', billable: true, hourlyRate: 0, userId: '' });
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<{ contactId: string; razonSocial: string } | null>(null);

  const load = useCallback(async () => {
    const { from, to } = rangeDates(range);
    const result = await getTimesheetBoardAction({ from, to, userId: personFilter || undefined });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setBoard(result.data);
    setForm((current) => (current.id === null && current.hourlyRate === 0 ? { ...current, hourlyRate: result.data.summary.lastRate } : current));
  }, [range, personFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const contractsForClient = useMemo(
    () => (board?.lookups.contracts ?? []).filter((contract) => !form.contact || contract.contactId === form.contact.id),
    [board, form.contact]
  );

  function resetForm() {
    setForm({ id: null, date: todayInput(), hours: '', contact: null, projectId: '', serviceContractId: '', description: '', billable: true, hourlyRate: board?.summary.lastRate ?? 0, userId: '' });
  }

  async function save() {
    const hours = Number(form.hours.replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error('Ingresa las horas (ej. 1,5 para una hora y media)');
      return;
    }
    setSaving(true);
    try {
      const result = await saveTimeEntryAction(form.id, {
        date: form.date,
        minutes: hoursToMinutes(hours),
        description: form.description,
        contactId: form.contact?.id,
        projectId: form.projectId || undefined,
        serviceContractId: form.serviceContractId || undefined,
        billable: form.billable,
        hourlyRate: form.hourlyRate,
        userId: form.userId || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: '¿Eliminar este registro de horas?', confirmLabel: 'Eliminar' }))) return;
    const result = await deleteTimeEntryAction(id);
    if (!result.success) toast.error(result.error);
    else {
      toast.success(result.message ?? 'Eliminado');
      await load();
    }
  }

  if (!board) return <p className="text-sm text-muted-foreground">Cargando horas…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((key) => (
          <Button key={key} type="button" size="sm" variant={range === key ? 'default' : 'outline'} onClick={() => setRange(key)}>
            {RANGE_LABELS[key]}
          </Button>
        ))}
        {board.canManage && board.lookups.users.length > 0 && (
          <select aria-label="Persona" className={`${nativeSelectClass} w-auto`} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">Todo el equipo</option>
            {board.lookups.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Horas del período" value={formatMinutes(board.summary.totalMinutes)} icon={Clock} tone="accent" />
        <KpiCard label="Facturables" value={formatMinutes(board.summary.billableMinutes)} icon={Timer} tone="info" />
        <KpiCard label="Por facturar (todas las fechas)" value={formatCurrency(board.summary.unbilledAmount)} icon={Wallet} tone="success" />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{form.id ? 'Editar registro' : 'Registrar horas'}</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <Label htmlFor="t-date">Fecha</Label>
            <Input id="t-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="t-hours">Horas</Label>
            <Input id="t-hours" inputMode="decimal" placeholder="1,5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="t-contact">Cliente</Label>
            <ContactSearchSelect id="t-contact" value={form.contact} onChange={(contact) => setForm({ ...form, contact, serviceContractId: '' })} kind="customer" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="t-desc">¿Qué hiciste?</Label>
            <Input id="t-desc" value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Reunión de avance, desarrollo, visita técnica…" />
          </div>
          {board.lookups.projects.length > 0 && (
            <div className="md:col-span-2">
              <Label htmlFor="t-project">Proyecto</Label>
              <select id="t-project" className={nativeSelectClass} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">Sin proyecto</option>
                {board.lookups.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {contractsForClient.length > 0 && (
            <div className="md:col-span-2">
              <Label htmlFor="t-contract">Contrato</Label>
              <select id="t-contract" className={nativeSelectClass} value={form.serviceContractId} onChange={(e) => setForm({ ...form, serviceContractId: e.target.value })}>
                <option value="">Sin contrato</option>
                {contractsForClient.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {board.canManage && board.lookups.users.length > 0 && (
            <div className="md:col-span-2">
              <Label htmlFor="t-user">Persona</Label>
              <select id="t-user" className={nativeSelectClass} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">Yo</option>
                {board.lookups.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2 md:col-span-2">
            <Switch checked={form.billable} onCheckedChange={(billable) => setForm({ ...form, billable })} label="Facturable" />
            <span className="pb-1 text-sm">Facturable</span>
          </div>
          {form.billable && (
            <div className="md:col-span-2">
              <Label htmlFor="t-rate">Tarifa por hora (neta)</Label>
              <CurrencyInput id="t-rate" value={form.hourlyRate} onChange={(hourlyRate) => setForm({ ...form, hourlyRate })} />
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {form.id && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancelar edición
            </Button>
          )}
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </div>
      </section>

      {board.canBill && board.summary.unbilledByClient.length > 0 && (
        <section className="rounded-xl border border-border">
          <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">Horas por facturar</h2>
          <ul className="divide-y divide-border">
            {board.summary.unbilledByClient.map((row) => (
              <li key={row.contactId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{row.razonSocial}</span>
                  <span className="ml-2 text-muted-foreground">
                    {formatMinutes(row.minutes)} · {row.entries} registro(s)
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatCurrency(row.amount)}</span>
                  <Button type="button" size="sm" onClick={() => setBilling({ contactId: row.contactId, razonSocial: row.razonSocial })}>
                    <Receipt aria-hidden="true" /> Facturar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {board.entries.length === 0 ? (
        <EmptyState title="Sin horas en este período" description="Registra lo que trabajaste arriba: en qué cliente, cuánto y qué hiciste." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                {board.canManage && <th className="px-3 py-2">Persona</th>}
                <th className="px-3 py-2">Cliente / proyecto</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2 text-right">Horas</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry) => {
                const editable = entry.status === 'OPEN' && (board.canManage || entry.userId === board.currentUserId);
                return (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(entry.date).toLocaleDateString('es-CL', { timeZone: 'UTC' })}</td>
                    {board.canManage && <td className="px-3 py-2">{entry.user?.name ?? '—'}</td>}
                    <td className="px-3 py-2">
                      {entry.contact?.razonSocial ?? 'Interno'}
                      {entry.project && <span className="block text-xs text-muted-foreground">{entry.project.name}</span>}
                    </td>
                    <td className="px-3 py-2">{entry.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(entry.minutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.billable ? formatCurrency(entryAmount(entry.minutes, entry.hourlyRate)) : '—'}</td>
                    <td className="px-3 py-2">
                      {entry.status === 'BILLED' ? (
                        <StatusBadge tone="success">Facturada</StatusBadge>
                      ) : entry.billable ? (
                        <StatusBadge tone="warning">Por facturar</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">No facturable</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editable && (
                        <span className="inline-flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label="Editar registro"
                            onClick={() =>
                              setForm({
                                id: entry.id,
                                date: new Date(entry.date).toISOString().slice(0, 10),
                                hours: String(Math.round((entry.minutes / 60) * 100) / 100).replace('.', ','),
                                contact: entry.contact ? { id: entry.contact.id, razonSocial: entry.contact.razonSocial, rut: '' } : null,
                                projectId: entry.projectId ?? '',
                                serviceContractId: entry.serviceContractId ?? '',
                                description: entry.description,
                                billable: entry.billable,
                                hourlyRate: entry.hourlyRate,
                                userId: entry.userId && entry.userId !== board.currentUserId ? entry.userId : '',
                              })
                            }
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" aria-label="Eliminar registro" onClick={() => void remove(entry.id)}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {billing && (
        <BillDialog
          contactId={billing.contactId}
          razonSocial={billing.razonSocial}
          onClose={() => setBilling(null)}
          onBilled={(salesDocumentId) => {
            setBilling(null);
            router.push(`/dashboard/sales/${salesDocumentId}`);
          }}
        />
      )}
    </div>
  );
}

function BillDialog({ contactId, razonSocial, onClose, onBilled }: { contactId: string; razonSocial: string; onClose: () => void; onBilled: (id: string) => void }) {
  const [entries, setEntries] = useState<TimesheetBoard['entries']>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dteType, setDteType] = useState<(typeof CONTRACT_DTE_TYPES)[number]>('FACTURA_33');
  const [grouping, setGrouping] = useState<'PER_ENTRY' | 'SINGLE_LINE'>('PER_ENTRY');
  const [isExempt, setIsExempt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getTimesheetBoardAction({ from: new Date(2000, 0, 1), to: new Date(), contactId, onlyUnbilled: true }).then((result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEntries(result.data.entries);
      setSelected(new Set(result.data.entries.map((entry) => entry.id)));
    });
  }, [contactId]);

  const chosen = entries.filter((entry) => selected.has(entry.id));
  const minutes = chosen.reduce((sum, entry) => sum + entry.minutes, 0);
  const amount = chosen.reduce((sum, entry) => sum + entryAmount(entry.minutes, entry.hourlyRate), 0);
  const exemptDoc = dteType === 'FACTURA_EXENTA_34' || dteType === 'BOLETA_EXENTA_41';

  async function submit() {
    setBusy(true);
    try {
      const result = await billTimeEntriesAction({ contactId, entryIds: [...selected], dteType, grouping, isExempt: exemptDoc || isExempt });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Borrador creado');
      onBilled(result.data.salesDocumentId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Facturar horas a {razonSocial}</DialogTitle>
          <DialogDescription>Se crea un borrador de venta para que lo revises y emitas. Las horas quedan marcadas como facturadas.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {entries.map((entry) => (
            <label key={entry.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
              <input
                type="checkbox"
                checked={selected.has(entry.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(entry.id);
                  else next.delete(entry.id);
                  setSelected(next);
                }}
              />
              <span className="w-24 shrink-0 text-muted-foreground">{new Date(entry.date).toLocaleDateString('es-CL', { timeZone: 'UTC' })}</span>
              <span className="flex-1">{entry.description}</span>
              <span className="tabular-nums">{formatMinutes(entry.minutes)}</span>
              <span className="w-24 text-right tabular-nums">{formatCurrency(entryAmount(entry.minutes, entry.hourlyRate))}</span>
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="b-dte">Documento</Label>
            <select id="b-dte" className={nativeSelectClass} value={dteType} onChange={(e) => setDteType(e.target.value as typeof dteType)}>
              {CONTRACT_DTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DTE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="b-group">Detalle en la factura</Label>
            <select id="b-group" className={nativeSelectClass} value={grouping} onChange={(e) => setGrouping(e.target.value as typeof grouping)}>
              <option value="PER_ENTRY">Una línea por registro</option>
              <option value="SINGLE_LINE">Una sola línea con el total</option>
            </select>
          </div>
          {!exemptDoc && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={isExempt} onChange={(e) => setIsExempt(e.target.checked)} /> Servicio exento de IVA
            </label>
          )}
        </div>
        <p className="text-sm">
          {chosen.length} registro(s) · {formatMinutes(minutes)} · <span className="font-semibold">{formatCurrency(amount)} neto</span>
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy || chosen.length === 0} onClick={() => void submit()}>
            {busy ? 'Creando…' : 'Crear borrador de factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
