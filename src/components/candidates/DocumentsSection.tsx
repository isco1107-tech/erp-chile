'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CandidateDocument } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { Trash2 } from 'lucide-react';
import { addDocumentAction, deleteDocumentAction, updateDocumentAction } from '@/modules/candidates/actions/candidates.actions';
import { CANDIDATE_DOCUMENT_STATUS_LABELS } from '@/modules/candidates/schema';

interface Props {
  candidateId: string;
  documents: CandidateDocument[];
  canWrite: boolean;
}

const STATUS_TONE: Record<string, Tone> = { PENDING: 'neutral', SIGNED: 'success', EXPIRED: 'danger' };

export default function DocumentsSection({ candidateId, documents: initial, canWrite }: Props) {
  const [documents, setDocuments] = useState<CandidateDocument[]>(initial);
  const [title, setTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!title.trim()) {
      toast.error('Ingresa un título para el documento');
      return;
    }
    if (!file) {
      toast.error('Selecciona un archivo');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('candidateId', candidateId);
      formData.append('file', file);
      const res = await fetch('/api/candidates/document-upload', { method: 'POST', body: formData });
      const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'No se pudo subir el archivo');
        return;
      }
      const result = await addDocumentAction(candidateId, {
        title,
        fileUrl: json.data.url,
        expiresAt: expiresAt || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDocuments((prev) => [result.data, ...prev]);
      setTitle('');
      setExpiresAt('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Documento agregado');
    } finally {
      setUploading(false);
    }
  }

  async function handleMarkSigned(documentId: string) {
    setBusyId(documentId);
    try {
      const result = await updateDocumentAction(documentId, candidateId, { signedAt: new Date().toISOString() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDocuments((prev) => prev.map((d) => (d.id === documentId ? result.data : d)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(documentId: string) {
    if (!confirm('¿Eliminar este documento?')) return;
    setBusyId(documentId);
    try {
      const result = await deleteDocumentAction(documentId, candidateId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Documentos y contratos de imagen</p>

      {documents.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos cargados todavía.</p>}

      <ul className="space-y-1.5">
        {documents.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
            {/* `fileUrl` viene vacío para tipos sensibles (p. ej. MEDICAL_CERTIFICATE):
                stripSensitiveFileUrl lo blanquea en el servidor. En ese caso se usa la
                ruta autenticada, igual que PhotosSection — nunca se reconstruye ni se
                expone la URL pública real del blob. */}
            <a
              href={doc.fileUrl || `/api/candidates/${candidateId}/documents/${doc.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-primary underline-offset-2 hover:underline"
            >
              {doc.title}
            </a>
            {doc.expiresAt && (
              <span className="text-[11px] text-muted-foreground">Vence {new Date(doc.expiresAt).toLocaleDateString('es-CL')}</span>
            )}
            <StatusBadge tone={STATUS_TONE[doc.status] ?? 'neutral'}>{CANDIDATE_DOCUMENT_STATUS_LABELS[doc.status]}</StatusBadge>
            {canWrite && (
              <>
                {doc.status === 'PENDING' && (
                  <Button type="button" size="xs" variant="outline" disabled={busyId === doc.id} onClick={() => handleMarkSigned(doc.id)}>
                    Marcar firmado
                  </Button>
                )}
                <Button type="button" size="icon-xs" variant="destructive" disabled={busyId === doc.id} onClick={() => handleDelete(doc.id)}>
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      {canWrite && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <div>
            <Label htmlFor="doc-title">Título</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contrato de imagen" />
          </div>
          <div>
            <Label htmlFor="doc-expires">Vence</Label>
            <Input id="doc-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="doc-file">Archivo (PDF/imagen)</Label>
            <input ref={fileInputRef} id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg" className="text-sm" />
          </div>
          <Button type="button" size="sm" onClick={handleUpload} disabled={uploading}>{uploading ? 'Subiendo...' : 'Subir documento'}</Button>
        </div>
      )}
    </div>
  );
}
