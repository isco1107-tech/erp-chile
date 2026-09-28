'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Inbox, Mail, MailOpen, Phone, RefreshCw, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-provider';
import { safeHref } from '@/lib/web-sites/urls';
import { deleteWebSiteMessageAction, listWebSiteMessagesAction, setWebSiteMessageReadAction } from '@/modules/web-sites/actions/web-sites.actions';
import type { WebSiteMessageRow } from '@/modules/web-sites/services/web-sites.service';

interface Props {
  siteId: string;
  canWrite: boolean;
  /** Se llama con la cantidad de mensajes sin leer tras cada carga o cambio. */
  onUnreadChange?: (unread: number) => void;
}

const ACTION_ERROR = 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.';

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

export default function WebSiteMessagesPanel({ siteId, canWrite, onUnreadChange }: Props) {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<WebSiteMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // "Ahora" se fija al cargar, no al renderizar: el texto relativo no cambia solo entre renders.
  const [now, setNow] = useState(0);

  const unread = messages.filter((message) => !message.readAt).length;

  // El padre suele pasar una función nueva en cada render; se guarda en una ref para no recargar por eso.
  const onUnreadRef = useRef(onUnreadChange);
  useEffect(() => {
    onUnreadRef.current = onUnreadChange;
  }, [onUnreadChange]);
  useEffect(() => {
    if (loaded) onUnreadRef.current?.(unread);
  }, [loaded, unread]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listWebSiteMessagesAction(siteId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setMessages(result.data);
          setNow(Date.now());
          setError(null);
          setLoaded(true);
        } else {
          setError(result.error);
          toast.error(result.error);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const message = 'No pudimos cargar los mensajes. Revisa tu conexión e intenta de nuevo.';
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadKey]);

  const reload = useCallback(() => {
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  async function toggleRead(message: WebSiteMessageRow) {
    const markRead = !message.readAt;
    const previous = message.readAt;
    const patch = (readAt: Date | null) => setMessages((list) => list.map((item) => (item.id === message.id ? { ...item, readAt } : item)));
    setBusyId(message.id);
    patch(markRead ? new Date() : null);
    try {
      const result = await setWebSiteMessageReadAction(message.id, markRead);
      if (!result.success) {
        patch(previous);
        toast.error(result.error);
      }
    } catch {
      patch(previous);
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(message: WebSiteMessageRow) {
    const ok = await confirm({
      title: '¿Eliminar este mensaje?',
      description: `El mensaje de ${message.name} se elimina para siempre. Si solo quieres sacarlo de los pendientes, márcalo como leído.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setBusyId(message.id);
    try {
      const result = await deleteWebSiteMessageAction(message.id);
      if (!result.success) return void toast.error(result.error);
      setMessages((list) => list.filter((item) => item.id !== message.id));
      toast.success('Mensaje eliminado');
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  const visible = onlyUnread ? messages.filter((message) => !message.readAt) : messages;

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Mensajes del formulario de contacto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
            Mensajes
            {unread > 0 && <StatusBadge tone="info">{unread} sin leer</StatusBadge>}
          </h2>
          <p className="text-xs text-muted-foreground">Lo que la gente escribe desde el formulario de contacto de tu sitio publicado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={onlyUnread} onCheckedChange={setOnlyUnread} label="Solo sin leer" />
            <span aria-hidden="true">Solo sin leer</span>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" /> Actualizar
          </Button>
        </div>
      </div>

      {loading && !loaded && !error ? (
        <ul className="divide-y divide-border" aria-busy="true" aria-label="Cargando mensajes">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="space-y-2 p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
              <Skeleton className="h-10 w-full" />
            </li>
          ))}
        </ul>
      ) : error && !loaded ? (
        <EmptyState icon={<Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />} title="No pudimos cargar los mensajes" description={error} actionLabel="Reintentar" onAction={reload} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="Todavía no hay mensajes"
          description="Aquí llegan los mensajes que la gente envía desde el formulario de contacto de tu sitio publicado. Para recibirlos también por correo, crea una automatización con el disparador «Mensaje desde un sitio web»."
          action={
            <Link href="/dashboard/settings/automations" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Ir a automatizaciones
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<MailOpen className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="No tienes mensajes sin leer"
          description="Estás al día. Puedes ver todos los mensajes cuando quieras."
          actionLabel="Ver todos"
          onAction={() => setOnlyUnread(false)}
        />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((message) => {
            const isUnread = !message.readAt;
            const mailHref = safeHref(`mailto:${message.email}`);
            const phoneHref = message.phone ? safeHref(`tel:${message.phone}`) : null;
            const relative = formatRelative(message.createdAt, now);
            const busy = busyId === message.id;
            return (
              <li key={message.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{message.name}</span>
                    {isUnread && <StatusBadge tone="info">Sin leer</StatusBadge>}
                  </div>
                  <time dateTime={new Date(message.createdAt).toISOString()} className="text-xs text-muted-foreground">
                    {relative ? `${relative} · ` : ''}
                    {formatAbsolute(message.createdAt)}
                  </time>
                </div>

                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {mailHref ? (
                      <a href={mailHref} className="text-primary hover:underline">
                        {message.email}
                      </a>
                    ) : (
                      message.email
                    )}
                  </span>
                  {message.phone && (
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
                  )}
                </p>

                {/* Texto plano con saltos de línea: lo escribe cualquier visitante, jamás se interpreta como HTML. */}
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm break-words whitespace-pre-wrap">{message.message}</p>

                {canWrite && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void toggleRead(message)}>
                      {isUnread ? <MailOpen aria-hidden="true" /> : <Mail aria-hidden="true" />}
                      {isUnread ? 'Marcar como leído' : 'Marcar como no leído'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(message)} className="text-danger hover:bg-danger-soft hover:text-danger">
                      <Trash2 aria-hidden="true" /> Eliminar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
