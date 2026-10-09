'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, CircleCheck, Clock, Copy, ExternalLink, FilePen, Globe, Mail, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { WebSiteMode, WebSiteStatus } from '@prisma/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-provider';
import type { Tone } from '@/components/ui/tone';
import { KIND_INFO } from '@/lib/web-sites/templates';
import { cn } from '@/lib/utils';
import type { FormDestination } from '@/lib/web-sites/forms';
import { archiveWebSiteAction, deleteWebSiteAction, duplicateWebSiteAction, listWebSitesAction, unpublishWebSiteAction } from '@/modules/web-sites/actions/web-sites.actions';
import type { WebSiteRow } from '@/modules/web-sites/services/web-sites.service';
import WebSiteMessagesPanel from './WebSiteMessagesPanel';

type StatusFilter = 'ALL' | WebSiteStatus;

const FILTERS: Array<{ value: StatusFilter; label: string; hint?: string }> = [
  { value: 'ALL', label: 'Todos', hint: 'Borradores y publicados. Los archivados están en su propia vista.' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'PUBLISHED', label: 'Publicados' },
  { value: 'ARCHIVED', label: 'Archivados' },
];

const STATUS_BADGE: Record<WebSiteStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicado', tone: 'success' },
  ARCHIVED: { label: 'Archivado', tone: 'neutral' },
};

const MODE_LABEL: Record<WebSiteMode, string> = {
  GUIDED: 'Guiado',
  HTML: 'HTML propio',
};

const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

/** Dirección a la que abre "Ver sitio": el dominio propio solo si ya responde; si no, la de la plataforma. */
function liveHref(row: WebSiteRow): string {
  return row.customDomain && row.customDomainVerified ? `https://${row.customDomain}` : `/web/${row.slug}`;
}

export type WebSitesView = 'sites' | 'inbox';

interface WebSitesClientProps {
  canWrite: boolean;
  canPublish: boolean;
  /** Destinos a los que este usuario puede llevar a mano un mensaje de la bandeja. */
  routeTargets?: Array<Exclude<FormDestination, 'inbox'>>;
  initialView?: WebSitesView;
}

