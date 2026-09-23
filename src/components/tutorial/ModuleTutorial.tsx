'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleKeyForPath } from './tutorial-routes';
import { TUTORIAL_CONTENT, type TutorialStep } from './tutorial-content';
import { computeTooltipPosition, type Rect } from './spotlight-position';

/** Disparado por `HowToUseButton` para reabrir el tutorial del módulo actual a mano. */
export const TUTORIAL_REOPEN_EVENT = 'erp:reopen-tutorial';

/** `data-tutorial` del botón "Cómo usar" del header — ver `HowToUseButton.tsx`. Todo tour termina apuntando ahí. */
const HELP_BUTTON_TARGET = 'module-help-button';

function storageKey(userId: string, moduleKey: string): string {
  return `tutorial-seen:${userId}:${moduleKey}`;
}

function hasSeen(userId: string, moduleKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId, moduleKey)) === '1';
  } catch {
    // Sin storage (navegación privada estricta, etc): mejor no insistir en abrirlo solo.
    return true;
  }
}

function markSeen(userId: string, moduleKey: string): void {
  try {
    window.localStorage.setItem(storageKey(userId, moduleKey), '1');
  } catch {
    // Sin storage, simplemente se ofrecerá de nuevo la próxima vez — degradación aceptable.
  }
}

/**
 * Todo tour termina con el mismo paso de cierre, generado acá (no repetido a
 * mano en las 33 entradas de `tutorial-content.ts`) apuntando al botón real
 * del header — así "dónde encontrarlo después" es siempre consistente.
 */
function buildSteps(steps: TutorialStep[]): Required<TutorialStep>[] {
  const withDefaults = steps.map((s) => ({ target: undefined, placement: 'bottom' as const, ...s }));
  return [
    ...withDefaults,
    {
      title: 'Vuelve a verlo cuando quieras',
      description: 'Este botón abre de nuevo esta guía en cualquier momento, sin tener que esperar a que reaparezca sola.',
      target: HELP_BUTTON_TARGET,
      placement: 'bottom',
    },
  ] as Required<TutorialStep>[];
}

interface ModuleTutorialProps {
  /** `context.id` del usuario logueado — el "visto" se recuerda por usuario, no por navegador a secas. */
  userId: string;
}

const DEFAULT_TOOLTIP_SIZE = { width: 340, height: 168 };
const RETRY_DELAYS_MS = [0, 120, 250, 400, 600, 900];

/**
 * Tour de bienvenida por módulo con foco real sobre la interfaz: cada paso
 * puede anclarse a un elemento real de la pantalla (`data-tutorial="..."`) —
 * el resto de la pantalla se oscurece, el elemento queda resaltado con un
 * marco, y un globo con flecha apunta hacia él. Un paso sin `target` (una
 * explicación conceptual, sin un botón único al que apuntar) se muestra como
 * tarjeta centrada, mismo look, sin recorte.
 *
 * Se auto-abre una sola vez por módulo+usuario (localStorage) y se monta una
 * sola vez en el layout del dashboard — detecta el módulo actual por
 * `usePathname()`, ninguna página de módulo necesita importarlo.
 */
