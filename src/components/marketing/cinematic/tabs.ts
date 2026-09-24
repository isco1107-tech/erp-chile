import type { KeyboardEvent } from 'react';

/**
 * Teclado de un `role="tablist"` (patrón de pestañas de WAI-ARIA): flechas,
 * Inicio y Fin cambian de pestaña y mueven el foco a la nueva.
 */
export function tabKeys(event: KeyboardEvent<HTMLElement>, index: number, count: number, change: (index: number) => void) {
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % count;
  else if (event.key === 'ArrowLeft') next = (index + count - 1) % count;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  else return;
  event.preventDefault();
  change(next);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
