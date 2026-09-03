'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNotificationSummaryAction, type NotificationItem } from '@/lib/actions/notifications';

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

  return (
    <Popover.Root
      onOpenChange={(open) => {
        // Refresca al abrir: las señales (CxC, stock, aprobaciones) pueden
        // cambiar entre una apertura y otra de la misma sesión larga.
        if (open) load();
      }}
    >
      <Popover.Trigger
        className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notificaciones"
      >
        <Bell className="size-5" />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-80 rounded-xl border border-border bg-card p-2 text-card-foreground shadow-lg outline-none transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Notificaciones</p>
            {loading && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Cargando...</p>}
            {!loading && items.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin novedades por ahora</p>
            )}
            {!loading &&
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[item.severity])} />
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
