'use client';

import { MessageCircleQuestion } from 'lucide-react';
import { MANUAL_ASSISTANT_OPEN_EVENT } from './assistant-events';

const buttonClass =
  'flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Acceso al Asistente desde la barra superior (reemplaza a los botones
 * flotantes de las esquinas, que tapaban contenido). Es el único asistente:
 * absorbió al antiguo Copiloto Financiero, así que también responde con
 * cifras reales según los módulos y permisos del usuario.
 */
export default function HeaderAssistantButtons() {
  return (
    <button
      type="button"
      className={buttonClass}
      onClick={() => window.dispatchEvent(new Event(MANUAL_ASSISTANT_OPEN_EVENT))}
      aria-label="Abrir asistente"
    >
      <MessageCircleQuestion className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
      <span className="hidden xl:inline">Asistente</span>
    </button>
  );
}
