'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileSignature, FileCheck2, Copy, Download } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ContractDoc = {
  id: string;
  status: 'PENDING' | 'SIGNED' | 'EXPIRED';
  fileUrl: string;
  zapsignSignUrl: string | null;
} | null;

export default function ContractSignatureSection({ candidateId, candidateEmail, document }: { candidateId: string; candidateEmail: string | null; document: ContractDoc }) {
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(document);

  async function handleRequestSignature() {
    if (!candidateEmail) {
      toast.error('La candidata no tiene email registrado — agrégalo en su ficha primero');
      return;
    }
    if (!confirm(`¿Enviar el contrato a firmar al correo ${candidateEmail}? Se generará el PDF desde la plantilla vigente.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/contract/request-signature?candidateId=${candidateId}`);
      const result = await res.json();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLocal({ id: result.data.documentId, status: 'PENDING', fileUrl: local?.fileUrl ?? '', zapsignSignUrl: result.data.signUrl });
      toast.success('Contrato enviado a firma por correo');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!local?.zapsignSignUrl) return;
    await navigator.clipboard.writeText(local.zapsignSignUrl);
    toast.success('Link de firma copiado');
  }

  const isSigned = local?.status === 'SIGNED';
  const isPending = local && !isSigned;

  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Contrato de imagen</p>
        {local && <StatusBadge tone={isSigned ? 'success' : 'warning'}>{isSigned ? 'Firmada' : 'Pendiente de firma'}</StatusBadge>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isSigned && (
          <Button type="button" variant="default" size="sm" disabled={busy} onClick={handleRequestSignature}>
            <FileSignature /> {busy ? 'Enviando...' : local ? 'Reenviar a firma' : 'Solicitar firma por correo'}
          </Button>
        )}
        {isPending && local?.zapsignSignUrl && (
          <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
            <Copy /> Copiar link de firma
          </Button>
        )}
        {isSigned && local?.fileUrl && (
          <a href={local.fileUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <FileCheck2 /> Ver contrato firmado
          </a>
        )}
        <a href={`/api/candidates/contract?candidateId=${candidateId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <Download /> Descargar borrador
        </a>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Usa la <Link href="/dashboard/candidates/template" className="text-primary hover:underline">plantilla estándar</Link>. La firma es electrónica
        avanzada vía ZapSign; el correo llega automáticamente a la candidata.
      </p>
    </div>
  );
}
