'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PaymentStatusBadge, StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { listPromissoryNotesAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';
import { PROMISSORY_NOTE_STATUS_LABELS, PROMISSORY_NOTE_STATUSES } from '@/modules/promissory-notes/schema';
import type { PromissoryNoteWithRelations } from '@/modules/promissory-notes/services/promissory-notes.service';
import { formatCurrency } from '@/lib/chile/tax';
import DeletePromissoryNoteButton from './DeletePromissoryNoteButton';

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'info',
  PAID: 'success',
  PROTESTED: 'danger',
  CANCELLED: 'neutral',
};

const selectClass =
  'h-8 min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function isOverdue(note: PromissoryNoteWithRelations): boolean {
  return note.status === 'ACTIVE' && new Date(note.dueDate) < new Date();
}

export default function PromissoryNoteListClient({ canWrite }: { canWrite: boolean }) {
  const [notes, setNotes] = useState<PromissoryNoteWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | (typeof PROMISSORY_NOTE_STATUSES)[number]>('ALL');

  async function load() {
    setLoading(true);
    const result = await listPromissoryNotesAction();
    if (result.success) setNotes(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredNotes = useMemo(
    () => (statusFilter === 'ALL' ? notes : notes.filter((n) => n.status === statusFilter)),
    [notes, statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass}>
          <option value="ALL">Todos los estados</option>
          {PROMISSORY_NOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROMISSORY_NOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {canWrite && (
          <Link href="/dashboard/promissory-notes/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
            Nuevo Pagaré
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && filteredNotes.length === 0 && (
        <EmptyState
          title="Todavía no hay pagarés registrados"
          description="Registra el primer pagaré para verlo aquí."
          action={
            canWrite ? (
              <Link href="/dashboard/promissory-notes/new" className={buttonVariants({ size: 'sm' })}>
                Nuevo Pagaré
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && filteredNotes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Candidata</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Vencimiento</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Pago</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map((note) => (
                <tr key={note.id} className={`border-t border-border ${isOverdue(note) ? 'bg-destructive/5' : ''}`}>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/promissory-notes/${note.id}`} className="font-medium hover:underline">
                      {note.contact.razonSocial}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {note.candidate ? note.candidate.stageName || note.candidate.fullName : '—'}
                  </td>
                  <td className="px-3 py-2">{formatCurrency(note.amount)}</td>
                  <td className={`px-3 py-2 ${isOverdue(note) ? 'font-medium text-destructive' : ''}`}>
                    {new Date(note.dueDate).toLocaleDateString('es-CL')}
                    {isOverdue(note) && ' (vencido)'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={STATUS_TONE[note.status] ?? 'neutral'}>{PROMISSORY_NOTE_STATUS_LABELS[note.status]}</StatusBadge>
                  </td>
                  <td className="px-3 py-2">
                    <PaymentStatusBadge status={note.paymentStatus} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canWrite && (
                      <DeletePromissoryNoteButton noteId={note.id} contactName={note.contact.razonSocial} variant="icon" onDeleted={load} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
