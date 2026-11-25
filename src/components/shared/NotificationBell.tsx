'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PushNotificationsToggle } from '@/components/shared/PushNotificationsToggle';
import { getNotificationSummaryAction, dismissWorkflowNotificationAction, type NotificationItem } from '@/lib/actions/notifications';

const SEVERITY_DOT: Record<NotificationItem['severity'], string> = {
  critical: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const result = await getNotificationSummaryAction();
    if (result.success) setItems(result.data.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function dismiss(item: NotificationItem) {
    // Optimista: la fila desaparece al toque, sin esperar la vuelta del servidor.
    setItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
    await dismissWorkflowNotificationAction(item.id.replace(/^workflow-/, ''));
  }

  return (
    <Popover.Root
      onOpenChange={(open) => {
        // Refresca al abrir: las señales (CxC, stock, aprobaciones) pueden
        // cambiar entre una apertura y otra de la misma sesión larga.
        if (open) load();
      }}
    >
      <Popover.Trigger
        className="relative flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Notificaciones"
      >
        <Bell className="size-5" />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal data-slot="workspace-popover">
        <Popover.Positioner className="z-30" side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="max-h-[min(32rem,var(--available-height))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-2 text-card-foreground shadow-lg outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Notificaciones</p>
            {loading && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Cargando...</p>}
            {!loading && items.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin novedades por ahora</p>
            )}
            {!loading &&
              items.map((item) => (
                <div key={item.id} className="flex items-center gap-1 rounded-lg hover:bg-muted focus-within:bg-muted">
                  <Popover.Close
                    render={<Link href={item.href} />}
                    nativeButton={false}
                    className="flex min-h-11 min-w-0 flex-1 items-start gap-2.5 rounded-lg p-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[item.severity])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{item.title}</span>
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.description}</span>
                    </span>
                  </Popover.Close>
                  {item.dismissible && (
                    <button
                      type="button"
                      onClick={() => void dismiss(item)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Descartar notificación: ${item.title}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            <PushNotificationsToggle />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
