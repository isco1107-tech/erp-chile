import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ClipboardList, CreditCard, FileSignature, HeartPulse, IdCard, MapPin, Ruler, StickyNote } from 'lucide-react';
import type { CandidateStatus } from '@prisma/client';
import { can, getAuthContext } from '@/lib/auth/guards';
import {
  getCandidateAction,
  getCandidateHistoryAction,
  listAttendanceAction,
  listDocumentsAction,
} from '@/modules/candidates/actions/candidates.actions';
import { CANDIDATE_STATUS_LABELS } from '@/modules/candidates/schema';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import DeleteCandidateButton from '@/components/candidates/DeleteCandidateButton';
import WhatsAppButton from '@/components/shared/WhatsAppButton';
import AttendanceSection from '@/components/candidates/AttendanceSection';
import DocumentsSection from '@/components/candidates/DocumentsSection';
import ContractSignatureSection from '@/components/candidates/ContractSignatureSection';
import StatusChangeSection from '@/components/candidates/StatusChangeSection';
import HistorySection from '@/components/candidates/HistorySection';
import PhotosSection from '@/components/candidates/PhotosSection';
import { PROMISSORY_NOTE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/modules/promissory-notes/schema';
import { PAYMENT_STATUS_LABELS as INSTALLMENT_PAYMENT_STATUS_LABELS } from '@/modules/payment-plans/schema';
import { formatCurrency } from '@/lib/chile/tax';

export const metadata = { title: 'Ficha de Candidata' };

const STATUS_TONE: Record<CandidateStatus, Tone> = {
  APPLICANT: 'neutral',
  UNDER_REVIEW: 'neutral',
  CALLED_TO_CASTING: 'info',
  OFFICIAL_CANDIDATE: 'info',
  FINALIST: 'accent',
  WINNER: 'success',
  WITHDRAWN: 'danger',
  REJECTED: 'danger',
};

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function ageFromBirthDate(birthDate: Date | string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** Etiqueta redonda con ícono, para datos rápidos junto al encabezado (comuna, edad, estatura). */
function InfoPill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" strokeWidth={1.75} />
      {children}
    </span>
  );
}

