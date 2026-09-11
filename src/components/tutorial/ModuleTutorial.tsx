'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getModuleKeyForPath } from './tutorial-routes';
import { TUTORIAL_CONTENT } from './tutorial-content';

/** Disparado por `HowToUseButton` para reabrir el tutorial del módulo actual a mano. */
export const TUTORIAL_REOPEN_EVENT = 'erp:reopen-tutorial';

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

interface ModuleTutorialProps {
  /** `context.id` del usuario logueado — el "visto" se recuerda por usuario, no por navegador a secas. */
  userId: string;
}

/**
 * Tutorial de bienvenida por módulo: modal tipo carrusel (pasos numerados,
 * Anterior/Siguiente) que se auto-abre la primera vez que el usuario entra a
 * un módulo con contenido registrado (`TUTORIAL_CONTENT`), y no vuelve a
 * aparecer solo una vez cerrado. Se monta una sola vez en el layout del
 * dashboard y detecta el módulo actual por `usePathname()` — ninguna página
 * de módulo necesita importarlo ni pasarle props.
 */
export default function ModuleTutorial({ userId }: ModuleTutorialProps) {
  const pathname = usePathname();
  const moduleKey = getModuleKeyForPath(pathname);
  const content = moduleKey ? TUTORIAL_CONTENT[moduleKey] : undefined;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    if (!moduleKey || !content) {
      setOpen(false);
      return;
    }
    setOpen(!hasSeen(userId, moduleKey));
  }, [moduleKey, content, userId]);

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

  if (!moduleKey || !content) return null;

  const total = content.steps.length;
  const current = content.steps[step];
  if (!current) return null;
  const isLast = step === total - 1;

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cómo usar: {content.title}</DialogTitle>
          <DialogDescription>Paso {step + 1} de {total}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          <h3 className="text-base font-semibold text-foreground">{current.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.description}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {content.steps.map((tutorialStep, index) => (
            <span
              key={tutorialStep.title}
              aria-hidden
              className={`h-1.5 rounded-full transition-all ${index === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted'}`}
            />
          ))}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={close}>Omitir</Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>Anterior</Button>
            )}
            {isLast ? (
              <Button type="button" onClick={close}>Entendido</Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>Siguiente</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
