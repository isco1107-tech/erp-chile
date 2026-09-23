'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CompetitionRound, JudgeAssignment, JudgingCategory } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  Award,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  autoBalanceCategoryWeightsAction,
  closeRoundAction,
  createCategoryAction,
  createJudgeAssignmentAction,
  createRoundAction,
  deleteCategoryAction,
  deleteJudgeAssignmentAction,
  deleteRoundAction,
  getCategoryWeightTotalAction,
  getRoundResultsAction,
  listCategoriesAction,
  listJudgeAssignmentsAction,
  listJudgingProjectOptionsAction,
  listRoundsAction,
  openRoundAction,
  reopenRoundAction,
} from '@/modules/judging/actions/judging.actions';
import type { JudgingProjectOption } from '@/modules/judging/services/judging.service';
import type { RoundResultRow } from '@/modules/judging/services/rounds.service';

import { useConfirm } from '@/components/ui/confirm-provider';
const POLL_MS = 4000;

const ROUND_STATUS_LABEL: Record<CompetitionRound['status'], string> = {
  DRAFT: 'Borrador',
  READY: 'Lista para votar',
  VOTING: 'En votación (En vivo)',
  VOTING_CLOSED: 'Votación finalizada',
  COMPLETED: 'Completada',
};

const ROUND_STATUS_TONE: Record<CompetitionRound['status'], 'neutral' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'neutral',
  READY: 'warning',
  VOTING: 'success',
  VOTING_CLOSED: 'info',
  COMPLETED: 'neutral',
};