/** Tarjeta de sección con encabezado iconizado — unidad visual repetida para cada bloque de la ficha. */
function SectionCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
          <Icon className="size-4 text-accent-foreground" strokeWidth={1.75} />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** Par etiqueta/valor consistente dentro de una `SectionCard`. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const canWrite = can(context, 'candidates:write');
  const canSeeSensitive = can(context, 'candidates:sensitive');

  const [result, attendanceResult, documentsResult, historyResult] = await Promise.all([
    getCandidateAction(id),
    listAttendanceAction(id),
    listDocumentsAction(id),
    // Requiere `candidates:sensitive` en la Server Action — sin el permiso
    // devuelve un `AuthError`, que acá se traduce en lista vacía (la sección
    // ni se renderiza, ver más abajo).
    canSeeSensitive ? getCandidateHistoryAction(id) : Promise.resolve({ success: false as const, error: '' }),
  ]);
  if (!result.success) notFound();

  const candidate = result.data;
  const attendance = attendanceResult.success ? attendanceResult.data : [];
  const documents = documentsResult.success ? documentsResult.data : [];
  const history = historyResult.success ? historyResult.data : [];
  const photos = documents.filter((d) => d.documentType === 'PHOTO_FACE' || d.documentType === 'PHOTO_FULL_BODY');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/candidates" className={buttonVariants({ variant: 'outline' })}>← Volver al listado</Link>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeSensitive && (
            <WhatsAppButton phone={candidate.phone} name={candidate.stageName || candidate.fullName} />
          )}
          {canWrite && (
            <>
              <Link href={`/dashboard/candidates/${candidate.id}/edit`} className={buttonVariants({ variant: 'default' })}>
                Editar ficha
              </Link>
              <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.stageName || candidate.fullName} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-8 text-center shadow-card sm:flex-row sm:text-left">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
          {candidate.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={candidate.photoUrl} alt={candidate.fullName} className="size-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground">{initials(candidate.fullName)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{candidate.stageName || candidate.fullName}</h2>
          {candidate.stageName && <p className="text-muted-foreground">{candidate.fullName}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Proyecto: {candidate.project.name} ({candidate.project.code})
            {candidate.folio && <span className="font-mono"> · Folio {candidate.folio}</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <StatusBadge tone={STATUS_TONE[candidate.status] ?? 'neutral'}>
              {CANDIDATE_STATUS_LABELS[candidate.status]}
            </StatusBadge>
            {(candidate.birthDate || candidate.declaredAge != null) && (
              <InfoPill icon={IdCard}>{candidate.birthDate ? ageFromBirthDate(candidate.birthDate) : candidate.declaredAge} años</InfoPill>
            )}
            {candidate.comuna && <InfoPill icon={MapPin}>{candidate.comuna}</InfoPill>}
            {candidate.heightCm && <InfoPill icon={Ruler}>{candidate.heightCm} cm</InfoPill>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard icon={IdCard} title="Datos personales">
          <div className="grid grid-cols-2 gap-4">
            <Field label="RUT" value={canSeeSensitive ? formatRut(candidate.rut) : candidate.rut} />
            {candidate.birthDate ? (
              <Field label="Fecha de nacimiento" value={new Date(candidate.birthDate).toLocaleDateString('es-CL')} />
            ) : (
              <Field label="Edad declarada" value={candidate.declaredAge != null ? `${candidate.declaredAge} años` : null} />
            )}
            {canSeeSensitive ? (
              <>
                <Field label="Email" value={candidate.email} />
                <Field label="Teléfono" value={candidate.phone} />
              </>
            ) : (
              <p className="col-span-2 text-xs text-muted-foreground">
                Los datos de contacto requieren el permiso &quot;Ver datos de contacto y fotografías de postulaciones&quot;.
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard icon={Ruler} title="Medidas y tallas">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Talla vestido" value={candidate.dressSize} />
            <Field label="Talla zapato" value={candidate.shoeSize} />
            <Field label="Estatura" value={candidate.heightCm ? `${candidate.heightCm} cm` : null} />
          </div>
        </SectionCard>

        <SectionCard icon={ClipboardList} title="Postulación">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Comuna" value={candidate.comuna} />
            <Field label="Ocupación" value={candidate.ocupacion} />
            <Field label="Instagram" value={candidate.instagram} />
            <Field label="Idiomas" value={candidate.idiomas} />
            {canSeeSensitive && <Field label="Dirección" value={candidate.direccion} />}
          </div>
          {canSeeSensitive && (candidate.employerName || candidate.employerRut || candidate.employerAddress) && (
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
              <Field label="Empleador" value={candidate.employerName} />
              <Field label="RUT empleador" value={candidate.employerRut} />
              <Field label="Dirección empleador" value={candidate.employerAddress} />
            </div>
          )}
          {(candidate.motivacion || candidate.causaSocial || candidate.experiencia) && (
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              {candidate.motivacion && <Field label="Motivación" value={candidate.motivacion} />}
              {candidate.causaSocial && <Field label="Causa social" value={candidate.causaSocial} />}
              {candidate.experiencia && <Field label="Experiencia previa" value={candidate.experiencia} />}
            </div>
          )}
        </SectionCard>

        {canSeeSensitive && (
          <SectionCard icon={HeartPulse} title="Contacto de emergencia y salud">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre" value={candidate.emergencyContactName} />
              <Field label="Teléfono" value={candidate.emergencyContactPhone} />
            </div>
            {candidate.condicionesMedicas && (
              <div className="mt-4 border-t border-border pt-3">
                <Field label="Alergias o condiciones médicas" value={candidate.condicionesMedicas} />
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {(candidate.notes || (candidate.status === 'REJECTED' && candidate.motivoDescarte)) && (
        <SectionCard icon={StickyNote} title="Notas">
          <div className="space-y-2 text-sm">
            {candidate.notes && <p className="text-foreground">{candidate.notes}</p>}
            {candidate.status === 'REJECTED' && candidate.motivoDescarte && (
              <p className="text-destructive"><span className="font-medium">Motivo del descarte:</span> {candidate.motivoDescarte}</p>
            )}
          </div>
        </SectionCard>
      )}

      <div className="space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        {canWrite && <StatusChangeSection candidateId={candidate.id} currentStatus={candidate.status} />}

        <AttendanceSection candidateId={candidate.id} attendance={attendance} canWrite={canWrite} />
        <PhotosSection candidateId={candidate.id} photos={photos} />
        <DocumentsSection
          candidateId={candidate.id}
          documents={documents.filter((d) => d.documentType !== 'PHOTO_FACE' && d.documentType !== 'PHOTO_FULL_BODY')}
          canWrite={canWrite}
        />
        {canSeeSensitive && <HistorySection history={history} />}

        {canWrite && (
          <ContractSignatureSection
            candidateId={candidate.id}
            candidateEmail={candidate.email}
            document={
              documents
                .filter((d) => d.documentType === 'CONTRACT_IMAGE')
                .map((d) => ({ id: d.id, status: d.status, fileUrl: d.fileUrl, zapsignSignUrl: d.zapsignSignUrl }))[0] ?? null
            }
          />
        )}

        <p className="border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
          Ficha creada el {new Date(candidate.createdAt).toLocaleString('es-CL')} — última actualización {new Date(candidate.updatedAt).toLocaleString('es-CL')}
        </p>
      </div>

      {context.features.hasPromissoryNotes && candidate.promissoryNotes && candidate.promissoryNotes.length > 0 && (
        <SectionCard icon={FileSignature} title="Pagarés">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Monto</th>
                  <th className="py-1.5 pr-3">Vencimiento</th>
                  <th className="py-1.5 pr-3">Estado</th>
                  <th className="py-1.5 pr-3">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {candidate.promissoryNotes.map((note) => (
                  <tr key={note.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{formatCurrency(note.amount)}</td>
                    <td className="py-1.5 pr-3">{new Date(note.dueDate).toLocaleDateString('es-CL')}</td>
                    <td className="py-1.5 pr-3">{PROMISSORY_NOTE_STATUS_LABELS[note.status]}</td>
                    <td className="py-1.5 pr-3">
                      {formatCurrency(note.paidAmount)} ({PAYMENT_STATUS_LABELS[note.paymentStatus]})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {context.features.hasInstallmentPlans && candidate.paymentPlans && candidate.paymentPlans.length > 0 && (
        <SectionCard icon={CreditCard} title="Plan de pago">
          <div className="space-y-4">
            {candidate.paymentPlans.map((plan) => (
              <div key={plan.id}>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {plan.installmentCount} cuotas — Total {formatCurrency(plan.totalAmount)}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3">N°</th>
                        <th className="py-1.5 pr-3">Vencimiento</th>
                        <th className="py-1.5 pr-3">Monto</th>
                        <th className="py-1.5 pr-3">Estado</th>
                        <th className="py-1.5 pr-3">Multa aplicada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.installments.map((installment) => (
                        <tr key={installment.id} className="border-t border-border">
                          <td className="py-1.5 pr-3">{installment.installmentNumber}</td>
                          <td className="py-1.5 pr-3">{new Date(installment.dueDate).toLocaleDateString('es-CL')}</td>
                          <td className="py-1.5 pr-3">{formatCurrency(installment.amount)}</td>
                          <td className="py-1.5 pr-3">{INSTALLMENT_PAYMENT_STATUS_LABELS[installment.paymentStatus]}</td>
                          <td className="py-1.5 pr-3">
                            {installment.penaltyApplied > 0 ? formatCurrency(installment.penaltyApplied) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
