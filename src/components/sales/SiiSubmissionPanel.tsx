'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { refreshSiiStatusAction, submitToSiiAction } from '@/modules/dte/actions/sii.actions';

type SiiStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'ACCEPTED_WITH_OBJECTIONS' | 'REJECTED';

const STATUS_LABEL: Record<SiiStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Timbrado, sin enviar', tone: 'warning' },
  SENT: { label: 'Enviado, esperando respuesta', tone: 'info' },
  ACCEPTED: { label: 'Aceptado', tone: 'success' },
  ACCEPTED_WITH_OBJECTIONS: { label: 'Aceptado con reparos', tone: 'warning' },
  REJECTED: { label: 'Rechazado', tone: 'danger' },
};

/**
 * Estado del documento ante el SII y sus dos pasos: enviar y consultar.
 * `simulation` indica que el servidor corre en modo simulado (sin certificado):
 * el panel lo dice con todas sus letras para que nadie lo tome por real.
 */
export default function SiiSubmissionPanel({
  documentId,
  status,
  trackId,
  detail,
  simulation,
}: {
  documentId: string;
  status: SiiStatus;
  trackId: string | null;
  detail: string | null;
  simulation: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const info = STATUS_LABEL[status];

  async function run(action: (id: string) => Promise<{ success: boolean; error?: string; message?: string }>) {
    setBusy(true);
    const result = await action(documentId);
    setBusy(false);
    if (!result.success) return void toast.error(result.error ?? 'No se pudo completar la operación');
    toast.success(result.message ?? 'Listo');
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Envío al SII</h2>
        <StatusBadge tone={info.tone}>{info.label}</StatusBadge>
      </div>

      {simulation && (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          Modo simulación: el flujo es real, pero el «SII» es Aether. Nada de esto tiene validez tributaria.
        </p>
      )}

      {trackId && (
        <p className="text-sm">
          <span className="text-muted-foreground">Track ID: </span>
          <span className="font-mono">{trackId}</span>
        </p>
      )}
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}

      <div className="flex flex-wrap gap-2">
        {status === 'PENDING' && (
          <Button type="button" disabled={busy || !simulation} onClick={() => run(submitToSiiAction)}>
            <Send aria-hidden="true" /> Enviar al SII
          </Button>
        )}
        {status === 'SENT' && (
          <Button type="button" variant="outline" disabled={busy || !simulation} onClick={() => run(refreshSiiStatusAction)}>
            <RefreshCw aria-hidden="true" /> Consultar estado
          </Button>
        )}
      </div>

      {!simulation && (status === 'PENDING' || status === 'SENT') && (
        <p className="text-xs text-muted-foreground">
          El envío real requiere el certificado digital de la empresa y la certificación del SII; todavía no están configurados.
        </p>
      )}
    </section>
  );
}
