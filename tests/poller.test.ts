import { createPoller, pollDelay, type PollerEnv } from '@/lib/polling/poller';

function makeEnv(initialHidden = false) {
  let hidden = initialHidden;
  const listeners = new Set<() => void>();
  const env: PollerEnv = {
    isHidden: () => hidden,
    onVisibilityChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    random: () => 0.5, // sin variación: (0,5*2-1)=0
  };
  return {
    env,
    setHidden(value: boolean) {
      hidden = value;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('pollDelay', () => {
  it('sin variación devuelve el intervalo; con extremos queda dentro de ±jitter', () => {
    expect(pollDelay(1000, 0.1, 0.5)).toBe(1000);
    expect(pollDelay(1000, 0.1, 0)).toBe(900);
    expect(pollDelay(1000, 0.1, 1)).toBe(1100);
  });
  it('limita el jitter a 0,5 y nunca devuelve negativos', () => {
    expect(pollDelay(1000, 5, 0)).toBe(500);
    expect(pollDelay(0, 0.1, 0)).toBe(0);
  });
});

describe('createPoller', () => {
  it('ejecuta cada intervalo mientras la pestaña está visible', async () => {
    const { env } = makeEnv();
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    await jest.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('no se solapa: espera a que termine una vuelta lenta antes de agendar la siguiente', async () => {
    const { env } = makeEnv();
    const run = jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 5000)));
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    await jest.advanceTimersByTimeAsync(1000); // arranca la 1ª
    await jest.advanceTimersByTimeAsync(4000); // sigue en curso, no hay 2ª
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000); // la 1ª termina; la 2ª se agenda 1000 ms después
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('se pausa con la pestaña oculta y refresca de inmediato al volver', async () => {
    const { env, setHidden } = makeEnv();
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    setHidden(true);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);

    setHidden(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('con pauseWhenHidden=false sigue consultando con la pestaña oculta', async () => {
    const { env } = makeEnv(true);
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000, pauseWhenHidden: false }, env);
    poller.start();
    await jest.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('una vuelta que falla no detiene el sondeo', async () => {
    const { env } = makeEnv();
    const run = jest.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    await jest.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('stop cancela lo agendado y deja de escuchar la visibilidad', async () => {
    const { env, listenerCount } = makeEnv();
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    expect(listenerCount()).toBe(1);
    poller.stop();
    expect(listenerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it('start dos veces no duplica el sondeo', async () => {
    const { env } = makeEnv();
    const run = jest.fn().mockResolvedValue(undefined);
    const poller = createPoller({ run, intervalMs: 1000 }, env);
    poller.start();
    poller.start();
    await jest.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});
