'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import type { SetupReadinessReport } from '@/lib/setup/readiness';
import { SETUP_CHECKLIST_CHANGE_EVENT, setupChecklistStorageKey } from './storage';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(SETUP_CHECKLIST_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SETUP_CHECKLIST_CHANGE_EVENT, callback);
  };
}

/** Si el almacenamiento falla (modo privado, bloqueado) el cierre dura lo que dure la pestaña. */
const dismissedInMemory = new Map<string, boolean>();

function readDismissed(companyId: string): boolean {
  if (dismissedInMemory.get(companyId) !== undefined) return dismissedInMemory.get(companyId) === true;
  try {
    return window.localStorage.getItem(setupChecklistStorageKey(companyId)) === 'dismissed';
  } catch {
    return false;
  }
}

function writeDismissed(companyId: string, dismissed: boolean): void {
  dismissedInMemory.set(companyId, dismissed);
  try {
    if (dismissed) window.localStorage.setItem(setupChecklistStorageKey(companyId), 'dismissed');
    else window.localStorage.removeItem(setupChecklistStorageKey(companyId));
  } catch {
    // Sin almacenamiento: alcanza con la memoria.
  }
  window.dispatchEvent(new Event(SETUP_CHECKLIST_CHANGE_EVENT));
}

interface SetupChecklistCardProps {
  companyId: string;
  report: SetupReadinessReport;
}

/**
 * "Primeros pasos · X de Y" del Inicio. Cada ítem sale de datos reales (ver
 * `buildCompanySetupReadiness`) y apunta a la pantalla exacta donde se resuelve.
 * Se puede ocultar por empresa en este navegador y volver a mostrar.
 */
export function SetupChecklistCard({ companyId, report }: SetupChecklistCardProps) {
  // En el servidor no hay almacenamiento: se arma el estado compacto y la tarjeta
  // completa aparece al hidratar (evita mostrar a quien ya la cerró un destello de la grande).
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissed(companyId),
    () => true
  );

  if (report.total === 0 || report.complete) return null;

  if (dismissed) {
    return (
      <section
        id="primeros-pasos"
        aria-label="Primeros pasos"
        className="flex scroll-mt-20 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-card"
      >
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Rocket className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">Primeros pasos · {report.done} de {report.total}</span>
          <span className="text-muted-foreground">({report.percent}%)</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => writeDismissed(companyId, false)}>
          Mostrar primeros pasos
        </Button>
      </section>
    );
  }

  const nextId = report.next?.id ?? null;

  return (
    <section id="primeros-pasos" aria-label="Primeros pasos" className="relative scroll-mt-20 space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" data-tutorial="setup-checklist">
      <button
        type="button"
        onClick={() => writeDismissed(companyId, true)}
        aria-label="Ocultar primeros pasos"
        title="Ocultar (puedes volver a mostrarlos)"
        className="absolute top-4 right-4 rounded-lg p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground" aria-hidden="true">
          <Rocket className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Primeros pasos · {report.done} de {report.total}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lo que falta para que tu empresa quede lista para operar. Cada paso se marca solo cuando lo completas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={report.percent}
          aria-label="Avance de la configuración"
          className="h-2 flex-1 rounded-full bg-muted"
        >
          <div className="h-2 rounded-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${report.percent}%` }} />
        </div>
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{report.percent}%</span>
      </div>

      <ol className="space-y-2">
        {report.items.map((item) => {
          const isDone = item.status === 'ok';
          const isNext = item.id === nextId;
          return (
            <li
              key={item.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5',
                isNext ? 'border-primary/40 bg-accent' : 'border-border'
              )}
            >
              {isDone ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" strokeWidth={1.75} aria-label="Hecho" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-label="Pendiente" />
              )}
              <div className="min-w-0 flex-1 basis-60">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {item.label}
                  {isNext && <StatusBadge tone="info">Siguiente paso</StatusBadge>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              {!isDone && (
                <Link href={item.href} className={buttonVariants({ variant: isNext ? 'default' : 'outline', size: 'sm' })}>
                  {isNext ? 'Hacerlo ahora' : 'Ir'}
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
