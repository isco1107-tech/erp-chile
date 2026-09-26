'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrCreateRegistrationLinkAction, regenerateRegistrationLinkAction } from '@/modules/candidates/actions/candidates.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
import { publicUrl } from '@/lib/public-url';
/**
 * Botón para el equipo interno: genera (o reutiliza) el link público de
 * auto-inscripción de un certamen y lo copia al portapapeles. Mismo criterio
 * que `SponsorPortalLinkButton` — copiar es la única acción disponible, el
 * token nunca se muestra suelto en la UI.
 */
export default function CandidateRegistrationLinkButton({ projectId }: { projectId: string }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'get' | 'regen' | null>(null);

  function registrationUrl(token: string): string {
    return publicUrl(`/register/candidate/${token}`);
  }

  async function handleCopy() {
    setBusy('get');
    try {
      const result = await getOrCreateRegistrationLinkAction(projectId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(registrationUrl(result.data.token));
      toast.success('Link de inscripción copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    if (!await confirm('¿Regenerar el link? El link anterior dejará de funcionar de inmediato — cualquier postulante que aún no lo haya usado necesitará el nuevo.')) return;
    setBusy('regen');
    try {
      const result = await regenerateRegistrationLinkAction(projectId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(registrationUrl(result.data.token));
      toast.success('Link regenerado y copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={handleCopy}>
        <Link2 />
        {busy === 'get' ? 'Copiando...' : 'Copiar link de inscripción'}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="Regenerar link (invalida el anterior)" disabled={busy !== null} onClick={handleRegenerate}>
        <RefreshCw />
      </Button>
    </div>
  );
}
