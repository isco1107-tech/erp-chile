'use client';

import { Sparkles, MessageCircleQuestion } from 'lucide-react';
import { COPILOT_OPEN_EVENT, MANUAL_ASSISTANT_OPEN_EVENT } from './assistant-events';

const buttonClass =
  'flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Accesos a los asistentes desde la barra superior. Reemplazan a los botones
 * flotantes de las esquinas, que tapaban contenido (en el POS, el monto del
 * vuelto quedaba debajo del botón del copiloto).
 */
export default function HeaderAssistantButtons({ showCopilot }: { showCopilot: boolean }) {
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => window.dispatchEvent(new Event(MANUAL_ASSISTANT_OPEN_EVENT))}
        aria-label="Abrir asistente de ayuda"
      >
        <MessageCircleQuestion className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden xl:inline">Asistente</span>
      </button>
      {showCopilot && (
        <button
          type="button"
          className={buttonClass}
          onClick={() => window.dispatchEvent(new Event(COPILOT_OPEN_EVENT))}
          aria-label="Abrir copiloto financiero"
        >
          <Sparkles className="size-[18px] text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden xl:inline">Copiloto</span>
        </button>
      )}
    </>
  );
}
