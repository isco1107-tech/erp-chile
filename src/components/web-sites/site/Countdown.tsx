'use client';

import { useEffect, useState } from 'react';
import { cx } from './parts';

/**
 * Cuenta regresiva. El servidor pinta la fecha ya formateada (es-CL, hora de
 * Chile) y los cuadros vacíos; los números aparecen al montar en el navegador,
 * así el HTML es igual en servidor y cliente. Los números no se anuncian cada
 * segundo (`aria-live="off"`): la fecha de arriba es la información útil.
 */

const UNITS = [
  { key: 'days', label: 'días', short: 'días' },
  { key: 'hours', label: 'horas', short: 'horas' },
  { key: 'minutes', label: 'minutos', short: 'min' },
  { key: 'seconds', label: 'segundos', short: 'seg' },
] as const;

/** Nombre de la unidad: abreviado en pantallas muy angostas, donde «segundos» no cabe en su cuadro. */
function UnitLabel({ unit }: { unit: (typeof UNITS)[number] }) {
  if (unit.short === unit.label) return <>{unit.label}</>;
  return (
    <>
      <span className="@sm:hidden">{unit.short}</span>
      <span className="hidden @sm:inline">{unit.label}</span>
    </>
  );
}

function split(ms: number): Record<(typeof UNITS)[number]['key'], number> {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export default function Countdown({ targetMs, dateLabel, endedText, variant = 'boxes' }: { targetMs: number; dateLabel: string; endedText: string; variant?: 'boxes' | 'minimal' | 'big' }) {
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
  const value = (key: (typeof UNITS)[number]['key']) => (parts ? String(parts[key]).padStart(2, '0') : '--');
  if (variant !== 'boxes') {
    const big = variant === 'big';
    return (
      <div>
        <p className="ws-muted text-sm font-medium">{dateLabel}</p>
        <div aria-live="off" className={cx('mx-auto mt-6 flex max-w-4xl items-start justify-center', big ? 'gap-2 @2xl:gap-5' : 'gap-2 @2xl:gap-3')}>
          {UNITS.map((unit, index) => (
            <div key={unit.key} className="flex items-start">
              {index > 0 && (
                <span aria-hidden="true" className={cx('ws-h ws-muted hidden px-0.5 @lg:block @2xl:px-1', big ? 'ws-t-xl' : 'text-3xl @2xl:text-5xl')}>
                  :
                </span>
              )}
              <div className="min-w-[3.2rem] text-center">
                <span className={cx('ws-h ws-num block tabular-nums', big ? 'ws-t-xl' : 'text-4xl @2xl:text-6xl')}>{value(unit.key)}</span>
                <span className="ws-muted mt-1 block text-[0.7rem] whitespace-nowrap @2xl:text-xs @2xl:tracking-wider @2xl:uppercase">
                  <UnitLabel unit={unit} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="ws-muted text-sm font-medium">{dateLabel}</p>
      <div aria-live="off" className="mx-auto mt-6 grid max-w-xl grid-cols-4 gap-2.5 @2xl:gap-4">
        {UNITS.map((unit) => (
          <div key={unit.key} className="ws-card min-w-0 px-1 py-4 text-center @2xl:py-6">
            <span className="ws-h block text-[clamp(1.05rem,6cqi,1.9rem)] tabular-nums @2xl:text-5xl [color:var(--s-mark)]">{value(unit.key)}</span>
            <span className="ws-muted mt-1 block text-[0.7rem] whitespace-nowrap @2xl:text-xs @2xl:tracking-wider @2xl:uppercase">
              <UnitLabel unit={unit} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