export default function ModuleTutorial({ userId }: ModuleTutorialProps) {
  const pathname = usePathname();
  const moduleKey = getModuleKeyForPath(pathname);
  const content = moduleKey ? TUTORIAL_CONTENT[moduleKey] : undefined;
  const steps = useMemo(() => (content ? buildSteps(content.steps) : []), [content]);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipSize, setTooltipSize] = useState(DEFAULT_TOOLTIP_SIZE);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Auto-abrir: una vez por usuario+módulo, solo si hay contenido para esta ruta.
  // Se marca "visto" ya en este momento (no al cerrar): el overlay de foco no
  // bloquea clicks fuera del elemento resaltado (el halo es solo `box-shadow`,
  // sin superficie propia), así que el usuario puede navegar a otra pantalla
  // sin pasar por `close()` — si el "visto" quedara pendiente de ese cierre
  // explícito, el tour reaparecería en cada visita al módulo en vez de una
  // sola vez.
  useEffect(() => {
    setStep(0);
    if (!moduleKey || !content) {
      setOpen(false);
      return;
    }
    if (hasSeen(userId, moduleKey)) {
      setOpen(false);
      return;
    }
    markSeen(userId, moduleKey);
    setOpen(true);
  }, [moduleKey, content, userId]);

  // Reapertura manual desde el botón "Cómo usar", sin importar si ya se vio.
  useEffect(() => {
    function handleReopen(event: Event) {
      const detail = (event as CustomEvent<{ moduleKey: string }>).detail;
      if (!detail || detail.moduleKey !== moduleKey) return;
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(TUTORIAL_REOPEN_EVENT, handleReopen);
    return () => window.removeEventListener(TUTORIAL_REOPEN_EVENT, handleReopen);
  }, [moduleKey]);

  const close = useCallback(() => {
    if (moduleKey) markSeen(userId, moduleKey);
    setOpen(false);
  }, [moduleKey, userId]);

  const current = steps[step] as Required<TutorialStep> | undefined;
  const total = steps.length;
  const isLast = step === total - 1;

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, total - 1));
  }, [total]);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Tamaño de ventana, para acotar la posición del tooltip dentro del viewport.
  useEffect(() => {
    if (!open) return;
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [open]);

  // Ubica el elemento real del paso actual (con reintentos cortos: puede
  // seguir montándose detrás de un Suspense) y lo mantiene sincronizado ante
  // scroll/resize/cambios de tamaño propios mientras el paso siga activo.
  useEffect(() => {
    if (!open || !current?.target) {
      setTargetRect(null);
      return;
    }
    const target = current.target;

    let cancelled = false;
    let attempt = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let scrollTimeout: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;

    function updateFromElement(el: Element) {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    function attach(el: Element) {
      window.addEventListener('scroll', onReflow, true);
      window.addEventListener('resize', onReflow);
      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => updateFromElement(el));
        resizeObserver.observe(el);
      }
    }

    function onReflow() {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      if (el) updateFromElement(el);
    }

    function locate() {
      if (cancelled) return;
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrollTimeout = setTimeout(() => {
          if (cancelled) return;
          updateFromElement(el);
          attach(el);
        }, 260);
        return;
      }
      if (attempt < RETRY_DELAYS_MS.length - 1) {
        attempt += 1;
        retryTimeout = setTimeout(locate, RETRY_DELAYS_MS[attempt]);
      } else {
        setTargetRect(null);
      }
    }

    locate();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
      resizeObserver?.disconnect();
    };
  }, [open, step, current?.target]);

  // Mide el tooltip ya renderizado (alto real según el largo del texto) para
  // que `computeTooltipPosition` no tenga que adivinarlo. Sin arreglo de
  // dependencias a propósito: debe remedir en cada render (el contenido
  // cambia de alto por texto, target encontrado, viewport, etc.) — no causa
  // un loop porque `setTooltipSize` solo actualiza el estado si el tamaño
  // realmente cambió (guard de abajo), así que se estabiliza solo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) return;
    const r = tooltipRef.current.getBoundingClientRect();
    setTooltipSize((prev) => (Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : { width: r.width, height: r.height }));
  });

  // Atajos de teclado: Esc cierra, flechas/Enter navegan.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        if (isLast) close();
        else next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isLast, close, next, prev]);

  useEffect(() => {
    tooltipRef.current?.focus();
  }, [step, open]);

  if (!mounted || !open || !current) return null;

  const hasAnchor = Boolean(current.target) && targetRect !== null;
  const position =
    hasAnchor && viewport.width > 0
      ? computeTooltipPosition(targetRect!, tooltipSize, current.placement, viewport.width, viewport.height)
      : null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={`Cómo usar: ${content!.title}`}>
      {hasAnchor ? (
        <>
          <div
            aria-hidden
            className="fixed rounded-2xl transition-all duration-300 ease-out"
            style={{
              top: targetRect!.top - 8,
              left: targetRect!.left - 8,
              width: targetRect!.width + 16,
              height: targetRect!.height + 16,
              boxShadow: '0 0 0 9999px rgba(8, 8, 12, 0.7), 0 0 0 2px var(--primary), 0 0 24px 2px color-mix(in srgb, var(--primary) 55%, transparent)',
            }}
          />
          <div
            aria-hidden
            className="fixed animate-pulse rounded-2xl"
            style={{
              top: targetRect!.top - 8,
              left: targetRect!.left - 8,
              width: targetRect!.width + 16,
              height: targetRect!.height + 16,
              boxShadow: '0 0 0 6px color-mix(in srgb, var(--primary) 35%, transparent)',
            }}
          />
        </>
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/65" />
      )}

      <div
        ref={tooltipRef}
        tabIndex={-1}
        className={cn(
          'fixed w-[340px] max-w-[calc(100vw-24px)] animate-in rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg outline-none duration-200 fade-in zoom-in-95'
        )}
        style={
          position
            ? { top: position.top, left: position.left }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
      >
        {position && <TooltipArrow placement={position.placement} offset={position.arrowOffset} />}

        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Cómo usar: {content!.title} · Paso {step + 1} de {total}
        </p>

        <div className="mt-2 space-y-1.5">
          <h3 className="text-base font-semibold text-foreground">{current.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.description}</p>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {steps.map((tutorialStep, index) => (
            <span
              key={tutorialStep.title}
              aria-hidden
              className={cn('h-1.5 rounded-full transition-all', index === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted')}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={close}>Omitir</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={prev}>Anterior</Button>
            )}
            {isLast ? (
              <Button type="button" size="sm" onClick={close}>Entendido</Button>
            ) : (
              <Button type="button" size="sm" onClick={next}>Siguiente</Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Triangulito tipo globo de historieta, del color de la tarjeta, apuntando hacia el elemento resaltado. */
function TooltipArrow({ placement, offset }: { placement: 'top' | 'bottom' | 'left' | 'right'; offset: number }) {
  const base = 'absolute size-3 rotate-45 border border-border bg-card';
  switch (placement) {
    case 'bottom':
      return <span aria-hidden className={cn(base, '-top-1.5 border-r-0 border-b-0')} style={{ left: offset - 6 }} />;
    case 'top':
      return <span aria-hidden className={cn(base, '-bottom-1.5 border-t-0 border-l-0')} style={{ left: offset - 6 }} />;
    case 'right':
      return <span aria-hidden className={cn(base, '-left-1.5 border-t-0 border-r-0')} style={{ top: offset - 6 }} />;
    case 'left':
      return <span aria-hidden className={cn(base, '-right-1.5 border-b-0 border-l-0')} style={{ top: offset - 6 }} />;
    default:
      return null;
  }
}
