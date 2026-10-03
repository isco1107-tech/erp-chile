/**
 * Sondeo periódico sin las dos fallas del `setInterval` pelado:
 *  - no se solapa: la siguiente vuelta se agenda DESPUÉS de que termina la
 *    anterior, así un servidor lento no acumula peticiones en cola;
 *  - se detiene con la pestaña oculta y refresca de inmediato al volver, así
 *    una oficina con 50 pestañas olvidadas no mantiene 50 consultas por
 *    intervalo contra la base.
 * Agrega un poco de aleatoriedad al intervalo para que los clientes no
 * consulten todos en el mismo segundo.
 *
 * Es agnóstico de React y del navegador (el entorno se inyecta) para poder
 * probarlo con temporizadores falsos; el hook está en `src/hooks/use-polling.ts`.
 */

export interface PollerEnv {
  isHidden(): boolean;
  /** Avisa cuando cambia la visibilidad de la pestaña; devuelve cómo dejar de escuchar. */
  onVisibilityChange(listener: () => void): () => void;
  random(): number;
}

export interface PollerOptions {
  run: () => unknown | Promise<unknown>;
  intervalMs: number;
  /** Detener mientras la pestaña esté oculta (por defecto sí). */
  pauseWhenHidden?: boolean;
  /** Fracción de variación aleatoria del intervalo, 0–0,5 (por defecto 0,1). */
  jitter?: number;
}

export interface Poller {
  start(): void;
  stop(): void;
}

export const browserPollerEnv: PollerEnv = {
  isHidden: () => typeof document !== 'undefined' && document.hidden,
  onVisibilityChange: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  random: Math.random,
};

export function pollDelay(intervalMs: number, jitter: number, random: number): number {
  const spread = Math.min(Math.max(jitter, 0), 0.5);
  return Math.max(0, Math.round(intervalMs * (1 + (random * 2 - 1) * spread)));
}

export function createPoller(options: PollerOptions, env: PollerEnv = browserPollerEnv): Poller {
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  const jitter = options.jitter ?? 0.1;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopVisibility: (() => void) | null = null;
  let running = false;
  let paused = false;
  let inFlight = false;

  function schedule() {
    if (!running) return;
    timer = setTimeout(() => void tick(), pollDelay(options.intervalMs, jitter, env.random()));
  }

  async function tick() {
    timer = null;
    if (!running || inFlight) return;
    if (pauseWhenHidden && env.isHidden()) {
      paused = true;
      return;
    }
    inFlight = true;
    try {
      await options.run();
    } catch {
      // Una vuelta fallida no debe detener el sondeo: la acción que se consulta ya informa sus errores.
    } finally {
      inFlight = false;
    }
    schedule();
  }

  function handleVisibility() {
    if (!running || !paused || env.isHidden()) return;
    paused = false;
    void tick();
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      stopVisibility = env.onVisibilityChange(handleVisibility);
      schedule();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      stopVisibility?.();
      stopVisibility = null;
    },
  };
}
