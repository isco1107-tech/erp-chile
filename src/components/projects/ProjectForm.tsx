'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, ProjectStatus } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, projectCreateSchema, projectUpdateSchema } from '@/modules/projects/schema';
import { createProjectAction, updateProjectAction } from '@/modules/projects/actions/projects.actions';
import { formatWhatsappNumber } from '@/lib/events/pageant-contact';

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** `Date` → `datetime-local` en la hora local del navegador. */
function toDateTimeInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ProjectFormProps {
  editingProject: Project | null;
}

export default function ProjectForm({ editingProject }: ProjectFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    code: editingProject?.code ?? '',
    name: editingProject?.name ?? '',
    budgetedIncome: editingProject?.budgetedIncome ?? 0,
    budgetedExpense: editingProject?.budgetedExpense ?? 0,
    startDate: toDateInputValue(editingProject?.startDate),
    endDate: toDateInputValue(editingProject?.endDate),
    status: (editingProject?.status ?? 'PLANNING') as ProjectStatus,
    notes: editingProject?.notes ?? '',
    galaDate: toDateTimeInputValue(editingProject?.galaDate),
    venueName: editingProject?.venueName ?? '',
    venueAddress: editingProject?.venueAddress ?? '',
    publicWhatsapp: editingProject?.publicWhatsapp ? formatWhatsappNumber(editingProject.publicWhatsapp) : '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      code: form.code,
      name: form.name,
      budgetedIncome: form.budgetedIncome,
      budgetedExpense: form.budgetedExpense,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      status: form.status,
      notes: form.notes || undefined,
      galaDate: form.galaDate ? new Date(form.galaDate).toISOString() : null,
      venueName: form.venueName,
      venueAddress: form.venueAddress,
      publicWhatsapp: form.publicWhatsapp,
    };

    const schema = editingProject ? projectUpdateSchema : projectCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const result = editingProject
        ? await updateProjectAction(editingProject.id, parsed.data)
        : await createProjectAction(parsed.data);

      if (!result.success) {
        toast.error(result.error);
        setErrors({ form: result.error });
        return;
      }

      toast.success(result.message ?? 'Proyecto guardado');
      router.push(`/dashboard/projects/${result.data.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="code">Código</Label>
          <Input id="code" value={form.code} onChange={(e) => update('code', e.target.value)} aria-invalid={!!errors.code} />
          {errors.code && <p className="mt-1 text-sm text-destructive">{errors.code}</p>}
        </div>

        <div>
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
        </div>

        <div>
          <Label htmlFor="budgetedIncome">Presupuesto de Ingresos</Label>
          <CurrencyInput
            id="budgetedIncome"
            value={form.budgetedIncome}
            onChange={(value) => update('budgetedIncome', value)}
            aria-invalid={!!errors.budgetedIncome}
          />
          {errors.budgetedIncome && <p className="mt-1 text-sm text-destructive">{errors.budgetedIncome}</p>}
        </div>

        <div>
          <Label htmlFor="budgetedExpense">Presupuesto de Gastos</Label>
          <CurrencyInput
            id="budgetedExpense"
            value={form.budgetedExpense}
            onChange={(value) => update('budgetedExpense', value)}
            aria-invalid={!!errors.budgetedExpense}
          />
          {errors.budgetedExpense && <p className="mt-1 text-sm text-destructive">{errors.budgetedExpense}</p>}
        </div>

        <div>
          <Label htmlFor="startDate">Fecha de Inicio</Label>
          <Input
            id="startDate"
            type="date"
            value={form.startDate}
            onChange={(e) => update('startDate', e.target.value)}
            aria-invalid={!!errors.startDate}
          />
          {errors.startDate && <p className="mt-1 text-sm text-destructive">{errors.startDate}</p>}
        </div>

        <div>
          <Label htmlFor="endDate">Fecha de Término</Label>
          <Input
            id="endDate"
            type="date"
            value={form.endDate}
            onChange={(e) => update('endDate', e.target.value)}
            aria-invalid={!!errors.endDate}
          />
          {errors.endDate && <p className="mt-1 text-sm text-destructive">{errors.endDate}</p>}
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            value={form.status}
            onChange={(e) => update('status', e.target.value as ProjectStatus)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="galaDate">Fecha y hora de la gala final</Label>
          <Input id="galaDate" type="datetime-local" value={form.galaDate} onChange={(e) => update('galaDate', e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Alimenta la cuenta regresiva del sitio y el checklist de preparación.</p>
        </div>

        <div>
          <Label htmlFor="venueName">Recinto</Label>
          <Input id="venueName" value={form.venueName} onChange={(e) => update('venueName', e.target.value)} placeholder="Teatro Municipal de Viña del Mar" />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="venueAddress">Dirección del recinto</Label>
          <Input id="venueAddress" value={form.venueAddress} onChange={(e) => update('venueAddress', e.target.value)} />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="publicWhatsapp">WhatsApp para dudas</Label>
          <Input
            id="publicWhatsapp"
            type="tel"
            autoComplete="off"
            placeholder="+56 9 1234 5678"
            value={form.publicWhatsapp}
            onChange={(e) => update('publicWhatsapp', e.target.value)}
            aria-invalid={!!errors.publicWhatsapp}
          />
          {errors.publicWhatsapp ? (
            <p className="mt-1 text-sm text-destructive">{errors.publicWhatsapp}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Aparece como botón flotante en el sitio del certamen y en la inscripción, con un mensaje listo para candidatas y sponsors.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </div>
      </div>

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingProject ? 'Guardar cambios' : 'Crear proyecto'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/projects')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
