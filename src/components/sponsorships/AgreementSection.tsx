'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileText, CheckCircle2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { markAgreementSignedAction } from '@/modules/sponsorships/actions/sponsorships.actions';
import type { AgreementStatus } from '@/modules/sponsorships/services/sponsorships.service';

const STATUS_LABEL: Record<AgreementStatus, string> = {
  NOT_GENERATED: 'No generada',
  PENDING_SIGNATURE: 'Pendiente de firma',
  SIGNED: 'Firmada',
};

const STATUS_TONE: Record<AgreementStatus, 'neutral' | 'warning' | 'success'> = {
  NOT_GENERATED: 'neutral',
  PENDING_SIGNATURE: 'warning',
  SIGNED: 'success',
};

export default function AgreementSection({ contractId, status, canWrite }: { contractId: string; status: AgreementStatus; canWrite: boolean }) {
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);

  async function handleMarkSigned() {
    setBusy(true);
    try {
      const result = await markAgreementSignedAction(contractId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLocalStatus('SIGNED');
      toast.success('Carta marcada como firmada');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Carta de compromiso</p>
        <StatusBadge tone={STATUS_TONE[localStatus]}>{STATUS_LABEL[localStatus]}</StatusBadge>
      </div>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {localStatus !== 'SIGNED' && (
            <a href={`/api/sponsorships/commitment-letter?contractId=${contractId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <FileText /> {localStatus === 'NOT_GENERATED' ? 'Generar carta' : 'Regenerar carta'}
            </a>
          )}
          {localStatus === 'PENDING_SIGNATURE' && (
            <Button type="button" variant="default" size="sm" disabled={busy} onClick={handleMarkSigned}>
              <CheckCircle2 /> {busy ? 'Guardando...' : 'Marcar como firmada'}
            </Button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Usa la <Link href="/dashboard/sponsorships/template" className="text-primary hover:underline">plantilla estándar</Link>.
      </p>
    </div>
  );
}
