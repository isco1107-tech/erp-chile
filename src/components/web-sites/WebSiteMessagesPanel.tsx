'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowRight, CheckCheck, Download, Inbox, Mail, MailOpen, MessageCircle, Phone, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import { DESTINATION_INFO, FORM_DESTINATIONS, FORM_PURPOSES, PURPOSE_LABELS, type FormDestination, type FormPurpose } from '@/lib/web-sites/forms';
import { safeHref, whatsappHref } from '@/lib/web-sites/urls';
import {
  deleteWebSiteMessageAction,
  listFormMessagesAction,
  markWebSiteMessagesReadAction,
  routeWebSiteMessageAction,
  setWebSiteMessageArchivedAction,
  setWebSiteMessageReadAction,
} from '@/modules/web-sites/actions/web-sites.actions';
import type { FormMessageRow, FormMessagesPage } from '@/modules/web-sites/services/web-site-forms.service';

/**
 * Bandeja de formularios: lo que llega desde los formularios de los sitios
 * publicados (contacto, cotizaciones, inscripciones…), ordenado por
 * formulario, propósito, destino en el ERP y etiqueta. Sirve para un sitio
 * (`siteId`) o para toda la empresa. Cada envío muestra dónde quedó en el ERP
 * (con enlace al registro) y se puede llevar a mano a otro módulo.
 */

type RouteTarget = Exclude<FormDestination, 'inbox'>;
type StatusFilter = 'inbox' | 'unread' | 'archived' | 'all';

interface Props {
  /** Sin sitio = bandeja de toda la empresa. */
  siteId?: string;
  canWrite: boolean;
  /** Destinos a los que este usuario puede enviar un mensaje a mano (módulo contratado + permiso). */
  routeTargets?: RouteTarget[];
  /** Formulario con el que se abre filtrada (desde «Formularios» del editor). */
  initialFormId?: string | null;
  /** Se llama con la cantidad de mensajes sin leer tras cada carga o cambio. */
  onUnreadChange?: (unread: number) => void;
}

const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'inbox', label: 'Por atender' },
  { value: 'unread', label: 'Sin leer' },
  { value: 'archived', label: 'Archivados' },
  { value: 'all', label: 'Todos' },
];

function formatAbsolute(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

const relativeFormat = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });

/** "hace 5 minutos", "ayer"… Pasado un mes no se aproxima: se muestra solo la fecha. */
function formatRelative(value: Date | string, now: number): string | null {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'hace un momento';
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86_400) return relativeFormat.format(Math.round(seconds / 86_400), 'day');
  return null;
}

interface Filters {
  status: StatusFilter;
  formKey: string;
  purpose: FormPurpose | '';
  destination: FormDestination | '';
  tag: string;
  q: string;
}

/** Clave del selector de formulario: sitio + bloque (el mismo id de bloque no se repite entre sitios, pero el de los mensajes de antes sí). */
const formKeyOf = (siteId: string, formId: string | null) => `${siteId}:${formId ?? 'legacy'}`;

function toQuery(filters: Filters, siteId?: string) {
  const [formSite, formId] = filters.formKey ? filters.formKey.split(':') : [undefined, undefined];
  return {
    siteId: siteId ?? formSite ?? null,
    formId: formId ?? null,
    purpose: filters.purpose || null,
    destination: filters.destination || null,
    tag: filters.tag || null,
    status: filters.status,
    q: filters.q.trim() || null,
  };
}

function exportHref(query: ReturnType<typeof toQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  return `/api/web-sites/messages/export?${params.toString()}`;
}

