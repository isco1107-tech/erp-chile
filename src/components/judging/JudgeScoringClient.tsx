'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Gavel } from 'lucide-react';
import { getJudgeContextAction, saveDraftScoreAction, submitScoreAction } from '@/modules/judging/actions/public-judging.actions';
import type { JudgeContext } from '@/modules/judging/services/judging.service';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicFooter,
  PublicPage,
  PublicProgress,
  PublicShell,
  PublicStatus,
  PublicTopBar,
} from '@/components/public/PublicShell';

/**
 * Pantalla del jurado: una categoría a la vez, tarjetas grandes por
 * candidata, pensadas para tocar desde un tablet en backstage y no para un
 * mouse. Sin sesión de usuario ERP — todo corre contra `accessToken` vía las
 * Server Actions públicas.
 *
 * Diseño: sistema público compartido (`@/components/public/PublicShell`), con
 * acento cian. Sobre el diseño anterior se agregó el progreso de la ronda
 * ("cuántas candidatas ya puntué en esta categoría"), que era la pregunta que
 * el jurado no podía responder sin recorrer la lista entera.
 */
export default function JudgeScoringClient({ token }: { token: string }) {
  const [context, setContext] = useState<JudgeContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
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
  }, [token]);

  useEffect(() => {
    void reload();
    const interval = setInterval(() => void reload(), 8000);
    return () => clearInterval(interval);
  }, [reload]);

  if (loading) return <PublicStatus variant="loading" message="Cargando tu panel de jurado…" />;

  if (notFound || !context) {
    return (
      <PublicStatus
        variant="error"
        title="Link de jurado inválido o expirado"
        message="Contacta a la producción del certamen para recibir uno vigente."
      />
    );
  }

  const ctx = context;

  if (!ctx.activeRound) {
    return (
      <PublicPage accent="cyan">
        <PublicTopBar brand={ctx.project.name} right={ctx.project.code} />
        <PublicShell>
          <PublicCard glow>
            <PublicCardHeader
              icon={<Gavel size={22} strokeWidth={1.6} />}
              eyebrow="Jurado"
              title={ctx.judgeAssignment.judgeName}
              subtitle="No hay votación activa en este momento."
            />
            <div className="pub-panel" style={{ textAlign: 'center' }}>
              <p className="pub-hint" style={{ margin: 0 }}>
                Espera a que producción abra la siguiente ronda. Esta pantalla se actualiza sola.
              </p>
            </div>
          </PublicCard>
        </PublicShell>
        <PublicFooter>{ctx.project.name} · Panel de jurado</PublicFooter>
      </PublicPage>
    );
  }

  const activeRound = ctx.activeRound;
  const category = ctx.categories.find((c) => c.id === categoryId);

  function scoreFor(candidateId: string): { value: string; sheet: (typeof ctx.scoreSheets)[number] | undefined } {
    const existing = ctx.scoreSheets.find((s) => s.candidateId === candidateId && s.categoryId === categoryId);
    return { value: scores[`${candidateId}:${categoryId}`] ?? (existing ? String(existing.score) : ''), sheet: existing };
  }

  const submittedInCategory = ctx.candidates.filter(
    (c) => ctx.scoreSheets.find((s) => s.candidateId === c.id && s.categoryId === categoryId)?.status === 'SUBMITTED'
  ).length;

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
    <PublicPage accent="cyan">
      <PublicTopBar brand={ctx.project.name} right={ctx.project.code} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Gavel size={22} strokeWidth={1.6} />}
            eyebrow="Jurado"
            title={ctx.judgeAssignment.judgeName}
            subtitle={
              <>
                Ronda {activeRound.order}: <strong>{activeRound.name}</strong>
              </>
            }
            align="start"
          />
          {ctx.candidates.length > 0 && (
            <PublicProgress
              percent={(submittedInCategory / ctx.candidates.length) * 100}
              label={`${submittedInCategory} de ${ctx.candidates.length} puntajes enviados${category ? ` en ${category.name}` : ''}`}
            />
          )}
        </PublicCard>

        {ctx.categories.length > 0 && (
          <div className="pub-chips" role="tablist" aria-label="Categorías">
            {ctx.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={cat.id === categoryId}
                onClick={() => setCategoryId(cat.id)}
                className={`pub-chip ${cat.id === categoryId ? 'is-active' : ''}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {category && (
          <div className="pub-judge-list">
            {ctx.candidates.map((candidate) => {
              const { value, sheet } = scoreFor(candidate.id);
              const isSubmitted = sheet?.status === 'SUBMITTED';
              const name = candidate.stageName || candidate.fullName;
              return (
                <PublicCard key={candidate.id} className="pub-judge-card">
                  <div className="pub-judge-head">
                    <span className="pub-option-avatar" aria-hidden="true">
                      {candidate.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={candidate.photoUrl} alt="" />
                      ) : (
                        name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <div className="pub-judge-name">
                      <span>{name}</span>
                      {isSubmitted ? (
                        <PublicBadge tone="ok">Enviado · {sheet!.score} pts</PublicBadge>
                      ) : sheet ? (
                        <PublicBadge tone="warn">Borrador · {sheet.score} pts</PublicBadge>
                      ) : (
                        <PublicBadge>Sin puntaje</PublicBadge>
                      )}
                    </div>
                  </div>

                  {!isSubmitted && (
                    <div className="pub-judge-actions">
                      <label className="pub-judge-score">
                        <span>Puntaje</span>
                        <input
                          type="number"
                          min={0}
                          max={category.maxScore}
                          inputMode="numeric"
                          aria-label={`Puntaje de ${name} en ${category.name}, de 0 a ${category.maxScore}`}
                          value={value}
                          onChange={(e) => setScores((prev) => ({ ...prev, [`${candidate.id}:${categoryId}`]: e.target.value }))}
                        />
                        <span className="pub-judge-max">/ {category.maxScore}</span>
                      </label>
                      <div className="pub-judge-buttons">
                        <PublicButton
                          type="button"
                          variant="ghost"
                          disabled={busyKey === `save:${candidate.id}`}
                          onClick={() => void handleSave(candidate.id)}
                        >
                          Guardar
                        </PublicButton>
                        <PublicButton
                          type="button"
                          disabled={busyKey === `submit:${candidate.id}`}
                          onClick={() => void handleSubmit(candidate.id)}
                        >
                          Enviar
                        </PublicButton>
                      </div>
                    </div>
                  )}
                </PublicCard>
              );
            })}
            {ctx.candidates.length === 0 && (
              <p className="pub-hint">No hay candidatas oficiales/finalistas cargadas todavía.</p>
            )}
          </div>
        )}
      </PublicShell>
      <PublicFooter>{ctx.project.name} · Panel de jurado · Esta pantalla se actualiza sola</PublicFooter>
    </PublicPage>
  );
}
