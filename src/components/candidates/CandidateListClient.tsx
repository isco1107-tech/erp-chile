'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import type { CandidateStatus } from '@prisma/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import {
  listCandidateProjectOptionsAction,
  listCandidatesAction,
} from '@/modules/candidates/actions/candidates.actions';
import type { CandidateProjectOption, CandidateWithProject } from '@/modules/candidates/services/candidates.service';
import { CHILE_COMUNAS, CANDIDATE_STATUS_LABELS, CANDIDATE_STATUSES } from '@/modules/candidates/schema';
import DeleteCandidateButton from './DeleteCandidateButton';
import CandidateRegistrationLinkButton from './CandidateRegistrationLinkButton';
import RegistrationSettingsButton from './RegistrationSettingsButton';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

// `Record<CandidateStatus, Tone>`, no `Record<string, Tone>`: así un estado
// nuevo agregado a `CANDIDATE_STATUSES` que falte acá es un error de tipos,
// no un silencio que solo se nota mirando la UI.
const STATUS_TONE: Record<CandidateStatus, Tone> = {
  APPLICANT: 'neutral',
  UNDER_REVIEW: 'neutral',
  CALLED_TO_CASTING: 'info',
  OFFICIAL_CANDIDATE: 'info',
  FINALIST: 'accent',
  WINNER: 'success',
  WITHDRAWN: 'danger',
  REJECTED: 'danger',
};

const PAGE_SIZE = 24;

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function CandidateListClient({ canWrite, canExport }: { canWrite: boolean; canExport: boolean }) {
  const [projects, setProjects] = useState<CandidateProjectOption[]>([]);
  const [candidates, setCandidates] = useState<CandidateWithProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [comuna, setComuna] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listCandidateProjectOptionsAction().then((r) => {
      if (r.success) setProjects(r.data);
      else toast.error(r.error);
    });
  }, []);

  async function load() {
    setLoading(true);
    const result = await listCandidatesAction({
      projectId: projectId || undefined,
      status: (status as CandidateWithProject['status']) || undefined,
      comuna: comuna || undefined,
      minAge: minAge ? Number(minAge) : undefined,
      maxAge: maxAge ? Number(maxAge) : undefined,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    if (result.success) {
      setCandidates(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status, comuna, minAge, maxAge, search, page]);

  // Cualquier cambio de filtro vuelve a la página 1 — de lo contrario se
  // podría quedar en una página que ya no existe para el nuevo resultado.
  function updateFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function exportUrl(): string {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (status) params.set('status', status);
    if (comuna) params.set('comuna', comuna);
    if (minAge) params.set('minAge', minAge);
    if (maxAge) params.set('maxAge', maxAge);
    if (search) params.set('search', search);
    return `/api/candidates/export?${params.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {projects.length > 0 ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Convocatoria</label>
              <select className={selectClass} value={projectId} onChange={(e) => updateFilter(setProjectId)(e.target.value)}>
                <option value="">Todas las convocatorias</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
              <select className={selectClass} value={status} onChange={(e) => updateFilter(setStatus)(e.target.value)}>
                <option value="">Todos los estados</option>
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Comuna</label>
              <Input list="comuna-filter-options" className="h-8 w-40" placeholder="Todas las comunas" value={comuna} onChange={(e) => updateFilter(setComuna)(e.target.value)} />
              <datalist id="comuna-filter-options">
                {CHILE_COMUNAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Edad mín.</label>
              <Input type="number" min={0} className="h-8 w-20" value={minAge} onChange={(e) => updateFilter(setMinAge)(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Edad máx.</label>
              <Input type="number" min={0} className="h-8 w-20" value={maxAge} onChange={(e) => updateFilter(setMaxAge)(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Buscar</label>
              <Input
                className="h-8 w-48"
                placeholder="Nombre, RUT o folio"
                value={search}
                onChange={(e) => updateFilter(setSearch)(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <a href={exportUrl()} className={buttonVariants({ variant: 'outline' })}>
                <Download /> Exportar
              </a>
            )}
            {canWrite && projectId && <RegistrationSettingsButton projectId={projectId} />}
            {canWrite && projectId && <CandidateRegistrationLinkButton projectId={projectId} />}
            {canWrite && (
              <Link href="/dashboard/candidates/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
                Nueva Candidata
              </Link>
            )}
          </div>
        </div>
      ) : (
        // Sin proyectos/certámenes todavía no hay nada que filtrar — mostrar
        // 6 controles de filtro sobre una tabla vacía solo confunde a un
        // usuario nuevo. Se oculta la barra completa hasta que exista al
        // menos un proyecto (el EmptyState de abajo ya lo explica).
        canWrite && (
          <div className="flex justify-end">
            <Link href="/dashboard/projects/new" className={buttonVariants({ variant: 'default' })}>
              Crear proyecto/certamen
            </Link>
          </div>
        )
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : candidates.length === 0 ? (
        <EmptyState
          title="Sin candidatas registradas"
          description={
            projects.length === 0
              ? 'Primero crea un proyecto/certamen para poder cargar candidatas.'
              : 'Ajusta los filtros o crea la primera ficha de candidata.'
          }
          action={
            canWrite && projects.length > 0 ? (
              <Link href="/dashboard/candidates/new" className={buttonVariants({ variant: 'default', size: 'sm' })}>
                Nueva Candidata
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {candidates.map((candidate) => (
              <Link key={candidate.id} href={`/dashboard/candidates/${candidate.id}`} className="group relative block">
                {canWrite && (
                  <DeleteCandidateButton
                    candidateId={candidate.id}
                    candidateName={candidate.stageName || candidate.fullName}
                    variant="icon"
                    onDeleted={load}
                  />
                )}
                <Card className="h-full transition-colors hover:ring-primary/40">
                  <CardContent className="flex flex-col items-center gap-3 pt-4 text-center">
                    <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40">
                      {candidate.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={candidate.photoUrl} alt={candidate.fullName} className="size-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground">{initials(candidate.fullName)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{candidate.stageName || candidate.fullName}</p>
                      {candidate.stageName && <p className="text-xs text-muted-foreground">{candidate.fullName}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{candidate.project.name}</p>
                      {candidate.folio && <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">{candidate.folio}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[candidate.comuna, candidate.dressSize && `Vestido ${candidate.dressSize}`, candidate.heightCm && `${candidate.heightCm} cm`]
                        .filter(Boolean)
                        .join(' · ') || 'Sin datos registrados'}
                    </p>
                    <StatusBadge tone={STATUS_TONE[candidate.status] ?? 'neutral'}>
                      {CANDIDATE_STATUS_LABELS[candidate.status]}
                    </StatusBadge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{total} postulación{total === 1 ? '' : 'es'} en total</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
