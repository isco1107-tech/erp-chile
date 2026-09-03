'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getJudgeContextAction, saveDraftScoreAction, submitScoreAction } from '@/modules/judging/actions/public-judging.actions';
import type { JudgeContext } from '@/modules/judging/services/judging.service';

/**
 * Pantalla del jurado: una categoría a la vez, tarjetas grandes por
 * candidata (estilo Obsidian HUD, pensado para tocar desde un tablet en el
 * escenario/backstage, no para un mouse). Sin sesión de usuario ERP — todo
 * corre contra `accessToken` vía las Server Actions públicas.
 */
export default function JudgeScoringClient({ token }: { token: string }) {
  const [context, setContext] = useState<JudgeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function reload() {
    const result = await getJudgeContextAction(token);
    if (!result.success) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setContext(result.data);
    if (result.data.categories.length > 0) {
      setCategoryId((prev) =>
        prev && result.data.categories.some((c) => c.id === prev) ? prev : result.data.categories[0]!.id
      );
    } else {
      setCategoryId('');
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <p className="p-8 text-center text-muted-foreground">Cargando...</p>;
  if (notFound || !context) {
    return <p className="p-8 text-center text-destructive">Link de jurado inválido o expirado. Contacta a la producción del certamen.</p>;
  }

  const ctx = context;

  if (!ctx.activeRound) {
    return (
      <div className="hud-scroll flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="hud-surface max-w-md space-y-2 rounded-xl p-6 text-center">
          <p className="hud-label">Jurado</p>
          <h1 className="text-xl font-bold">{context.judgeAssignment.judgeName}</h1>
          <p className="text-sm text-muted-foreground">{context.project.name} ({context.project.code})</p>
          <p className="pt-4 text-lg font-semibold">No hay votación activa en este momento</p>
          <p className="text-sm text-muted-foreground">Espera a que producción abra la siguiente ronda. Esta pantalla se actualiza sola.</p>
        </div>
      </div>
    );
  }

  const activeRound = ctx.activeRound;
  const category = ctx.categories.find((c) => c.id === categoryId);

  function scoreFor(candidateId: string): { value: string; sheet: (typeof ctx.scoreSheets)[number] | undefined } {
    const existing = ctx.scoreSheets.find((s) => s.candidateId === candidateId && s.categoryId === categoryId);
    return { value: scores[`${candidateId}:${categoryId}`] ?? (existing ? String(existing.score) : ''), sheet: existing };
  }

  async function handleSave(candidateId: string) {
    const { value } = scoreFor(candidateId);
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > (category?.maxScore ?? 10)) {
      toast.error(`Ingresa un puntaje entre 0 y ${category?.maxScore ?? 10}`);
      return;
    }
    setBusyKey(`save:${candidateId}`);
    try {
      const result = await saveDraftScoreAction(token, { candidateId, categoryId, score });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Guardado (borrador)');
      await reload();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSubmit(candidateId: string) {
    const { value } = scoreFor(candidateId);
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > (category?.maxScore ?? 10)) {
      toast.error(`Ingresa un puntaje entre 0 y ${category?.maxScore ?? 10}`);
      return;
    }
    if (!confirm('¿Enviar este puntaje? No podrás editarlo después.')) return;
    setBusyKey(`submit:${candidateId}`);
    try {
      const result = await submitScoreAction(token, { candidateId, categoryId, score });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Puntaje enviado');
      await reload();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="hud-scroll min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="hud-surface rounded-xl p-4">
          <p className="hud-label">Jurado</p>
          <h1 className="text-xl font-bold">{context.judgeAssignment.judgeName}</h1>
          <p className="text-sm text-muted-foreground">{context.project.name} ({context.project.code})</p>
          <p className="mt-1 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">Ronda {activeRound.order}: {activeRound.name}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {context.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryId(cat.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                cat.id === categoryId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {category && (
          <div className="space-y-3">
            {context.candidates.map((candidate) => {
              const { value, sheet } = scoreFor(candidate.id);
              const isSubmitted = sheet?.status === 'SUBMITTED';
              return (
                <div key={candidate.id} className="hud-surface flex items-center gap-4 rounded-xl p-4">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/40 text-lg font-bold">
                    {candidate.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.photoUrl} alt={candidate.fullName} className="size-full object-cover" />
                    ) : (
                      (candidate.stageName || candidate.fullName).slice(0, 1)
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{candidate.stageName || candidate.fullName}</p>
                    {isSubmitted && <p className="text-xs text-success">Puntaje enviado: {sheet!.score}</p>}
                  </div>
                  {!isSubmitted && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={category.maxScore}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setScores((prev) => ({ ...prev, [`${candidate.id}:${categoryId}`]: e.target.value }))}
                        className="h-12 w-20 rounded-xl border border-input bg-muted text-center text-lg font-bold text-foreground"
                      />
                      <button
                        type="button"
                        disabled={busyKey === `save:${candidate.id}`}
                        onClick={() => handleSave(candidate.id)}
                        className="h-12 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === `submit:${candidate.id}`}
                        onClick={() => handleSubmit(candidate.id)}
                        className="h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        Enviar
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {context.candidates.length === 0 && <p className="text-muted-foreground">No hay candidatas oficiales/finalistas cargadas todavía.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
