'use client';

import { useEffect, useState } from 'react';
import type { HoursDay } from '@/lib/web-sites/blocks';
import { hoursStatus, type HoursStatus as Status } from '@/lib/web-sites/hours';
import { cx } from './parts';

/**
 * "Abierto ahora" / "Cerrado · abre mañana a las 09:00" con la hora de Chile.
 * Se calcula en el navegador al montar (el HTML del servidor no depende de la
 * hora, así servidor y navegador coinciden) y se refresca cada minuto.
 */
export default function HoursStatusBadge({ week, className }: { week: HoursDay[]; className?: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const tick = () => setStatus(hoursStatus(week, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [week]);

  if (!status) return null;
  return (
    <p role="status" className={cx('inline-flex items-center gap-2 rounded-full border border-[color:var(--s-line)] px-3.5 py-1.5 text-sm font-semibold', className)}>
      <span aria-hidden="true" className={cx('size-2.5 rounded-full', status.open ? 'bg-[#16a34a]' : 'bg-[#dc2626]')} />
      {status.text}
    </p>
  );
}
