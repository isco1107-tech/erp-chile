'use client';

import { useEffect, useState } from 'react';

/**
 * Cuenta regresiva. El servidor pinta la fecha ya formateada (es-CL, hora de
 * Chile) y los cuadros vacíos; los números aparecen al montar en el navegador,
 * así el HTML es igual en servidor y cliente. Los números no se anuncian cada
 * segundo (`aria-live="off"`): la fecha de arriba es la información útil.
 */

const UNITS = [
  { key: 'days', label: 'días' },
  { key: 'hours', label: 'horas' },
  { key: 'minutes', label: 'minutos' },
  { key: 'seconds', label: 'segundos' },
] as const;

function split(ms: number): Record<(typeof UNITS)[number]['key'], number> {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export default function Countdown({ targetMs, dateLabel, endedText }: { targetMs: number; dateLabel: string; endedText: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now !== null && targetMs - now <= 0) {
    return (
      <p role="status" className="ws-h text-2xl @2xl:text-3xl">
        {endedText || 'El plazo terminó'}
      </p>
    );
  }

  const parts = now === null ? null : split(targetMs - now);
  return (
    <div>
      <p className="ws-muted text-sm font-medium">{dateLabel}</p>
      <div aria-live="off" className="mx-auto mt-6 grid max-w-xl grid-cols-4 gap-2.5 @2xl:gap-4">
        {UNITS.map((unit) => (
          <div key={unit.key} className="ws-card px-1 py-4 text-center @2xl:py-6">
            <span className="ws-h block text-3xl tabular-nums @2xl:text-5xl [color:var(--s-mark)]">{parts ? String(parts[unit.key]).padStart(2, '0') : '--'}</span>
            <span className="ws-muted mt-1 block text-[0.65rem] tracking-wider uppercase @2xl:text-xs">{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
