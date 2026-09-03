import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPromissoryNoteAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';
import { PROMISSORY_NOTE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/modules/promissory-notes/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import { can, getAuthContext } from '@/lib/auth/guards';
import PromissoryNotePaymentDialog from '@/components/promissory-notes/PromissoryNotePaymentDialog';
import DeletePromissoryNoteButton from '@/components/promissory-notes/DeletePromissoryNoteButton';

export const metadata = { title: 'Pagaré' };

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-blue-600/10 text-blue-600',
  PAID: 'bg-green-600/10 text-green-600',
  PROTESTED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export default async function PromissoryNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getPromissoryNoteAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const note = result.data;
  const canWrite = can(context, 'promissorynotes:write');
  const isOverdue = note.status === 'ACTIVE' && new Date(note.dueDate) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/promissory-notes" className={buttonVariants({ variant: 'outline' })}>
          ← Volver a Pagarés
        </Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/promissory-notes/${note.id}/edit`} className={buttonVariants({ variant: 'default' })}>
              Editar pagaré
            </Link>
            <DeletePromissoryNoteButton noteId={note.id} contactName={note.contact.razonSocial} />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <h2 className="text-lg font-bold">{note.contact.razonSocial}</h2>
            <p className="text-muted-foreground">{formatRut(note.contact.rut)}</p>
            {note.candidate && (
              <p className="mt-1 text-xs text-muted-foreground">
                Candidata: {note.candidate.stageName || note.candidate.fullName}
              </p>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[note.status]}`}>
            {PROMISSORY_NOTE_STATUS_LABELS[note.status]}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded border border-border p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Monto</p>
            <p className="text-base font-semibold">{formatCurrency(note.amount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fecha de emisión</p>
            <p className="text-base font-semibold">{new Date(note.issueDate).toLocaleDateString('es-CL')}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fecha de vencimiento</p>
            <p className={`text-base font-semibold ${isOverdue ? 'text-destructive' : ''}`}>
              {new Date(note.dueDate).toLocaleDateString('es-CL')}
              {isOverdue && ' (vencido)'}
            </p>
          </div>
        </div>

        {note.documentUrl && (
          <p>
            <a href={note.documentUrl} target="_blank" rel="noreferrer" className="font-medium underline">
              Ver documento del pagaré firmado
            </a>
          </p>
        )}

        {note.notes && (
          <p>
            <span className="font-medium text-foreground">Notas:</span> {note.notes}
          </p>
        )}

        <div className="rounded border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Estado de pago</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {PAYMENT_STATUS_LABELS[note.paymentStatus]}
            </span>
          </div>
          <div className="mb-3 flex justify-between text-sm">
            <span>Pagado</span>
            <span>{formatCurrency(note.paidAmount)}</span>
          </div>
          <div className="mb-3 flex justify-between text-sm font-medium">
            <span>Saldo pendiente</span>
            <span>{formatCurrency(Math.max(note.amount - note.paidAmount, 0))}</span>
          </div>
          {canWrite && <PromissoryNotePaymentDialog noteId={note.id} amount={note.amount} paidAmount={note.paidAmount} />}
        </div>
      </div>
    </div>
  );
}
