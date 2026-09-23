'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { CandidateStatus } from '@prisma/client';
import { CheckCircle2, EyeOff, Hash, Search, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { listCandidateProjectOptionsAction, updateCandidateStatusAction } from '@/modules/candidates/actions/candidates.actions';
import { listCastingBoardAction, numberOfficialCandidatesAction, updateCandidatePresentationAction } from '@/modules/candidates/actions/casting.actions';
import type { CastingCard } from '@/modules/candidates/services/casting.service';
import { CANDIDATE_STATUS_LABELS, NUMBERING_ORDER_LABELS, NUMBERING_ORDERS } from '@/modules/candidates/schema';
import { cn } from '@/lib/utils';

/** El camino de una postulante hasta la corona, en orden. */
const PIPELINE: CandidateStatus[] = ['APPLICANT', 'UNDER_REVIEW', 'CALLED_TO_CASTING', 'OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];
const OUT: CandidateStatus[] = ['WITHDRAWN', 'REJECTED'];

type NumberingOrder = (typeof NUMBERING_ORDERS)[number];

/**
 * Tablero de casting: cada columna es una etapa del certamen y las fichas se
 * arrastran (o se mueven con el selector de la tarjeta) de una a otra. El
 * descarte exige motivo, igual que en la ficha. Desde acá también se define
 * la presentación pública de cada candidata oficial (número, a quién
 * representa, bio del sitio).
 */
export function CastingBoardClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [cards, setCards] = useState<CastingCard[] | null>(null);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState<CandidateStatus | null>(null);
  const [editing, setEditing] = useState<CastingCard | null>(null);
  const [presentation, setPresentation] = useState({ candidateNumber: '', representing: '', publicBio: '', showOnPublicSite: true });
  const [rejecting, setRejecting] = useState<CastingCard | null>(null);
  const [reason, setReason] = useState('');
  const [numberingOrder, setNumberingOrder] = useState<NumberingOrder>('alphabetical');
  const [showOut, setShowOut] = useState(false);

  useEffect(() => {
    listCandidateProjectOptionsAction().then((result) => {
      if (result.success) {
        setProjects(result.data);
        if (result.data[0]) setProjectId(result.data[0].id);
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    const result = await listCastingBoardAction(projectId);
    if (result.success) setCards(result.data.cards);
    else toast.error(result.error);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!cards) return [];
    if (!q) return cards;
    return cards.filter((c) => [c.fullName, c.stageName, c.comuna, c.representing, c.folio, c.candidateNumber?.toString()].some((t) => t?.toLowerCase().includes(q)));
  }, [cards, query]);

  async function moveTo(card: CastingCard, status: CandidateStatus) {
    if (card.status === status) return;
    if (status === 'REJECTED') {
      setRejecting(card);
      setReason('');
      return;
    }
    if (status === 'WINNER' && !(await confirm({ title: `¿Coronar a ${card.stageName ?? card.fullName}?`, description: 'Normalmente la ganadora la marca el escrutinio al completar la ronda final.', confirmLabel: 'Coronar' }))) return;
    setCards((prev) => prev?.map((c) => (c.id === card.id ? { ...c, status } : c)) ?? null);
    const result = await updateCandidateStatusAction(card.id, { status });
    if (!result.success) toast.error(result.error);
    else toast.success(`${card.stageName ?? card.fullName}: ${CANDIDATE_STATUS_LABELS[status]}`);
    await load();
  }

  async function confirmReject() {
    if (!rejecting) return;
    const result = await updateCandidateStatusAction(rejecting.id, { status: 'REJECTED', motivoDescarte: reason });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Postulación descartada');
    setRejecting(null);
    await load();
  }

  function openPresentation(card: CastingCard) {
    setEditing(card);
    setPresentation({
      candidateNumber: card.candidateNumber?.toString() ?? '',
      representing: card.representing ?? '',
      publicBio: card.publicBio ?? '',
      showOnPublicSite: card.showOnPublicSite,
    });
  }

  async function savePresentation() {
    if (!editing) return;
    const result = await updateCandidatePresentationAction(editing.id, {
      candidateNumber: presentation.candidateNumber ? Number(presentation.candidateNumber) : null,
      representing: presentation.representing,
      publicBio: presentation.publicBio,
      showOnPublicSite: presentation.showOnPublicSite,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Guardado');
    setEditing(null);
    await load();
  }

  async function numberAll() {
    const ok = await confirm({
      title: '¿Numerar a las candidatas oficiales?',
      description: `Se asigna N° 1, 2, 3… ${NUMBERING_ORDER_LABELS[numberingOrder].toLowerCase()}. Reemplaza la numeración actual del certamen.`,
      confirmLabel: 'Numerar',
    });
    if (!ok) return;
    const result = await numberOfficialCandidatesAction(projectId, numberingOrder);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Numeradas');
    await load();
  }

  const outCards = filtered.filter((c) => OUT.includes(c.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="casting-project">Certamen</Label>
          <select id="casting-project" className={cn(nativeSelectClass, 'min-w-[16rem]')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, comuna, folio…" className="pl-8" aria-label="Buscar candidatas" />
        </div>
        {canWrite && (
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <select aria-label="Orden de numeración" className={cn(nativeSelectClass, 'w-auto')} value={numberingOrder} onChange={(e) => setNumberingOrder(e.target.value as NumberingOrder)}>
              {NUMBERING_ORDERS.map((o) => (
                <option key={o} value={o}>
                  {NUMBERING_ORDER_LABELS[o]}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" disabled={!projectId} onClick={() => void numberAll()}>
              <Hash aria-hidden="true" />
              Numerar oficiales
            </Button>
          </div>
        )}
      </div>

      {!cards ? (
        <p className="text-sm text-muted-foreground">Cargando tablero…</p>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {PIPELINE.map((status) => {
              const column = filtered.filter((c) => c.status === status);
              return (
                <section
                  key={status}
                  aria-label={CANDIDATE_STATUS_LABELS[status]}
                  onDragOver={(e) => {
                    if (!canWrite) return;
                    e.preventDefault();
                    setDragOver(status);
                  }}
                  onDragLeave={() => setDragOver((current) => (current === status ? null : current))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const card = cards.find((c) => c.id === e.dataTransfer.getData('text/plain'));
                    if (card) void moveTo(card, status);
                  }}
                  className={cn('flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 p-2 transition-colors', dragOver === status ? 'border-primary bg-accent' : 'border-border')}
                >
                  <header className="flex items-baseline justify-between px-1.5 pt-1 pb-2">
                    <h2 className="text-sm font-semibold">{CANDIDATE_STATUS_LABELS[status]}</h2>
                    <span className="text-xs text-muted-foreground">{column.length}</span>
                  </header>
                  <ul className="flex flex-1 flex-col gap-2">
                    {column.map((card) => (
                      <li
                        key={card.id}
                        draggable={canWrite}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', card.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        className={cn('rounded-md border border-border bg-card p-2 shadow-card', canWrite && 'cursor-grab active:cursor-grabbing')}
                      >
                        <div className="flex gap-2">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                            {card.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={card.photoUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <span className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">{(card.stageName ?? card.fullName).charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link href={`/dashboard/candidates/${card.id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                              {card.candidateNumber != null && <span className="text-primary">N° {card.candidateNumber} · </span>}
                              {card.stageName ?? card.fullName}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{[card.representing, card.comuna].filter(Boolean).join(' · ') || card.folio || 'Ficha interna'}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {card.contractSigned && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1 text-[10px] text-success">
                                  <CheckCircle2 className="size-2.5" aria-hidden="true" />
                                  Contrato
                                </span>
                              )}
                              {!card.showOnPublicSite && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                                  <EyeOff className="size-2.5" aria-hidden="true" />
                                  Oculta del sitio
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {canWrite && (
                          <div className="mt-2 flex items-center gap-1">
                            <select
                              aria-label="Mover a etapa"
                              className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1 text-[11px]"
                              value={card.status}
                              onChange={(e) => void moveTo(card, e.target.value as CandidateStatus)}
                            >
                              {[...PIPELINE, ...OUT].filter((s) => s !== 'APPLICANT' || card.status === 'APPLICANT').map((s) => (
                                <option key={s} value={s}>
                                  {CANDIDATE_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <Button type="button" size="xs" variant="ghost" onClick={() => openPresentation(card)}>
                              Presentación
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                    {column.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">{canWrite ? 'Arrastra aquí' : 'Sin candidatas'}</li>}
                  </ul>
                </section>
              );
            })}
          </div>

          {outCards.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4 shadow-card">
              <button type="button" className="flex items-center gap-2 text-sm font-semibold" onClick={() => setShowOut((v) => !v)} aria-expanded={showOut}>
                <UserX className="size-4 text-muted-foreground" aria-hidden="true" />
                Retiradas y descartadas ({outCards.length})
              </button>
              {showOut && (
                <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {outCards.map((card) => (
                    <li key={card.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Link href={`/dashboard/candidates/${card.id}`} className="truncate hover:underline">
                        {card.stageName ?? card.fullName}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{CANDIDATE_STATUS_LABELS[card.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Presentación pública</DialogTitle>
            <DialogDescription>{editing ? `${editing.stageName ?? editing.fullName} · lo que se ve en el sitio del certamen, la votación y la escaleta.` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div>
                <Label htmlFor="pres-number">N° oficial</Label>
                <Input id="pres-number" type="number" min={1} max={999} value={presentation.candidateNumber} onChange={(e) => setPresentation({ ...presentation, candidateNumber: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pres-rep">Representa a</Label>
                <Input id="pres-rep" value={presentation.representing} onChange={(e) => setPresentation({ ...presentation, representing: e.target.value })} placeholder="Valparaíso" />
              </div>
            </div>
            <div>
              <Label htmlFor="pres-bio">Bio para el sitio</Label>
              <textarea id="pres-bio" className={cn(textareaClass, 'min-h-28')} value={presentation.publicBio} onChange={(e) => setPresentation({ ...presentation, publicBio: e.target.value })} placeholder="Estudiante de periodismo, 24 años, embajadora de la fundación…" />
              <p className="mt-1 text-xs text-muted-foreground">Escríbela el equipo: nada de la ficha privada de postulación se publica solo.</p>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
              <span className="text-sm">Mostrar en el sitio público</span>
              <Switch checked={presentation.showOnPublicSite} onCheckedChange={(v) => setPresentation({ ...presentation, showOnPublicSite: v })} label="Mostrar en el sitio público" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void savePresentation()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar postulación</DialogTitle>
            <DialogDescription>{rejecting ? `${rejecting.stageName ?? rejecting.fullName}. El motivo queda en su historial.` : ''}</DialogDescription>
          </DialogHeader>
          <Label htmlFor="reject-reason">Motivo</Label>
          <Input id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="No cumple requisito de edad, no se presentó al casting…" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={!reason.trim()} onClick={() => void confirmReject()}>
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
