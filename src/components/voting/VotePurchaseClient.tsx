'use client';

import { useEffect, useRef, useState } from 'react';
import { Vote, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency } from '@/lib/chile/tax';
import { publicVotePurchaseSchema, VOTE_PURCHASE_HONEYPOT_FIELD } from '@/modules/public-voting/schema';
import { getPublicVotingProjectAction } from '@/modules/public-voting/actions/public-voting.actions';
import type { PublicVotingProjectInfo } from '@/modules/public-voting/services/public-voting.service';

/** Página pública de votación pagada (`/votar/[token]`). Mismo flujo de pago manual que `TicketPurchaseClient`. */
export default function VotePurchaseClient({ token }: { token: string }) {
  const [project, setProject] = useState<PublicVotingProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [candidateId, setCandidateId] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [voteCount, setVoteCount] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<{ candidateName: string; voteCount: number; totalAmount: number } | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const result = await getPublicVotingProjectAction(token);
      if (!result.success) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProject(result.data);
      if (result.data.candidates.length > 0) setCandidateId(result.data.candidates[0]!.id);
      setLoading(false);
    })();
  }, [token]);

  const total = project ? project.pricePerVote * voteCount : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (honeypotRef.current?.value) return;

    const parsed = publicVotePurchaseSchema.safeParse({ candidateId, buyerEmail, buyerPhone: buyerPhone || undefined, voteCount });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch(`/api/public/votes/${token}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, [VOTE_PURCHASE_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '' }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { candidateName: string; voteCount: number; totalAmount: number };
        error?: string;
      };
      if (!json.success || !json.data) {
        setErrors({ form: json.error ?? 'No se pudo procesar tu compra. Intenta de nuevo.' });
        return;
      }
      setConfirmation(json.data);
    } catch {
      setErrors({ form: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">Cargando…</div>;
  }

  if (notFound || !project) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Link de votación inválido o expirado</p>
        <p className="text-sm text-muted-foreground">Contacta a la organización del certamen para obtener uno vigente.</p>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="mb-2 size-10 text-green-600" />
            <CardTitle>¡Recibimos tu voto!</CardTitle>
            <CardDescription>{project.projectName} · {project.companyName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p>Candidata: <strong>{confirmation.candidateName}</strong></p>
              <p>Votos: <strong>{confirmation.voteCount}</strong></p>
              <p>Total a transferir: <strong>{formatCurrency(confirmation.totalAmount)}</strong></p>
            </div>
            <div>
              <p className="mb-1 font-semibold">Datos para transferencia</p>
              {project.bankTransferInfo ? (
                <p className="whitespace-pre-line rounded-lg border border-dashed border-border p-3 text-muted-foreground">{project.bankTransferInfo}</p>
              ) : (
                <p className="text-muted-foreground">La organización te contactará con los datos para transferir.</p>
              )}
            </div>
            <p className="text-muted-foreground">
              Tus votos se suman al conteo público una vez que el equipo organizador confirme tu pago.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Vote className="mb-2 size-8 text-primary" />
          <CardTitle>{project.projectName}</CardTitle>
          <CardDescription>{project.companyName} · Vota por tu candidata favorita — {formatCurrency(project.pricePerVote)} por voto</CardDescription>
        </CardHeader>
        <CardContent>
          {project.candidates.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Todavía no hay candidatas habilitadas para votar en este certamen.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={honeypotRef}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute h-0 w-0 overflow-hidden opacity-0"
                name={VOTE_PURCHASE_HONEYPOT_FIELD}
              />

              <div className="space-y-1.5">
                <Label htmlFor="candidateId">Candidata</Label>
                <select
                  id="candidateId"
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  {project.candidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.stageName || c.fullName}</option>
                  ))}
                </select>
                {errors.candidateId && <p className="text-xs text-destructive">{errors.candidateId}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voteCount">Cantidad de votos</Label>
                <Input id="voteCount" type="number" min={1} max={10000} value={voteCount} onChange={(e) => setVoteCount(Number(e.target.value) || 1)} />
                {errors.voteCount && <p className="text-xs text-destructive">{errors.voteCount}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buyerEmail">Correo electrónico</Label>
                <Input id="buyerEmail" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
                {errors.buyerEmail && <p className="text-xs text-destructive">{errors.buyerEmail}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buyerPhone">Teléfono (opcional)</Label>
                <Input id="buyerPhone" type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+56 9 1234 5678" />
                {errors.buyerPhone && <p className="text-xs text-destructive">{errors.buyerPhone}</p>}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>Total a pagar: <strong>{formatCurrency(total)}</strong></p>
              </div>

              {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Procesando…' : 'Confirmar votos'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
