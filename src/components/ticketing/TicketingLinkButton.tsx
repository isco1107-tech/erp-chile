'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrCreateTicketSalesLinkAction, regenerateTicketSalesLinkAction } from '@/modules/ticketing/actions/ticketing.actions';

/**
 * Botón para el equipo interno: genera (o reutiliza) el link público de venta
 * de entradas de un proyecto y lo copia al portapapeles. Mismo criterio que
 * `CandidateRegistrationLinkButton`.
 */
export default function TicketingLinkButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState<'get' | 'regen' | null>(null);

  function ticketsUrl(token: string): string {
    return `${window.location.origin}/tickets/${token}`;
  }

  async function handleCopy() {
    setBusy('get');
    try {
      const result = await getOrCreateTicketSalesLinkAction(projectId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(ticketsUrl(result.data.token));
      toast.success('Link de venta de entradas copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    if (!confirm('¿Regenerar el link? El link anterior dejará de funcionar de inmediato.')) return;
    setBusy('regen');
    try {
      const result = await regenerateTicketSalesLinkAction(projectId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(ticketsUrl(result.data.token));
      toast.success('Link regenerado y copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={handleCopy}>
        <Link2 />
        {busy === 'get' ? 'Copiando...' : 'Copiar link de venta'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="Regenerar link (invalida el anterior)"
        aria-label="Regenerar link (invalida el anterior)"
        disabled={busy !== null}
        onClick={handleRegenerate}
      >
        <RefreshCw />
      </Button>
    </div>
  );
}
