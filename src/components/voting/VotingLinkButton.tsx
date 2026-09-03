'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getOrCreateVoteSalesLinkAction, regenerateVoteSalesLinkAction } from '@/modules/public-voting/actions/public-voting-admin.actions';

/**
 * Botón para el equipo interno: genera (o reutiliza) el link público de
 * votación de un proyecto. A diferencia de `TicketingLinkButton`, pide el
 * precio por voto ANTES de generar — el precio queda codificado en el propio
 * token (ver nota de arquitectura en `public-voting/schema.ts`), así que un
 * precio distinto exige un link nuevo, no solo "regenerar".
 */
export default function VotingLinkButton({ projectId, currentPrice }: { projectId: string; currentPrice: number | null }) {
  const [price, setPrice] = useState(currentPrice ? String(currentPrice) : '100');
  const [busy, setBusy] = useState<'get' | 'regen' | null>(null);

  function votingUrl(token: string): string {
    return `${window.location.origin}/votar/${token}`;
  }

  async function handleCopy() {
    const pricePerVote = Number(price);
    if (!Number.isInteger(pricePerVote) || pricePerVote <= 0) {
      toast.error('Ingresa un precio por voto válido (entero mayor a cero)');
      return;
    }
    setBusy('get');
    try {
      const result = await getOrCreateVoteSalesLinkAction(projectId, { pricePerVote });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(votingUrl(result.data.token));
      toast.success('Link de votación copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    const pricePerVote = Number(price);
    if (!Number.isInteger(pricePerVote) || pricePerVote <= 0) {
      toast.error('Ingresa un precio por voto válido (entero mayor a cero)');
      return;
    }
    if (!confirm('¿Regenerar el link? El link anterior dejará de funcionar de inmediato.')) return;
    setBusy('regen');
    try {
      const result = await regenerateVoteSalesLinkAction(projectId, { pricePerVote });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await navigator.clipboard.writeText(votingUrl(result.data.token));
      toast.success('Link regenerado y copiado al portapapeles');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-32">
        <Label htmlFor="vote-price">Precio por voto</Label>
        <Input id="vote-price" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={handleCopy}>
        <Link2 />
        {busy === 'get' ? 'Copiando...' : 'Copiar link de votación'}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="Regenerar link (invalida el anterior)" disabled={busy !== null} onClick={handleRegenerate}>
        <RefreshCw />
      </Button>
    </div>
  );
}