export default function JudgingDirectorClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<JudgingProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');

  const [rounds, setRounds] = useState<CompetitionRound[]>([]);
  const [roundId, setRoundId] = useState('');
  const [roundOrder, setRoundOrder] = useState(1);
  const [roundName, setRoundName] = useState('');
  const [roundCutOff, setRoundCutOff] = useState<number | ''>('');
  const [roundIsFinal, setRoundIsFinal] = useState(false);
  const [savingRound, setSavingRound] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [categories, setCategories] = useState<JudgingCategory[]>([]);
  const [weightTotal, setWeightTotal] = useState(0);
  const [judges, setJudges] = useState<JudgeAssignment[]>([]);
  const [results, setResults] = useState<RoundResultRow[]>([]);

  const [catName, setCatName] = useState('');
  const [catPercent, setCatPercent] = useState<number | ''>(25);
  const [catMaxScore, setCatMaxScore] = useState(10);
  const [savingCat, setSavingCat] = useState(false);

  const [judgeName, setJudgeName] = useState('');
  const [judgeEmail, setJudgeEmail] = useState('');
  const [savingJudge, setSavingJudge] = useState(false);

  useEffect(() => {
    listJudgingProjectOptionsAction().then((result) => {
      if (result.success) {
        setProjects(result.data);
        if (result.data.length > 0) setProjectId(result.data[0]!.id);
      }
    });
  }, []);

  const reloadRounds = useCallback(async () => {
    if (!projectId) return;
    const result = await listRoundsAction(projectId);
    if (result.success) {
      setRounds(result.data);
      setRoundId((current) => (result.data.some((r) => r.id === current) ? current : (result.data[0]?.id ?? '')));
      setRoundOrder(result.data.length + 1);
    }
  }, [projectId]);

  useEffect(() => {
    setRoundId('');
    reloadRounds();
  }, [projectId, reloadRounds]);

  const reload = useCallback(async () => {
    if (!roundId) {
      setCategories([]);
      setWeightTotal(0);
      setResults([]);
      return;
    }
    const [cats, weight, res] = await Promise.all([
      listCategoriesAction(roundId),
      getCategoryWeightTotalAction(roundId),
      getRoundResultsAction(roundId),
    ]);
    if (cats.success) setCategories(cats.data);
    if (weight.success) setWeightTotal(weight.data);
    if (res.success) setResults(res.data);
  }, [roundId]);

  useEffect(() => {
    if (!projectId) return;
    listJudgeAssignmentsAction(projectId).then((result) => {
      if (result.success) setJudges(result.data);
    });
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [roundId, reload]);

  useEffect(() => {
    if (!roundId) return;
    const interval = setInterval(reload, POLL_MS);
    return () => clearInterval(interval);
  }, [roundId, reload]);

  const selectedRound = rounds.find((r) => r.id === roundId) ?? null;

  async function handleCreateRound() {
    if (!roundName.trim()) {
      toast.error('Ingresa el nombre de la ronda');
      return;
    }
    setSavingRound(true);
    try {
      const result = await createRoundAction({
        projectId,
        order: roundOrder,
        name: roundName,
        cutOffCount: roundIsFinal ? null : roundCutOff === '' ? null : roundCutOff,
        isFinalRound: roundIsFinal,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Ronda "${roundName}" creada. Ahora agrega sus criterios de evaluación.`);
      setRoundName('');
      setRoundCutOff('');
      setRoundIsFinal(false);
      await reloadRounds();
      setRoundId(result.data.id);
    } finally {
      setSavingRound(false);
    }
  }

  async function handleDeleteRound(id: string) {
    if (!await confirm('¿Eliminar esta ronda? Solo se pueden eliminar rondas que no hayan sido votadas.')) return;
    const result = await deleteRoundAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Ronda eliminada');
    await reloadRounds();
  }

  async function handleStartVoting(id: string) {
    if (categories.length === 0) {
      toast.error('Debes agregar al menos un criterio de evaluación antes de votar.');
      return;
    }
    setTransitioning(true);
    try {
      const result = await openRoundAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`¡Votación abierta para la ronda "${result.data.name}"! Los jurados ya pueden calificar.`);
      await Promise.all([reloadRounds(), reload()]);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleFinishVoting(id: string) {
    if (!await confirm('¿Finalizar las votaciones de esta ronda? Se calcularán los puntajes oficiales y el ranking definitivo.')) return;
    setTransitioning(true);
    try {
      const result = await closeRoundAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('¡Votación finalizada con éxito! Resultados oficiales calculados.');
      await Promise.all([reloadRounds(), reload()]);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleReopenVoting(id: string) {
    if (!await confirm('¿Reabrir la votación para esta ronda? Los jurados podrán volver a enviar o editar calificaciones.')) return;
    setTransitioning(true);
    try {
      const result = await reopenRoundAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Votación reabierta.');
      await Promise.all([reloadRounds(), reload()]);
    } finally {
      setTransitioning(false);
    }
  }

  async function handleAutoBalance() {
    if (!roundId) return;
    setTransitioning(true);
    try {
      const result = await autoBalanceCategoryWeightsAction(roundId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Ponderaciones equilibradas al 100% de forma equitativa.');
      await reload();
    } finally {
      setTransitioning(false);
    }
  }

  async function handleAddCategory() {
    if (!catName.trim()) {
      toast.error('Ingresa el nombre del criterio');
      return;
    }
    const percent = typeof catPercent === 'number' ? catPercent : 25;
    const weightBps = Math.round(percent * 100);
    setSavingCat(true);
    try {
      const result = await createCategoryAction({
        roundId,
        name: catName.trim(),
        weightBps: Math.max(1, Math.min(10000, weightBps)),
        maxScore: catMaxScore,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Criterio "${catName}" agregado`);
      setCatName('');
      await reload();
    } finally {
      setSavingCat(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    const result = await deleteCategoryAction(id);
    if (!result.success) toast.error(result.error);
    await reload();
  }

  async function handleAddJudge() {
    if (!judgeName.trim()) {
      toast.error('Ingresa el nombre del jurado');
      return;
    }
    setSavingJudge(true);
    try {
      const result = await createJudgeAssignmentAction({ projectId, judgeName, judgeEmail: judgeEmail || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Jurado "${judgeName}" registrado`);
      setJudgeName('');
      setJudgeEmail('');
      const list = await listJudgeAssignmentsAction(projectId);
      if (list.success) setJudges(list.data);
    } finally {
      setSavingJudge(false);
    }
  }

  async function handleDeleteJudge(id: string) {
    if (!await confirm('¿Eliminar este jurado?')) return;
    const result = await deleteJudgeAssignmentAction(id);
    if (!result.success) toast.error(result.error);
    const list = await listJudgeAssignmentsAction(projectId);
    if (list.success) setJudges(list.data);
  }

  function copyJudgeLink(token: string) {
    const url = `${window.location.origin}/judging/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link del jurado copiado al portapapeles');
  }

  const top3 = results.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Selector de certamen */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="judging-project" className="text-xs uppercase tracking-wider text-muted-foreground">
            Certamen / Proyecto
          </Label>
          <select
            id="judging-project"
            className="mt-1 h-10 w-full max-w-sm rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {selectedRound && (selectedRound.status === 'VOTING_CLOSED' || selectedRound.status === 'COMPLETED') && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <a
              href={`/api/judging/export-pdf?roundId=${selectedRound.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
            >
              <FileText className="size-3.5 text-primary" /> Descargar Acta PDF
            </a>
            <a
              href={`/api/judging/export?roundId=${selectedRound.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
            >
              <Download className="size-3.5 text-emerald-600" /> Exportar Excel
            </a>
          </div>
        )}
      </div>

      {projectId && (
        <>
          {/* Navegación y lista de rondas */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Rondas del Certamen</h2>
                <p className="text-xs text-muted-foreground">
                  Crea los criterios para cada ronda y habilita la votación independiente cuando corresponda.
                </p>
              </div>
            </div>

            {/* Pestañas de rondas */}
            <div className="mb-4 flex flex-wrap gap-2">
              {rounds.map((round) => {
                const isSelected = round.id === roundId;
                const isVoting = round.status === 'VOTING';
                return (
                  <div
                    key={round.id}
                    onClick={() => setRoundId(round.id)}
                    className={`group relative flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-background/50 hover:border-border/80 hover:bg-muted/30'
                    }`}
                  >
                    {isVoting && (
                      <span className="flex size-2">
                        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                      </span>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Ronda {round.order}</span>
                        {round.isFinalRound && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                            FINAL
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {round.name}
                      </p>
                    </div>

                    <StatusBadge tone={ROUND_STATUS_TONE[round.status]}>
                      {ROUND_STATUS_LABEL[round.status]}
                    </StatusBadge>

                    {canWrite && round.status === 'DRAFT' && (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRound(round.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}

              {rounds.length === 0 && (
                <p className="text-sm text-muted-foreground">No has creado rondas todavía. Crea la primera a continuación.</p>
              )}
            </div>

            {/* Formulario para agregar ronda */}
            {canWrite && (
              <div className="mt-2 rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">+ Nueva Ronda</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:items-end">
                  <div className="sm:col-span-1">
                    <Label htmlFor="round-order" className="text-xs">
                      Orden
                    </Label>
                    <Input
                      id="round-order"
                      type="number"
                      min={1}
                      value={roundOrder}
                      onChange={(e) => setRoundOrder(Number(e.target.value))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="round-name" className="text-xs">
                      Nombre de la Ronda
                    </Label>
                    <Input
                      id="round-name"
                      value={roundName}
                      onChange={(e) => setRoundName(e.target.value)}
                      placeholder="Ej. Traje de Baño / Pregunta Final"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Label htmlFor="round-cutoff" className="text-xs">
                      Corte (Clasifican)
                    </Label>
                    <Input
                      id="round-cutoff"
                      type="number"
                      min={1}
                      disabled={roundIsFinal}
                      value={roundCutOff}
                      onChange={(e) => setRoundCutOff(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Ej. 10"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-2 sm:col-span-1">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={roundIsFinal}
                        onChange={(e) => setRoundIsFinal(e.target.checked)}
                      />
                      Ronda Final
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateRound}
                    disabled={savingRound}
                    className="sm:col-span-1"
                  >
                    {savingRound ? 'Creando...' : 'Crear Ronda'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {selectedRound && (
            <>
              {/* Barra de Control de Votación de la Ronda */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Ronda #{selectedRound.order}
                      </span>
                      <StatusBadge tone={ROUND_STATUS_TONE[selectedRound.status]}>
                        {ROUND_STATUS_LABEL[selectedRound.status]}
                      </StatusBadge>
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{selectedRound.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedRound.isFinalRound
                        ? 'Ronda definitiva: determinará el 1er, 2do y 3er lugar del certamen.'
                        : selectedRound.cutOffCount
                        ? `Clasifican las ${selectedRound.cutOffCount} mejores puntuadas a la siguiente fase.`
                        : 'Competencia abierta: participan todas las candidatas.'}
                    </p>
                  </div>

                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-3">
                      {/* BOTÓN: VOTAR AHORA */}
                      {selectedRound.status !== 'VOTING' && (
                        <Button
                          type="button"
                          size="default"
                          disabled={transitioning}
                          onClick={() => handleStartVoting(selectedRound.id)}
                          className="bg-emerald-600 text-white shadow-md hover:bg-emerald-700 font-semibold"
                        >
                          <Play className="mr-2 size-4 fill-white" />
                          Votar ahora
                        </Button>
                      )}

                      {/* BOTÓN: FINALIZAR VOTACIONES */}
                      {selectedRound.status === 'VOTING' && (
                        <Button
                          type="button"
                          size="default"
                          variant="destructive"
                          disabled={transitioning}
                          onClick={() => handleFinishVoting(selectedRound.id)}
                          className="shadow-md font-semibold"
                        >
                          <CheckCircle2 className="mr-2 size-4" />
                          Finalizar votaciones de esta ronda
                        </Button>
                      )}

                      {/* BOTÓN: REABRIR VOTACIÓN */}
                      {selectedRound.status === 'VOTING_CLOSED' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={transitioning}
                          onClick={() => handleReopenVoting(selectedRound.id)}
                        >
                          <RotateCcw className="mr-1.5 size-3.5" />
                          Reabrir votación
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Banner informativo de estado en votación */}
                {selectedRound.status === 'VOTING' && (
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-700 dark:text-emerald-300">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-3">
                        <span className="absolute inline-flex size-3 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex size-3 rounded-full bg-emerald-500"></span>
                      </span>
                      <span className="font-semibold">
                        VOTACIÓN ACTIVA EN VIVO: Los jurados ya están votando sobre "{selectedRound.name}".
                      </span>
                    </div>
                    <span className="text-xs">Actualización automática cada 4s</span>
                  </div>
                )}
              </div>

              {/* Criterios de Evaluación de la Ronda */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Criterios de Evaluación — {selectedRound.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Criterios específicos que evaluará el jurado en esta ronda.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={weightTotal === 10000 ? 'success' : 'warning'}>
                      Ponderación total: {(weightTotal / 100).toFixed(1)}% {weightTotal !== 10000 && '(debe sumar 100%)'}
                    </StatusBadge>
                    {canWrite && selectedRound.status !== 'VOTING' && categories.length > 0 && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={handleAutoBalance}
                        disabled={transitioning}
                        className="text-xs"
                      >
                        <Sparkles className="mr-1 size-3 text-amber-500" />
                        Distribuir 100% equitativamente
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm shadow-xs"
                    >
                      <div>
                        <p className="font-semibold text-foreground">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Ponderación: <span className="font-medium text-foreground">{(cat.weightBps / 100).toFixed(1)}%</span> · Escala: 0 a {cat.maxScore} pts
                        </p>
                      </div>
                      {canWrite && selectedRound.status !== 'VOTING' && (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {categories.length === 0 && (
                    <div className="col-span-3 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      Sin criterios de evaluación en esta ronda. Agrega al menos uno a continuación.
                    </div>
                  )}
                </div>

                {/* Formulario para agregar criterio */}
                {canWrite && selectedRound.status !== 'VOTING' && (
                  <div className="mt-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">+ Agregar Criterio a esta Ronda</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
                      <div className="sm:col-span-2">
                        <Label htmlFor="cat-name" className="text-xs">
                          Nombre del Criterio
                        </Label>
                        <Input
                          id="cat-name"
                          value={catName}
                          onChange={(e) => setCatName(e.target.value)}
                          placeholder="Ej. Pasarela, Expresión Oral, Elegancia"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cat-percent" className="text-xs">
                          Ponderación (%)
                        </Label>
                        <Input
                          id="cat-percent"
                          type="number"
                          min={1}
                          max={100}
                          value={catPercent}
                          onChange={(e) => setCatPercent(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Ej. 25"
                        />
                      </div>
                      <div>
                        <Label htmlFor="cat-max" className="text-xs">
                          Puntaje Máximo
                        </Label>
                        <Input
                          id="cat-max"
                          type="number"
                          min={1}
                          value={catMaxScore}
                          onChange={(e) => setCatMaxScore(Number(e.target.value))}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddCategory}
                        disabled={savingCat}
                        className="sm:col-span-1"
                      >
                        {savingCat ? 'Guardando...' : 'Agregar Criterio'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Jurados del Certamen */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Jurados del Certamen</h3>
                    <p className="text-xs text-muted-foreground">
                      Cada jurado tiene un enlace único para calificar a las candidatas desde su tablet o móvil.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> {judges.length} jurados registrados
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {judges.map((judge) => (
                    <div
                      key={judge.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm shadow-xs"
                    >
                      <div className="truncate pr-2">
                        <p className="font-semibold text-foreground">{judge.judgeName}</p>
                        {judge.judgeEmail && <p className="text-xs text-muted-foreground truncate">{judge.judgeEmail}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => copyJudgeLink(judge.accessToken)}
                          title="Copiar link de votación"
                        >
                          <Copy className="mr-1 size-3" /> Link
                        </Button>
                        {canWrite && (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteJudge(judge.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {judges.length === 0 && (
                    <div className="col-span-3 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      No hay jurados registrados. Agrega al menos uno para que puedan votar.
                    </div>
                  )}
                </div>

                {/* Formulario para agregar jurado */}
                {canWrite && (
                  <div className="mt-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">+ Registrar Nuevo Jurado</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
                      <div>
                        <Label htmlFor="judge-name" className="text-xs">
                          Nombre del Jurado
                        </Label>
                        <Input
                          id="judge-name"
                          value={judgeName}
                          onChange={(e) => setJudgeName(e.target.value)}
                          placeholder="Nombre y Apellido"
                        />
                      </div>
                      <div>
                        <Label htmlFor="judge-email" className="text-xs">
                          Email (opcional)
                        </Label>
                        <Input
                          id="judge-email"
                          type="email"
                          value={judgeEmail}
                          onChange={(e) => setJudgeEmail(e.target.value)}
                          placeholder="jurado@ejemplo.com"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddJudge}
                        disabled={savingJudge}
                      >
                        {savingJudge ? 'Guardando...' : 'Agregar Jurado'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* RESULTADOS DE LA RONDA */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trophy className="size-5 text-amber-500" />
                      <h3 className="text-lg font-bold text-foreground">
                        Resultados Oficiales — {selectedRound.name}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedRound.status === 'VOTING'
                        ? 'Monitoreo de puntajes en tiempo real conforme votan los jurados.'
                        : 'Ranking definitivo y puntuaciones consolidadas.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/judging/export?roundId=${selectedRound.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs hover:bg-muted"
                    >
                      <Download className="size-3.5 text-emerald-600" /> Exportar Excel
                    </a>
                    <a
                      href={`/api/judging/export-pdf?roundId=${selectedRound.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-xs hover:bg-muted"
                    >
                      <FileText className="size-3.5 text-primary" /> Acta PDF
                    </a>
                  </div>
                </div>

                {/* PODIO TOP 3 (Si hay resultados) */}
                {top3.length > 0 && results.some((r) => r.weightedTotal > 0) && (
                  <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* 1° Lugar */}
                    {top3[0] && (
                      <div className="relative order-1 sm:order-2 rounded-2xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent p-4 text-center shadow-md">
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-white tracking-wider shadow">
                          1° Lugar
                        </span>
                        <div className="mx-auto my-2 size-16 overflow-hidden rounded-full border-2 border-amber-500 bg-muted">
                          {top3[0].photoUrl ? (
                            <img src={top3[0].photoUrl} alt={top3[0].fullName} className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center font-bold text-amber-600">
                              #1
                            </div>
                          )}
                        </div>
                        <p className="font-bold text-foreground text-base truncate">{top3[0].stageName || top3[0].fullName}</p>
                        <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                          {top3[0].weightedTotal.toFixed(2)} pts
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {top3[0].submittedCount}/{top3[0].expectedCount} votos emitidos
                        </p>
                      </div>
                    )}

                    {/* 2° Lugar */}
                    {top3[1] && (
                      <div className="relative order-2 sm:order-1 rounded-2xl border border-slate-400/40 bg-gradient-to-b from-slate-400/10 to-transparent p-4 text-center shadow-xs">
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-white tracking-wider">
                          2° Lugar
                        </span>
                        <div className="mx-auto my-2 size-14 overflow-hidden rounded-full border-2 border-slate-400 bg-muted">
                          {top3[1].photoUrl ? (
                            <img src={top3[1].photoUrl} alt={top3[1].fullName} className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center font-bold text-slate-500">
                              #2
                            </div>
                          )}
                        </div>
                        <p className="font-semibold text-foreground text-sm truncate">{top3[1].stageName || top3[1].fullName}</p>
                        <p className="text-xl font-bold text-slate-700 dark:text-slate-300">
                          {top3[1].weightedTotal.toFixed(2)} pts
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {top3[1].submittedCount}/{top3[1].expectedCount} votos
                        </p>
                      </div>
                    )}

                    {/* 3° Lugar */}
                    {top3[2] && (
                      <div className="relative order-3 rounded-2xl border border-amber-700/30 bg-gradient-to-b from-amber-700/10 to-transparent p-4 text-center shadow-xs">
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-700 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-white tracking-wider">
                          3° Lugar
                        </span>
                        <div className="mx-auto my-2 size-14 overflow-hidden rounded-full border-2 border-amber-700 bg-muted">
                          {top3[2].photoUrl ? (
                            <img src={top3[2].photoUrl} alt={top3[2].fullName} className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center font-bold text-amber-700">
                              #3
                            </div>
                          )}
                        </div>
                        <p className="font-semibold text-foreground text-sm truncate">{top3[2].stageName || top3[2].fullName}</p>
                        <p className="text-xl font-bold text-amber-800 dark:text-amber-500">
                          {top3[2].weightedTotal.toFixed(2)} pts
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {top3[2].submittedCount}/{top3[2].expectedCount} votos
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TABLA DETALLADA DE RESULTADOS */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3.5 py-3 text-center w-16">Posición</th>
                        <th className="px-4 py-3">Candidata</th>
                        <th className="px-4 py-3 text-right">Puntaje Final</th>
                        {categories.map((cat) => (
                          <th key={cat.id} className="px-3 py-3 text-right hidden sm:table-cell">
                            {cat.name} ({(cat.weightBps / 100).toFixed(0)}%)
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center">Votos</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.map((row, index) => {
                        const rankNumber = row.rank ?? index + 1;
                        return (
                          <tr key={row.candidateId} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3.5 py-3 text-center font-bold">
                              {rankNumber === 1 ? (
                                <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500 text-xs text-white">
                                  1
                                </span>
                              ) : rankNumber === 2 ? (
                                <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400 text-xs text-white">
                                  2
                                </span>
                              ) : rankNumber === 3 ? (
                                <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-700 text-xs text-white">
                                  3
                                </span>
                              ) : (
                                <span className="text-muted-foreground">#{rankNumber}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="size-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                                  {row.photoUrl ? (
                                    <img src={row.photoUrl} alt={row.fullName} className="size-full object-cover" />
                                  ) : (
                                    <div className="flex size-full items-center justify-center text-xs font-bold text-muted-foreground">
                                      {row.fullName.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground">
                                    {row.stageName ? `${row.stageName} (${row.fullName})` : row.fullName}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-base font-bold text-foreground">
                              {row.weightedTotal.toFixed(2)}
                            </td>

                            {/* Desglose por criterio */}
                            {categories.map((cat) => (
                              <td key={cat.id} className="px-3 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                                {row.categoryScores?.[cat.id] != null ? row.categoryScores[cat.id]?.toFixed(1) : '—'}
                              </td>
                            ))}

                            <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                              {row.submittedCount}/{row.expectedCount}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {selectedRound.status === 'VOTING' ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                  En votación
                                </span>
                              ) : row.qualified ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                                  <CheckCircle2 className="size-3" /> Clasificó
                                </span>
                              ) : selectedRound.isFinalRound && rankNumber === 1 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                                  <Award className="size-3" /> Ganadora
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {selectedRound.isFinalRound ? 'Finalista' : 'No clasificó'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {results.length === 0 && (
                        <tr>
                          <td colSpan={5 + categories.length} className="p-8 text-center text-sm text-muted-foreground">
                            No hay candidatas registradas o la votación aún no ha comenzado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

