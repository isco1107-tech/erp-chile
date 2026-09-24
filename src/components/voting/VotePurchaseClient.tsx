'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Minus, Plus, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { publicVotePurchaseSchema, VOTE_PURCHASE_HONEYPOT_FIELD } from '@/modules/public-voting/schema';
import { getPublicVotingProjectAction } from '@/modules/public-voting/actions/public-voting.actions';
import type { PublicVotingProjectInfo } from '@/modules/public-voting/services/public-voting.service';
import {
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicRow,
  PublicShell,
  PublicStatus,
  PublicTopBar,
  PublicTotal,
} from '@/components/public/PublicShell';

/**
 * Página pública de votación pagada (`/votar/[token]`). Mismo flujo de pago
 * manual que `TicketPurchaseClient`: la orden queda pendiente hasta que el
 * equipo organizador confirma la transferencia.
 *
 * Diseño: sistema público compartido (`@/components/public/PublicShell`). La
 * candidata se elige en tarjetas con foto en vez de un `<select>` — es una
 * decisión emocional, no un campo de formulario más, y el nombre suelto en un
 * desplegable no dice a quién se está votando.
 */
const VOTE_PRESETS = [1, 5, 10, 25, 50] as const;
const MAX_VOTES = 10_000;

export default function VotePurchaseClient({ token, initialCandidateId }: { token: string; initialCandidateId?: string }) {
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
      const preferred = result.data.candidates.find((c) => c.id === initialCandidateId) ?? result.data.candidates[0];
      if (preferred) setCandidateId(preferred.id);
      setLoading(false);
    })();
  }, [token, initialCandidateId]);

  const total = project ? project.pricePerVote * voteCount : 0;
  const selected = project?.candidates.find((c) => c.id === candidateId) ?? null;

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

  if (loading) return <PublicStatus accent="rose" variant="loading" message="Cargando la votación…" />;

  if (notFound || !project) {
    return (
      <PublicStatus
        accent="rose"
        variant="error"
        title="Link de votación inválido o expirado"
        message="Contacta a la organización del certamen para obtener uno vigente."
      />
    );
  }

  if (confirmation) {
    return (
      <PublicPage accent="rose">
        <PublicTopBar brand={project.companyName} right={project.projectName} />
        <PublicShell>
          <PublicCard glow>
            <PublicCardHeader
              icon={<Heart size={22} strokeWidth={1.6} />}
              eyebrow="Voto registrado"
              title="¡Recibimos tu voto!"
              subtitle={`${project.projectName} · ${project.companyName}`}
            />
            <div className="pub-panel">
              <PublicRow label="Candidata" value={confirmation.candidateName} />
              <PublicRow label="Votos" value={confirmation.voteCount} />
              <PublicRow label="Total a transferir" value={formatCurrency(confirmation.totalAmount)} strong />
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <p className="pub-eyebrow" style={{ margin: 0 }}>Datos para transferencia</p>
              {project.bankTransferInfo ? (
                <p className="pub-transfer">{project.bankTransferInfo}</p>
              ) : (
                <p className="pub-hint">La organización te contactará con los datos para transferir.</p>
              )}
              <p className="pub-hint">
                Tus votos se suman al conteo público una vez que el equipo organizador confirme tu pago.
              </p>
            </div>
          </PublicCard>
        </PublicShell>
        <PublicFooter>{project.companyName} · Votación oficial</PublicFooter>
      </PublicPage>
    );
  }

  return (
    <PublicPage accent="rose">
      <PublicTopBar brand={project.companyName} right="Votación oficial" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Heart size={22} strokeWidth={1.6} />}
            eyebrow="Votación"
            title={project.projectName}
            subtitle={`Vota por tu candidata favorita — ${formatCurrency(project.pricePerVote)} por voto.`}
          />

          {project.candidates.length === 0 ? (
            <p className="pub-hint" style={{ textAlign: 'center' }}>
              Todavía no hay candidatas habilitadas para votar en este certamen.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="pub-form" noValidate>
              <input
                ref={honeypotRef}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="pub-honeypot"
                name={VOTE_PURCHASE_HONEYPOT_FIELD}
              />

              <fieldset className="pub-optionset">
                <legend>Candidata</legend>
                {project.candidates.map((c) => {
                  const name = c.name;
                  return (
                    <label key={c.id} className={`pub-option ${candidateId === c.id ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="candidateId"
                        value={c.id}
                        checked={candidateId === c.id}
                        onChange={() => setCandidateId(c.id)}
                      />
                      <span className="pub-option-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                      <span className="pub-option-body">
                        <span className="pub-option-name">{name}</span>
                        {c.number !== null && !name.includes(`N° ${c.number}`) && (
                          <span className="pub-hint" style={{ fontSize: '0.75rem' }}>Candidata N° {c.number}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {errors.candidateId && <p className="pub-error">{errors.candidateId}</p>}
              </fieldset>

              <PublicField id="voteCount" label="Cantidad de votos" error={errors.voteCount}>
                <div className="pub-stepper">
                  <button type="button" onClick={() => setVoteCount((v) => Math.max(1, v - 1))} aria-label="Quitar un voto">
                    <Minus size={16} strokeWidth={2} />
                  </button>
                  <input
                    id="voteCount"
                    type="number"
                    min={1}
                    max={MAX_VOTES}
                    inputMode="numeric"
                    value={voteCount}
                    onChange={(e) => setVoteCount(Math.min(MAX_VOTES, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <button type="button" onClick={() => setVoteCount((v) => Math.min(MAX_VOTES, v + 1))} aria-label="Agregar un voto">
                    <Plus size={16} strokeWidth={2} />
                  </button>
                </div>
              </PublicField>

              <div className="pub-chips">
                {VOTE_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`pub-chip ${voteCount === n ? 'is-active' : ''}`}
                    onClick={() => setVoteCount(n)}
                  >
                    {n} {n === 1 ? 'voto' : 'votos'}
                  </button>
                ))}
              </div>

              <PublicField id="buyerEmail" label="Correo electrónico" error={errors.buyerEmail} hint="Ahí te llega el comprobante de tu voto.">
                <input id="buyerEmail" type="email" autoComplete="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
              </PublicField>

              <PublicField id="buyerPhone" label="Teléfono" optional error={errors.buyerPhone}>
                <input id="buyerPhone" type="tel" autoComplete="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+56 9 1234 5678" />
              </PublicField>

              <PublicTotal
                label="Total a pagar"
                value={formatCurrency(total)}
                note={selected ? `${voteCount} × ${formatCurrency(project.pricePerVote)} para ${selected.name}` : undefined}
              />

              {errors.form && <p className="pub-error-form">{errors.form}</p>}

              <PublicButton type="submit" full disabled={saving}>
                {saving ? 'Procesando…' : 'Confirmar votos'}
              </PublicButton>

              <p className="pub-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                <ShieldCheck size={14} strokeWidth={1.7} /> No se pide ningún dato de tarjeta en esta página.
              </p>
            </form>
          )}
        </PublicCard>
      </PublicShell>
      <PublicFooter>{project.companyName} · Votación oficial</PublicFooter>
    </PublicPage>
  );
}