export default function WebSiteMessagesPanel({ siteId, canWrite, routeTargets = [], initialFormId = null, onUnreadChange }: Props) {
  const confirm = useConfirm();
  const searchId = useId();
  const [filters, setFilters] = useState<Filters>(() => ({ status: 'inbox', formKey: siteId && initialFormId ? formKeyOf(siteId, initialFormId) : '', purpose: '', destination: '', tag: '', q: '' }));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<FormMessagesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // "Ahora" se fija al cargar, no al renderizar: el texto relativo no cambia solo entre renders.
  const [now, setNow] = useState(0);
  const query = useMemo(() => toQuery(filters, siteId), [filters, siteId]);
  const scoped = !siteId;

  // El padre suele pasar una función nueva en cada render; se guarda en una ref para no recargar por eso.
  const onUnreadRef = useRef(onUnreadChange);
  useEffect(() => {
    onUnreadRef.current = onUnreadChange;
  }, [onUnreadChange]);
  // En la bandeja de la empresa, elegir un formulario acota el recuento a su sitio: ese número no es el total.
  const unreadIsTotal = Boolean(siteId) || !filters.formKey;
  useEffect(() => {
    if (page && unreadIsTotal) onUnreadRef.current?.(page.unread);
  }, [page, unreadIsTotal]);

  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listFormMessagesAction(query)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setPage(result.data);
          setNow(Date.now());
          setError(null);
        } else {
          setError(result.error);
          toast.error(result.error);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('No pudimos cargar los mensajes. Revisa tu conexión e intenta de nuevo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const reload = useCallback(() => {
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const patchRow = (id: string, patch: Partial<FormMessageRow>) => setPage((current) => (current ? { ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) } : current));
  const dropRow = (id: string) => setPage((current) => (current ? { ...current, rows: current.rows.filter((row) => row.id !== id), total: Math.max(0, current.total - 1) } : current));

  async function toggleRead(message: FormMessageRow) {
    const markRead = !message.readAt;
    const previous = message.readAt;
    setBusyId(message.id);
    patchRow(message.id, { readAt: markRead ? new Date() : null });
    setPage((current) => (current ? { ...current, unread: Math.max(0, current.unread + (markRead ? -1 : 1)) } : current));
    try {
      const result = await setWebSiteMessageReadAction(message.id, markRead);
      if (!result.success) {
        patchRow(message.id, { readAt: previous });
        reload();
        toast.error(result.error);
      }
    } catch {
      patchRow(message.id, { readAt: previous });
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleArchive(message: FormMessageRow) {
    const archive = !message.archivedAt;
    setBusyId(message.id);
    try {
      const result = await setWebSiteMessageArchivedAction(message.id, archive);
      if (!result.success) return void toast.error(result.error);
      if ((archive && filters.status !== 'all' && filters.status !== 'archived') || (!archive && filters.status === 'archived')) dropRow(message.id);
      else patchRow(message.id, { archivedAt: archive ? new Date() : null, readAt: archive ? (message.readAt ?? new Date()) : message.readAt });
      toast.success(archive ? 'Mensaje archivado' : 'Mensaje de vuelta en la bandeja');
      reload();
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(message: FormMessageRow) {
    const ok = await confirm({
      title: '¿Eliminar este mensaje?',
      description: `El envío de ${message.name} se elimina para siempre de la bandeja${message.routedId ? ' (el registro que ya se creó en el ERP no se borra)' : ''}. Si solo quieres sacarlo de los pendientes, archívalo.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setBusyId(message.id);
    try {
      const result = await deleteWebSiteMessageAction(message.id);
      if (!result.success) return void toast.error(result.error);
      dropRow(message.id);
      toast.success('Mensaje eliminado');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function route(message: FormMessageRow, target: RouteTarget) {
    const info = DESTINATION_INFO[target];
    const ok = await confirm({
      title: `¿Enviar a «${info.label}»?`,
      description: `${info.description} Quedará en ${info.where}.${target === 'tasks' ? ' La tarea queda a tu nombre.' : ''}`,
      confirmLabel: 'Enviar',
    });
    if (!ok) return;
    setBusyId(message.id);
    try {
      const result = await routeWebSiteMessageAction(message.id, target);
      if (!result.success) return void toast.error(result.error);
      patchRow(message.id, { routedKind: result.data.kind, routedHref: result.data.href, routedId: result.data.id, routeNote: result.data.note, readAt: message.readAt ?? new Date() });
      toast.success(result.message ?? 'Listo');
      reload();
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    try {
      const result = await markWebSiteMessagesReadAction(query);
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Listo');
      reload();
    } catch {
      toast.error(ACTION_ERROR);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const filtered = Boolean(filters.formKey || filters.purpose || filters.destination || filters.tag || filters.q);
  const rows = page?.rows ?? [];
  const forms = page?.forms ?? [];

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Bandeja de formularios">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
              {scoped ? 'Bandeja de formularios' : 'Mensajes'}
              {page && page.unread > 0 && <StatusBadge tone="info">{page.unread} sin leer</StatusBadge>}
            </h2>
            <p className="text-xs text-muted-foreground">
              Lo que llega desde {scoped ? 'los formularios de todos tus sitios' : 'los formularios de este sitio'}: contacto, cotizaciones, inscripciones y más, con dónde quedó cada uno en el ERP.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && page && page.unread > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
                <CheckCheck aria-hidden="true" /> Marcar todo como leído
              </Button>
            ) : null}
            <a href={exportHref(query)} className={buttonVariants({ variant: 'outline', size: 'sm' })} download>
              <Download aria-hidden="true" /> Excel
            </a>
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" /> Actualizar
            </Button>
          </div>
        </div>

        <div role="tablist" aria-label="Estado de los mensajes" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filters.status === tab.value}
              onClick={() => set({ status: tab.value })}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filters.status === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor={searchId} className="sr-only">
              Buscar por nombre, correo, teléfono o texto
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id={searchId} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" className="pl-8" maxLength={100} />
          </div>
          <select aria-label="Formulario" className={nativeSelectClass} value={filters.formKey} onChange={(event) => set({ formKey: event.target.value })}>
            <option value="">Todos los formularios</option>
            {forms.map((form) => (
              <option key={formKeyOf(form.siteId, form.formId)} value={formKeyOf(form.siteId, form.formId)}>
                {scoped ? `${form.siteName} · ` : ''}
                {form.title} ({form.total})
              </option>
            ))}
          </select>
          <select aria-label="Propósito" className={nativeSelectClass} value={filters.purpose} onChange={(event) => set({ purpose: event.target.value as FormPurpose | '' })}>
            <option value="">Cualquier propósito</option>
            {FORM_PURPOSES.map((purpose) => (
              <option key={purpose} value={purpose}>
                {PURPOSE_LABELS[purpose]}
              </option>
            ))}
          </select>
          <select aria-label="Destino en el ERP" className={nativeSelectClass} value={filters.destination} onChange={(event) => set({ destination: event.target.value as FormDestination | '' })}>
            <option value="">Cualquier destino</option>
            {FORM_DESTINATIONS.map((destination) => (
              <option key={destination} value={destination}>
                {DESTINATION_INFO[destination].area} · {DESTINATION_INFO[destination].label}
              </option>
            ))}
          </select>
          <select aria-label="Etiqueta" className={nativeSelectClass} value={filters.tag} onChange={(event) => set({ tag: event.target.value })} disabled={(page?.tags.length ?? 0) === 0 && !filters.tag}>
            <option value="">Cualquier etiqueta</option>
            {(page?.tags ?? []).map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        {page && page.total > rows.length ? <p className="text-xs text-muted-foreground">Se muestran los {rows.length} más recientes de {page.total}. Usa los filtros o descarga el Excel para verlos todos.</p> : null}
      </div>

      {loading && !page && !error ? (
        <ul className="divide-y divide-border" aria-busy="true" aria-label="Cargando mensajes">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="space-y-2 p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
              <Skeleton className="h-10 w-full" />
            </li>
          ))}
        </ul>
      ) : error && !page ? (
        <EmptyState icon={<Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />} title="No pudimos cargar los mensajes" description={error} actionLabel="Reintentar" onAction={reload} />
      ) : rows.length === 0 ? (
        filtered || filters.status !== 'inbox' ? (
          <EmptyState
            icon={<MailOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="No hay mensajes con este filtro"
            description="Prueba con otro formulario, propósito o estado."
            actionLabel="Quitar filtros"
            onAction={() => {
              setSearch('');
              setFilters({ status: 'inbox', formKey: '', purpose: '', destination: '', tag: '', q: '' });
            }}
          />
        ) : (
          <EmptyState
            icon={<Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="Estás al día"
            description="Aquí llegan los envíos de los formularios de tus sitios publicados. Para recibirlos también por correo o WhatsApp, crea una automatización con el disparador «Mensaje o formulario desde un sitio web»."
            action={
              <Link href="/dashboard/settings/automations" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Ir a automatizaciones
              </Link>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              now={now}
              busy={busyId === message.id}
              canWrite={canWrite}
              showSite={scoped}
              routeTargets={routeTargets}
              onToggleRead={() => void toggleRead(message)}
              onToggleArchive={() => void toggleArchive(message)}
              onRemove={() => void remove(message)}
              onRoute={(target) => void route(message, target)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface MessageItemProps {
  message: FormMessageRow;
  now: number;
  busy: boolean;
  canWrite: boolean;
  showSite: boolean;
  routeTargets: RouteTarget[];
  onToggleRead: () => void;
  onToggleArchive: () => void;
  onRemove: () => void;
  onRoute: (target: RouteTarget) => void;
}

function MessageItem({ message, now, busy, canWrite, showSite, routeTargets, onToggleRead, onToggleArchive, onRemove, onRoute }: MessageItemProps) {
  const isUnread = !message.readAt;
  const mailHref = message.email ? safeHref(`mailto:${message.email}`) : null;
  const phoneHref = message.phone ? safeHref(`tel:${message.phone}`) : null;
  const waHref = message.phone ? whatsappHref(message.phone) : null;
  const relative = formatRelative(message.createdAt, now);
  const routed = message.routedKind && message.routedKind !== 'inbox' ? DESTINATION_INFO[message.routedKind] : null;
  // Datos de contacto ya se muestran arriba: en la lista de respuestas van las demás.
  const answers = message.answers.filter((answer) => answer.value && answer.role !== 'name' && answer.role !== 'email' && answer.role !== 'phone');
  const available = routeTargets.filter((target) => !message.routedId && target !== message.routedKind);

  return (
    <li className={cn('space-y-3 p-4', isUnread && 'bg-info-soft/30')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold break-words">{message.name}</span>
          {isUnread && <StatusBadge tone="info">Sin leer</StatusBadge>}
          <StatusBadge tone="neutral">{PURPOSE_LABELS[message.purpose]}</StatusBadge>
          {message.tag ? <StatusBadge tone="accent">{message.tag}</StatusBadge> : null}
          {message.archivedAt ? <StatusBadge tone="neutral">Archivado</StatusBadge> : null}
        </div>
        <time dateTime={new Date(message.createdAt).toISOString()} className="text-xs text-muted-foreground">
          {relative ? `${relative} · ` : ''}
          {formatAbsolute(message.createdAt)}
        </time>
      </div>

      <p className="text-xs text-muted-foreground">
        {showSite ? `${message.siteName} · ` : ''}Formulario «{message.formTitle}»
      </p>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {message.email ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {mailHref ? (
              <a href={mailHref} className="text-primary hover:underline">
                {message.email}
              </a>
            ) : (
              message.email
            )}
          </span>
        ) : null}
        {message.phone ? (
          <span className="inline-flex items-center gap-1.5">
            <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {phoneHref ? (
              <a href={phoneHref} className="text-primary hover:underline">
                {message.phone}
              </a>
            ) : (
              message.phone
            )}
          </span>
        ) : null}
        {waHref ? (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </p>

      {/* Texto plano: lo escribe cualquier visitante, jamás se interpreta como HTML. */}
      {answers.length > 0 ? (
        <dl className="grid gap-x-4 gap-y-2 rounded-md bg-muted/50 px-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          {answers.map((answer) => (
            <div key={answer.id} className="contents">
              <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{answer.label}</dt>
              <dd className="min-w-0 break-words whitespace-pre-wrap">{answer.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {routed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 font-medium text-success">
            <ArrowRight className="size-3.5" aria-hidden="true" /> En {routed.where}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            <Inbox className="size-3.5" aria-hidden="true" /> Solo en la bandeja del sitio
          </span>
        )}
        {message.routedHref ? (
          <Link href={message.routedHref} className="font-medium text-primary hover:underline">
            Abrir en {routed?.area ?? 'el ERP'}
          </Link>
        ) : null}
        {message.routeNote ? <span className="text-warning">{message.routeNote}</span> : null}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onToggleRead}>
            {isUnread ? <MailOpen aria-hidden="true" /> : <Mail aria-hidden="true" />}
            {isUnread ? 'Marcar como leído' : 'Marcar como no leído'}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onToggleArchive}>
            {message.archivedAt ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {message.archivedAt ? 'Volver a la bandeja' : 'Archivar'}
          </Button>
          {available.map((target) => (
            <Button key={target} type="button" variant="outline" size="sm" disabled={busy} onClick={() => onRoute(target)}>
              <Send aria-hidden="true" /> Enviar a {DESTINATION_INFO[target].area}
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove} className="text-danger hover:bg-danger-soft hover:text-danger">
            <Trash2 aria-hidden="true" /> Eliminar
          </Button>
        </div>
      )}
    </li>
  );
}