export default function WebSitesClient({ canWrite, canPublish, routeTargets = [], initialView = 'sites' }: WebSitesClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [view, setView] = useState<WebSitesView>(initialView);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<WebSiteRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Cada ejecución del efecto tiene su propia bandera `cancelled`: si el usuario
  // sigue escribiendo o cambia de filtro, la respuesta vieja se descarta y no
  // pisa a la nueva aunque llegue tarde.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const q = query.trim();
      const unfiltered = filter === 'ALL' && !q;
      try {
        // "Mensajes sin leer" es de toda la cuenta: en una vista filtrada se pide aparte la lista completa.
        const [result, all] = await Promise.all([listWebSitesAction(filter, q || undefined), unfiltered ? Promise.resolve(null) : listWebSitesAction('ALL')]);
        if (cancelled) return;
        if (result.success) {
          setRows(result.data.rows);
          setCounts(result.data.counts);
          const source = unfiltered ? result.data.rows : all?.success ? all.data.rows : null;
          if (source) setUnreadTotal(source.reduce((sum, row) => sum + row.unreadMessages, 0));
          setLoadError(null);
          setLoaded(true);
        } else {
          setLoadError(result.error);
          toast.error(result.error);
        }
      } catch {
        if (cancelled) return;
        const message = 'No pudimos cargar tus sitios. Revisa tu conexión e intenta de nuevo.';
        setLoadError(message);
        toast.error(message);
      }
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter, query, reloadKey]);

  const reload = () => {
    setLoadError(null);
    setReloadKey((key) => key + 1);
  };

  function countFor(value: StatusFilter): number {
    return value === 'ALL' ? (counts.DRAFT ?? 0) + (counts.PUBLISHED ?? 0) : (counts[value] ?? 0);
  }

  const totalSites = (counts.DRAFT ?? 0) + (counts.PUBLISHED ?? 0) + (counts.ARCHIVED ?? 0);
  const kpi = (value: number) => (loaded ? String(value) : '—');

  async function withBusy(id: string, task: () => Promise<void>) {
    setBusyId(id);
    try {
      await task();
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  function duplicate(row: WebSiteRow) {
    void withBusy(row.id, async () => {
      const result = await duplicateWebSiteAction(row.id);
      if (!result.success) return void toast.error(result.error);
      const copyId = result.data.id;
      toast.success(result.message ?? 'Copia creada como borrador', { action: { label: 'Abrir copia', onClick: () => router.push(`/dashboard/web-sites/${copyId}`) } });
      reload();
    });
  }

  async function toggleArchive(row: WebSiteRow) {
    const archiving = row.status !== 'ARCHIVED';
    if (archiving) {
      const published = row.status === 'PUBLISHED';
      const ok = await confirm({
        title: `¿Archivar "${row.name}"?`,
        description: published
          ? 'El sitio dejará de verse en internet y pasará a Archivados. Puedes restaurarlo como borrador cuando quieras y volver a publicarlo.'
          : 'El sitio sale de la lista principal y pasa a Archivados. Puedes restaurarlo como borrador cuando quieras.',
        confirmLabel: 'Archivar',
        destructive: published,
      });
      if (!ok) return;
    }
    void withBusy(row.id, async () => {
      const result = await archiveWebSiteAction(row.id, archiving);
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? (archiving ? 'Sitio archivado' : 'Sitio restaurado como borrador'));
      reload();
    });
  }

  async function remove(row: WebSiteRow) {
    const published = row.status === 'PUBLISHED';
    const ok = await confirm({
      title: `¿Eliminar "${row.name}"?`,
      description: published
        ? 'Este sitio está publicado, y un sitio publicado no se puede eliminar directamente: primero se despublica (deja de verse en internet) y después se elimina junto con su borrador, sus imágenes y sus mensajes. No se puede deshacer.'
        : 'Se elimina el sitio con su borrador, sus imágenes y los mensajes recibidos. No se puede deshacer. Si solo quieres sacarlo de la lista, mejor archívalo.',
      confirmLabel: published ? 'Despublicar y eliminar' : 'Eliminar',
    });
    if (!ok) return;
    void withBusy(row.id, async () => {
      if (published) {
        const unpublished = await unpublishWebSiteAction(row.id);
        if (!unpublished.success) return void toast.error(unpublished.error);
      }
      const result = await deleteWebSiteAction(row.id);
      if (!result.success) {
        toast.error(published ? `El sitio quedó despublicado, pero no se pudo eliminar. ${result.error}` : result.error);
        if (published) reload();
        return;
      }
      toast.success(result.message ?? 'Sitio eliminado');
      reload();
    });
  }

  const createCta = canWrite ? (
    <Link href="/dashboard/web-sites/new" className={cn(buttonVariants(), 'mt-1')}>
      <Plus className="size-4" aria-hidden="true" /> Crear tu primer sitio
    </Link>
  ) : undefined;

  const viewTabs: Array<{ value: WebSitesView; label: string }> = [
    { value: 'sites', label: 'Sitios' },
    { value: 'inbox', label: unreadTotal > 0 ? `Bandeja de formularios (${unreadTotal})` : 'Bandeja de formularios' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Publicados" value={kpi(counts.PUBLISHED ?? 0)} icon={Globe} tone={(counts.PUBLISHED ?? 0) > 0 ? 'success' : 'neutral'} />
        <KpiCard label="Borradores" value={kpi(counts.DRAFT ?? 0)} icon={FilePen} tone="info" />
        <KpiCard label="Mensajes sin leer" value={kpi(unreadTotal)} icon={Mail} tone={unreadTotal > 0 ? 'warning' : 'neutral'} />
      </div>

      <div role="tablist" aria-label="Vista" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {viewTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={view === tab.value}
            onClick={() => setView(tab.value)}
            className={cn('rounded px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50', view === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'inbox' ? (
        <WebSiteMessagesPanel canWrite={canWrite} routeTargets={routeTargets} onUnreadChange={setUnreadTotal} />
      ) : (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Lista de sitios">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filtrar por estado" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  title={item.hint}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    filter === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.label}
                  {loaded && <span className="ml-1.5 tabular-nums text-muted-foreground">{countFor(item.value)}</span>}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, dirección o cliente" aria-label="Buscar sitio" className="h-9 pl-8 sm:w-72" />
            </div>
          </div>

          {loading && rows.length === 0 && !loadError ? (
            <ul className="divide-y divide-border" aria-busy="true" aria-label="Cargando sitios">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                  <Skeleton className="h-3 w-40" />
                </li>
              ))}
            </ul>
          ) : loadError && rows.length === 0 ? (
            <EmptyState
              title="No pudimos cargar tus sitios"
              description={loadError}
              actionLabel="Reintentar"
              onAction={reload}
              icon={<Globe className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            />
          ) : rows.length === 0 ? (
            loaded && totalSites === 0 ? (
              <EmptyState
                icon={<Globe className="size-10 text-muted-foreground/40" aria-hidden="true" />}
                title="Todavía no tienes sitios"
                description={
                  canWrite
                    ? 'Crea el sitio de tu empresa o el de un cliente. Te guiamos paso a paso: eliges para qué es, lo armas por secciones y ves qué te falta antes de publicarlo.'
                    : 'Cuando alguien de tu equipo cree un sitio, aparecerá aquí. Pide a un administrador que lo cree si lo necesitas.'
                }
                action={createCta}
              />
            ) : (
              <EmptyState
                icon={<Search className="size-10 text-muted-foreground/40" aria-hidden="true" />}
                title={query.trim() ? 'Sin resultados' : 'No hay sitios en esta vista'}
                description={query.trim() ? 'Prueba con otro nombre, dirección o cliente.' : 'Cambia el filtro para ver los sitios en otro estado.'}
              />
            )
          ) : (
            <ul className={cn('divide-y divide-border transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
              {rows.map((row) => {
                const status = STATUS_BADGE[row.status];
                const verifiedDomain = Boolean(row.customDomain && row.customDomainVerified);
                const busy = busyId === row.id;
                return (
                  <li key={row.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/web-sites/${row.id}`} className="truncate text-sm font-semibold hover:underline">
                          {row.name}
                        </Link>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        {row.pendingChanges && <StatusBadge tone="warning">Cambios sin publicar</StatusBadge>}
                        {row.unreadMessages > 0 && (
                          <StatusBadge tone="info">
                            <Mail className="mr-1 size-3" aria-hidden="true" />
                            {row.unreadMessages} {row.unreadMessages === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}
                          </StatusBadge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {KIND_INFO[row.kind].label} · {MODE_LABEL[row.mode]}
                        {row.contactName ? ` · Cliente: ${row.contactName}` : ''}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <Globe className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="sr-only">Dirección pública:</span>
                        {verifiedDomain ? (
                          <>
                            <span className="font-medium text-foreground">{row.customDomain}</span>
                            <span className="inline-flex items-center gap-1 text-success">
                              <CircleCheck className="size-3.5" aria-hidden="true" /> Dominio verificado
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-foreground">/web/{row.slug}</span>
                            {row.customDomain && (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <Clock className="size-3.5" aria-hidden="true" /> {row.customDomain}: pendiente de DNS
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">Actualizado {formatDateTime(row.updatedAt)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 lg:max-w-md lg:justify-end">
                      <Link href={`/dashboard/web-sites/${row.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        <Pencil aria-hidden="true" /> Abrir editor
                      </Link>
                      {row.status === 'PUBLISHED' && (
                        <a href={liveHref(row)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                          <ExternalLink aria-hidden="true" /> Ver sitio
                          <span className="sr-only"> (se abre en una pestaña nueva)</span>
                        </a>
                      )}
                      {canWrite && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => duplicate(row)}>
                          <Copy aria-hidden="true" /> Duplicar
                        </Button>
                      )}
                      {canPublish && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void toggleArchive(row)}>
                          {row.status === 'ARCHIVED' ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                          {row.status === 'ARCHIVED' ? 'Restaurar' : 'Archivar'}
                        </Button>
                      )}
                      {canPublish && (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(row)} className="text-danger hover:bg-danger-soft hover:text-danger">
                          <Trash2 aria-hidden="true" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
