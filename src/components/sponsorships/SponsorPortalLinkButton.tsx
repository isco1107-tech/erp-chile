'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrCreatePortalLinkAction, regeneratePortalLinkAction } from '@/modules/sponsorships/actions/sponsorships.actions';

import { useConfirm } from '@/components/ui/confirm-provider';
/**
 * Botón para el equipo interno: genera (o reutiliza) el link del portal de la
 * marca y lo copia al portapapeles. El token nunca se muestra directo en la
 * UI más allá del link completo — copiarlo es la única acción disponible,
 * para no invitar a compartirlo pegado en un chat sin la URL completa.
 */
export default function SponsorPortalLinkButton({ contractId }: { contractId: string }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'get' | 'regen' | null>(null);

  function portalUrl(portalToken: string): string {
    return `${window.location.origin}/sponsors/${portalToken}`;
  }

  async function handleCopy() {
    setBusy('get');
    try {
      const result = await getOrCreatePortalLinkAction(contractId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(portalUrl(result.data.portalToken));
      toast.success('Link del portal copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    if (!await confirm('¿Regenerar el link? El link anterior dejará de funcionar de inmediato.')) return;
    setBusy('regen');
    try {
      const result = await regeneratePortalLinkAction(contractId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(portalUrl(result.data.portalToken));
      toast.success('Link regenerado y copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={handleCopy}>
        <Link2 />
        {busy === 'get' ? 'Copiando...' : 'Copiar link del portal'}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="Regenerar link (invalida el anterior)" disabled={busy !== null} onClick={handleRegenerate}>
        <RefreshCw />
      </Button>
    </div>
  );
}
