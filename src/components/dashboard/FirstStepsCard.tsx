'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import type { FirstStep } from '@/lib/onboarding/first-steps';

function hiddenKey(userId: string): string {
  return `first-steps-hidden:${userId}`;
}

function readHidden(userId: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(userId)) === '1';
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tarjeta de «Primeros pasos» en Inicio. Cada paso se marca solo cuando de
 * verdad está hecho (lo calcula el servidor); «Ocultar» la guarda en este
 * navegador para quien decida no completar alguno (por ejemplo, no invitar a nadie).
 */
export default function FirstStepsCard({ steps, userId }: { steps: FirstStep[]; userId: string }) {
  // En el servidor (y en el primer dibujo) se muestra: así no cambia el HTML al hidratar.
  const hidden = useSyncExternalStore(subscribe, () => readHidden(userId), () => false);
  if (hidden) return null;
  const done = steps.filter((step) => step.done).length;

  function hide() {
    try {
      window.localStorage.setItem(hiddenKey(userId), '1');
    } catch {
      /* sin storage: se seguirá mostrando, no es grave */
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <section aria-labelledby="first-steps-title" className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="first-steps-title" className="text-base font-semibold text-foreground">Primeros pasos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {done} de {steps.length} listos. Cada paso se marca solo cuando está hecho.
          </p>
        </div>
        <button type="button" onClick={hide} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Ocultar
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((done / Math.max(steps.length, 1)) * 100)}%` }} />
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.id} className="flex flex-wrap items-start gap-3">
            {step.done ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Listo" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Pendiente" />
            )}
            <div className="min-w-0 flex-1 basis-48">
              <p className={`text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{step.title}</p>
              {!step.done && <p className="text-xs text-muted-foreground">{step.why}</p>}
            </div>
            {!step.done && (step.href === '/pos' ? (
              // El POS se abre con una carga completa: así recibe el permiso de USB del cajón y la impresora.
              <a href={step.href} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                {step.actionLabel}
              </a>
            ) : (
              <Link href={step.href} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                {step.actionLabel}
              </Link>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
