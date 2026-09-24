/**
 * Modo liviano de /landing-v2: se activa cuando la persona pidió ahorrar datos,
 * la conexión es lenta o el equipo tiene muy poca memoria o núcleos. En ese
 * modo el hero baja uno de cada tres fotogramas y el cielo interactivo no se
 * dibuja (queda el fondo estático): la página se ve igual, con menos trabajo.
 */

interface NetworkHints {
  saveData?: boolean;
  effectiveType?: string;
}

type NavigatorHints = Navigator & { connection?: NetworkHints; deviceMemory?: number };

const SLOW_CONNECTIONS = new Set(['slow-2g', '2g', '3g']);

export function isLightweightDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hints = navigator as NavigatorHints;
  if (hints.connection?.saveData) return true;
  if (SLOW_CONNECTIONS.has(hints.connection?.effectiveType ?? '')) return true;
  if (typeof hints.deviceMemory === 'number' && hints.deviceMemory <= 2) return true;
  return typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
}
