'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SponsorshipDeliverable } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Paperclip, Trash2 } from 'lucide-react';
import {
  addDeliverableAction,
  deleteDeliverableAction,
  toggleDeliverableAction,
} from '@/modules/sponsorships/actions/sponsorships.actions';
import { SPONSORSHIP_DELIVERABLE_TYPES, SPONSORSHIP_DELIVERABLE_TYPE_LABELS } from '@/modules/sponsorships/schema';

interface Props {
  contractId: string;
  deliverables: SponsorshipDeliverable[];
  canWrite: boolean;
}

/** Checklist de entregables comprometidos con la marca (ej. logo en backdrop, mención en redes, pauta de TV). */
export default function DeliverableChecklist({ contractId, deliverables: initialDeliverables, canWrite }: Props) {
  const [deliverables, setDeliverables] = useState<SponsorshipDeliverable[]>(initialDeliverables);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<(typeof SPONSORSHIP_DELIVERABLE_TYPES)[number]>('OTRO');
  const [newDueDate, setNewDueDate] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const result = await addDeliverableAction(contractId, { title, type: newType, dueDate: newDueDate || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDeliverables((prev) => [...prev, result.data]);
      setNewTitle('');
      setNewDueDate('');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(deliverableId: string) {
    setBusyId(deliverableId);
    try {
      const result = await toggleDeliverableAction(deliverableId, contractId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDeliverables((prev) => prev.map((d) => (d.id === deliverableId ? result.data : d)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(deliverableId: string) {
    if (!confirm('¿Eliminar este entregable?')) return;
    setBusyId(deliverableId);
    try {
      const result = await deleteDeliverableAction(deliverableId, contractId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDeliverables((prev) => prev.filter((d) => d.id !== deliverableId));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUploadProof(deliverableId: string, file: File) {
    setBusyId(deliverableId);
    try {
      const formData = new FormData();
      formData.append('deliverableId', deliverableId);
      formData.append('file', file);
      const res = await fetch('/api/sponsorships/deliverable-proof-upload', { method: 'POST', body: formData });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'No se pudo subir la evidencia');
        return;
      }
      setDeliverables((prev) => prev.map((d) => (d.id === deliverableId ? { ...d, proofUrl: json.data!.url } : d)));
      toast.success('Evidencia subida');
    } catch {
      toast.error('No se pudo subir la evidencia');
    } finally {
      setBusyId(null);
    }
  }

  const completedCount = deliverables.filter((d) => d.isCompleted).length;

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist de entregables</h3>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{deliverables.length} completados
        </span>
      </div>

      {deliverables.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin entregables cargados todavía.</p>
      )}

      <ul className="space-y-1.5">
        {deliverables.map((deliverable) => (
          <li key={deliverable.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={deliverable.isCompleted}
              disabled={!canWrite || busyId === deliverable.id}
              onChange={() => handleToggle(deliverable.id)}
            />
            <span className={`flex-1 ${deliverable.isCompleted ? 'text-muted-foreground line-through' : ''}`}>
              {deliverable.title}
            </span>
            <StatusBadge tone="neutral">{SPONSORSHIP_DELIVERABLE_TYPE_LABELS[deliverable.type]}</StatusBadge>
            {deliverable.dueDate && !deliverable.isCompleted && (
              <StatusBadge tone={new Date(deliverable.dueDate) < new Date() ? 'danger' : 'warning'}>
                {new Date(deliverable.dueDate) < new Date() ? 'Vencido' : 'Vence'} {new Date(deliverable.dueDate).toLocaleDateString('es-CL')}
              </StatusBadge>
            )}
            {deliverable.completedAt && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(deliverable.completedAt).toLocaleDateString('es-CL')}
              </span>
            )}
            {deliverable.proofUrl && (
              <a
                href={deliverable.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary underline-offset-2 hover:underline"
              >
                Ver evidencia
              </a>
            )}
            {canWrite && (
              <>
                <input
                  ref={(el) => {
                    fileInputRefs.current[deliverable.id] = el;
                  }}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUploadProof(deliverable.id, file);
                  }}
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={busyId === deliverable.id}
                  title="Adjuntar evidencia"
                  onClick={() => fileInputRefs.current[deliverable.id]?.click()}
                >
                  <Paperclip />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="destructive"
                  disabled={busyId === deliverable.id}
                  title="Eliminar entregable"
                  onClick={() => handleDelete(deliverable.id)}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Nuevo entregable (ej: Logo en backdrop, mención en Instagram)"
            className="min-w-[220px] flex-1"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <select
            className="h-10 rounded-xl border border-input bg-muted px-2 text-sm text-foreground"
            value={newType}
            onChange={(e) => setNewType(e.target.value as (typeof SPONSORSHIP_DELIVERABLE_TYPES)[number])}
          >
            {SPONSORSHIP_DELIVERABLE_TYPES.map((type) => (
              <option key={type} value={type}>{SPONSORSHIP_DELIVERABLE_TYPE_LABELS[type]}</option>
            ))}
          </select>
          <Input type="date" className="w-40" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
          <Button type="button" variant="outline" disabled={adding || !newTitle.trim()} onClick={handleAdd}>
            {adding ? 'Agregando...' : 'Agregar'}
          </Button>
        </div>
      )}
    </div>
  );
}
