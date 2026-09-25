import {
  LOGIN_INTRO_GATE_SCRIPT,
  LOGIN_INTRO_SEEN_KEY,
  canStart,
  introDurationMs,
  introFrames,
  logoOpacity,
  positionAt,
  readyPrefix,
} from '@/components/auth/login-intro-timeline';

describe('intro en video del login', () => {
  it('usa todos los fotogramas con stride 1 y siempre incluye el último con stride mayor', () => {
    expect(introFrames(5, 1)).toEqual([0, 1, 2, 3, 4]);
    expect(introFrames(10, 3)).toEqual([0, 3, 6, 9]);
    expect(introFrames(11, 3)).toEqual([0, 3, 6, 9, 10]);
    expect(introFrames(0, 1)).toEqual([]);
  });

  it('dura lo mismo en modo liviano que en modo completo', () => {
    const full = introDurationMs(introFrames(144, 1).length, 18, 1);
    const light = introDurationMs(introFrames(144, 3).length, 18, 3);
    expect(full).toBeCloseTo(8000, 0);
    expect(Math.abs(light - full)).toBeLessThan(200);
  });

  it('avanza un fotograma por cuadro del set original y se detiene en el último', () => {
    expect(positionAt(0, 18, 1, 144)).toBe(0);
    expect(positionAt(1000, 18, 1, 144)).toBe(18);
    expect(positionAt(1000, 18, 3, 48)).toBe(6);
    expect(positionAt(60_000, 18, 1, 144)).toBe(143);
  });

  it('espera un buffer inicial contiguo antes de empezar', () => {
    const ready = Array.from({ length: 10 }, () => false);
    expect(canStart(ready)).toBe(false);
    ready[0] = ready[1] = ready[2] = true;
    ready[5] = true; // uno suelto más adelante no cuenta para el buffer
    expect(readyPrefix(ready)).toBe(3);
    expect(canStart(ready)).toBe(false);
    ready[3] = true;
    expect(canStart(ready)).toBe(true);
  });

  it('revela el logo solo al final, con entrada suave', () => {
    expect(logoOpacity(0.5)).toBe(0);
    expect(logoOpacity(1)).toBe(1);
    const mid = logoOpacity(0.86);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('el script de la compuerta usa la misma clave de sesión que el componente', () => {
    expect(LOGIN_INTRO_GATE_SCRIPT).toContain(`'${LOGIN_INTRO_SEEN_KEY}'`);
    expect(LOGIN_INTRO_GATE_SCRIPT).toContain('prefers-reduced-motion');
    expect(LOGIN_INTRO_GATE_SCRIPT).not.toContain('${');
  });
});
