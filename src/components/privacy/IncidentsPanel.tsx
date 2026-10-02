'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { createPrivacyIncidentAction, updatePrivacyIncidentAction } from '@/modules/data-protection/actions/data-protection.actions';
import type { PrivacyIncident } from '@prisma/client';

const STATUS_LABELS = { OPEN: 'Abierto', CONTAINED: 'Contenido', CLOSED: 'Cerrado' } as const;
const dateTimeLabel = (date: Date | string) => new Date(date).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' });

/** Qué hacer ante una vulneración: la ley exige avisar a la Agencia sin dilaciones indebidas y, si hay riesgo, a los titulares. */
function GuidanceBox({ incident }: { incident: PrivacyIncident }) {
  const high = incident.affectsSensitiveData || incident.affectsMinors || incident.affectsEconomicData;
  return (
    <p className="rounded-lg bg-warning-soft p-2 text-xs text-warning">
      {high
        ? 'Afecta datos sensibles, de menores o económicos: avisa a la Agencia de Protección de Datos Personales por el medio más expedito, sin dilaciones indebidas, y comunica el incidente a las personas afectadas.'
        : 'Evalúa si hay riesgo para los derechos de las personas. Si lo hay, avisa a la Agencia sin dilaciones indebidas. Deja constancia de tu decisión aquí.'}{' '}
      Si además es un incidente de ciberseguridad, revisa con tu asesoría si aplican los avisos de la Ley 21.663. Valida siempre los plazos con ella.
    </p>
  );
}

export default function IncidentsPanel({ initial }: { initial: PrivacyIncident[] }) {
  const [incidents, setIncidents] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', detectedAt: new Date().toISOString().slice(0, 16), affectsSensitiveData: false, affectsMinors: false, affectsEconomicData: false, recordsAffected: '', containmentActions: '' });

  async function create() {
    setBusy(true);
    try {
      const result = await createPrivacyIncidentAction({
        ...form,
        detectedAt: new Date(form.detectedAt).toISOString(),
        recordsAffected: form.recordsAffected.trim() ? Number(form.recordsAffected) : undefined,
        containmentActions: form.containmentActions.trim() || undefined,
      });
      if (!result.success) return void toast.error(result.error);
      setIncidents((current) => [result.data, ...current]);
      setShow(false);
      toast.success(result.message ?? 'Registrado');
    } finally {
      setBusy(false);
    }
  }

  async function update(incident: PrivacyIncident, input: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await updatePrivacyIncidentAction(incident.id, input);
      if (!result.success) return void toast.error(result.error);
      setIncidents((current) => current.map((i) => (i.id === incident.id ? result.data : i)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-muted-foreground">
          Registra cualquier vulneración de seguridad que afecte datos personales (acceso no autorizado, pérdida, filtración). Deja constancia de qué
          pasó, qué se hizo y a quién se avisó y cuándo.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setShow((v) => !v)}>{show ? 'Cancelar' : 'Registrar incidente'}</Button>
      </div>

      {show && (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="incTitle">Título</Label><Input id="incTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="incDesc">Qué pasó</Label><Input id="incDesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label htmlFor="incDetected">Detectado el</Label><Input id="incDetected" type="datetime-local" value={form.detectedAt} onChange={(e) => setForm({ ...form, detectedAt: e.target.value })} /></div>
          <div><Label htmlFor="incRecords">Personas o registros afectados (si se sabe)</Label><Input id="incRecords" type="number" min={0} value={form.recordsAffected} onChange={(e) => setForm({ ...form, recordsAffected: e.target.value })} /></div>
          <div className="flex flex-wrap gap-4 text-xs sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.affectsSensitiveData} onChange={(e) => setForm({ ...form, affectsSensitiveData: e.target.checked })} /> Datos sensibles (salud, etc.)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.affectsMinors} onChange={(e) => setForm({ ...form, affectsMinors: e.target.checked })} /> Datos de menores</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.affectsEconomicData} onChange={(e) => setForm({ ...form, affectsEconomicData: e.target.checked })} /> Datos económicos o bancarios</label>
          </div>
          <div className="sm:col-span-2"><Label htmlFor="incActions">Medidas tomadas para contenerlo</Label><Input id="incActions" value={form.containmentActions} onChange={(e) => setForm({ ...form, containmentActions: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="button" size="sm" disabled={busy || form.title.trim().length < 5 || form.description.trim().length < 20} onClick={create}>Registrar</Button></div>
        </section>
      )}

      {incidents.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin incidentes registrados.</p>
      ) : (
        <ul className="space-y-2">
          {incidents.map((incident) => (
            <li key={incident.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{incident.title}</span>
                <StatusBadge tone={incident.status === 'CLOSED' ? 'neutral' : incident.status === 'CONTAINED' ? 'info' : 'danger'}>{STATUS_LABELS[incident.status]}</StatusBadge>
              </div>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{incident.description}</p>
              <p className="text-xs text-muted-foreground">Detectado {dateTimeLabel(incident.detectedAt)}{incident.recordsAffected !== null && ` · ${incident.recordsAffected} afectados`}</p>
              {incident.status !== 'CLOSED' && <GuidanceBox incident={incident} />}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={Boolean(incident.agencyNotifiedAt)} onChange={(e) => update(incident, { agencyNotified: e.target.checked })} /> Aviso a la Agencia{incident.agencyNotifiedAt && ` (${dateTimeLabel(incident.agencyNotifiedAt)})`}</label>
                <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={Boolean(incident.subjectsNotifiedAt)} onChange={(e) => update(incident, { subjectsNotified: e.target.checked })} /> Aviso a los afectados{incident.subjectsNotifiedAt && ` (${dateTimeLabel(incident.subjectsNotifiedAt)})`}</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {incident.status === 'OPEN' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => update(incident, { status: 'CONTAINED' })}>Marcar contenido</Button>}
                {incident.status !== 'CLOSED' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => update(incident, { status: 'CLOSED' })}>Cerrar</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
