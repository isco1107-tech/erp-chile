'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import ContactForm from '@/components/ContactForm';
import { listContactsAction } from '@/modules/contacts/actions/contacts.actions';
import { listCandidatesAction } from '@/modules/candidates/actions/candidates.actions';
import {
  createPromissoryNoteAction,
  updatePromissoryNoteAction,
} from '@/modules/promissory-notes/actions/promissory-notes.actions';
import type { PromissoryNoteWithRelations } from '@/modules/promissory-notes/services/promissory-notes.service';
import {
  PROMISSORY_NOTE_STATUS_LABELS,
  PROMISSORY_NOTE_STATUSES,
  promissoryNoteCreateSchema,
} from '@/modules/promissory-notes/schema';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface CandidateOption {
  id: string;
  fullName: string;
  stageName: string | null;
}

interface Props {
  /** Presente solo en /dashboard/promissory-notes/[id]/edit: precarga el pagaré y guarda edición en vez de crear uno nuevo. */
  editingNote?: PromissoryNoteWithRelations;
  /** Solo se muestra el selector de candidata si el módulo de Candidatas está contratado. */
  hasCandidates: boolean;
}

function toDateInputValue(date: Date | string | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export default function PromissoryNoteForm({ editingNote, hasCandidates }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);

  const [contactId, setContactId] = useState(editingNote?.contactId ?? '');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(editingNote?.contact ?? null);
  const [contactQuery, setContactQuery] = useState('');
  const [showQuickContact, setShowQuickContact] = useState(false);

  const [candidateId, setCandidateId] = useState(editingNote?.candidateId ?? '');
  const [candidateQuery, setCandidateQuery] = useState('');

  const [amount, setAmount] = useState(editingNote?.amount ?? 0);
  const [issueDate, setIssueDate] = useState(toDateInputValue(editingNote?.issueDate) || toDateInputValue(new Date()));
  const [dueDate, setDueDate] = useState(toDateInputValue(editingNote?.dueDate));
  const [status, setStatus] = useState<(typeof PROMISSORY_NOTE_STATUSES)[number]>(editingNote?.status ?? 'ACTIVE');
  const [notes, setNotes] = useState(editingNote?.notes ?? '');
  const [documentUrl, setDocumentUrl] = useState(editingNote?.documentUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listContactsAction().then((r) => {
      if (r.success) setContacts(r.data);
      else toast.error(r.error);
    });
    if (hasCandidates) {
      listCandidatesAction({ pageSize: 100 }).then((r) => {
        if (r.success) setCandidates(r.data.items.map((c) => ({ id: c.id, fullName: c.fullName, stageName: c.stageName })));
        // Silencioso si falla: el rol puede tener `promissorynotes:write` sin
        // `candidates:read` — el selector de candidata queda vacío, sin
        // bloquear el resto del formulario.
      });
    }
  }, [hasCandidates]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return [];
    return contacts.filter((c) => c.rut.toLowerCase().includes(q) || c.razonSocial.toLowerCase().includes(q)).slice(0, 8);
  }, [contactQuery, contacts]);

  const filteredCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter((c) => c.fullName.toLowerCase().includes(q) || (c.stageName ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [candidateQuery, candidates]);

  const selectedCandidate = candidates.find((c) => c.id === candidateId) ?? null;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/promissory-notes/document-upload', { method: 'POST', body: formData });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'No se pudo subir el documento');
        return;
      }
      setDocumentUrl(json.data.url);
      toast.success('Documento subido');
    } finally {
      setUploading(false);
    }
  }

  function buildPayload() {
    return {
      contactId: selectedContact?.id ?? contactId,
      candidateId: candidateId || undefined,
      amount,
      issueDate,
      dueDate,
      documentUrl: documentUrl || undefined,
      status,
      notes: notes || undefined,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    const parsed = promissoryNoteCreateSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    try {
      const result = editingNote
        ? await updatePromissoryNoteAction(editingNote.id, parsed.data)
        : await createPromissoryNoteAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Pagaré guardado');
      router.push(`/dashboard/promissory-notes/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div>
          <Label>Contacto (deudor)</Label>
          {selectedContact ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{selectedContact.rut} — {selectedContact.razonSocial}</span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setSelectedContact(null);
                  setContactId('');
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="Buscar contacto por RUT o Razón Social"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
              {filteredContacts.length > 0 && (
                <ul className="rounded-lg border border-border text-sm">
                  {filteredContacts.map((c) => (
                    <li
                      key={c.id}
                      className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                      onClick={() => {
                        setSelectedContact(c);
                        setContactId(c.id);
                        setContactQuery('');
                      }}
                    >
                      {c.rut} — {c.razonSocial}
                    </li>
                  ))}
                </ul>
              )}
              <Button type="button" size="xs" variant="outline" onClick={() => setShowQuickContact((s) => !s)}>
                {showQuickContact ? 'Cerrar' : '+ Crear Contacto Nuevo'}
              </Button>
              {showQuickContact && (
                <ContactForm
                  editingContact={null}
                  onSaved={(contact) => {
                    setContacts((prev) => [contact, ...prev]);
                    setSelectedContact(contact);
                    setContactId(contact.id);
                    setShowQuickContact(false);
                    toast.success('Contacto creado y seleccionado');
                  }}
                  onCancelEdit={() => setShowQuickContact(false)}
                />
              )}
            </div>
          )}
        </div>

        {hasCandidates && (
          <div>
            <Label>Candidata (opcional)</Label>
            {selectedCandidate ? (
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>{selectedCandidate.stageName || selectedCandidate.fullName}</span>
                <Button type="button" size="xs" variant="ghost" onClick={() => setCandidateId('')}>
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Buscar candidata por nombre"
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                />
                {filteredCandidates.length > 0 && (
                  <ul className="rounded-lg border border-border text-sm">
                    {filteredCandidates.map((c) => (
                      <li
                        key={c.id}
                        className="cursor-pointer px-2.5 py-1.5 hover:bg-muted"
                        onClick={() => {
                          setCandidateId(c.id);
                          setCandidateQuery('');
                        }}
                      >
                        {c.stageName || c.fullName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Si el pagaré respalda un compromiso de una candidata, se mostrará también en su ficha.</p>
          </div>
        )}

        <div>
          <Label htmlFor="amount">Monto</Label>
          <CurrencyInput id="amount" value={amount} onChange={setAmount} />
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as (typeof PROMISSORY_NOTE_STATUSES)[number])} className={selectClass}>
            {PROMISSORY_NOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROMISSORY_NOTE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="issueDate">Fecha de emisión</Label>
          <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="dueDate">Fecha de vencimiento</Label>
          <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="document">Documento del pagaré firmado</Label>
          <Input id="document" ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={handleFileChange} disabled={uploading} />
          {uploading && <p className="mt-1 text-xs text-muted-foreground">Subiendo...</p>}
          {documentUrl && !uploading && (
            <p className="mt-1 text-xs text-muted-foreground">
              Documento cargado —{' '}
              <a href={documentUrl} target="_blank" rel="noreferrer" className="underline">
                ver archivo
              </a>
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" disabled={saving || uploading} onClick={handleSave}>
          {saving ? 'Guardando...' : editingNote ? 'Guardar cambios' : 'Crear pagaré'}
        </Button>
      </div>
    </div>
  );
}
