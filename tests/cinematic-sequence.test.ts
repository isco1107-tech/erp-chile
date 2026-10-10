import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  FINALE_TIMING, SMOOTH_TIME, decodeWindow, finaleChoreography, finaleLastFrame, frameAt, frameBlend, framePoint, frameUrl, loadOrder,
  smoothDamp, smoothstep, snapIndex, usesFrame, videoTime,
} from '../src/components/marketing/cinematic/sequence';
import { ENTER_FROM, ENTER_SPAN, MAX_STAGGER, enterProgress, viewProgress } from '../src/components/marketing/cinematic/live';
import { linkStrength, makeStars, streakLength, wrap } from '../src/components/marketing/cinematic/constellation';
import manifest from '../public/marketing/cinematic/seq/manifest.json';
import { approach, isWheelNotch, wheelPixels } from '../src/components/marketing/cinematic/smoothWheel';

const publicDir = path.join(__dirname, '..', 'public');
const finaleLast = (set: 'desktop' | 'mobile') => finaleLastFrame(manifest.clips.v2[set].count, manifest.clips.v2[set].fps, manifest.clips.v2[set].light);

describe('landing · el único video es el del cierre', () => {
  const last = () => finaleLast('desktop');

  it('el cierre termina antes de que v2 se aclare: nunca muestra el logo sobre fondo blanco', () => {
    for (const set of ['desktop', 'mobile'] as const) {
      const end = finaleLast(set);
      const { light, fps, count } = manifest.clips.v2[set];
      expect(light.length).toBeGreaterThan(0);
      for (const [first] of light) expect(end).toBeLessThan(first - fps * 0.5);
      // Pero llega al logo armado: más de la mitad del video.
      expect(end).toBeGreaterThan(count / 2);
    }
    expect(finaleLastFrame(100, 10, [])).toBe(99);
  });

  it('arma el logo al 78 % de su pista y lo sostiene', () => {
    expect(frameAt(0, FINALE_TIMING, last())).toBe(0);
    expect(frameAt(0.7, FINALE_TIMING, last())).toBeLessThan(last());
    expect(frameAt(0.78, FINALE_TIMING, last())).toBe(last());
    expect(frameAt(1, FINALE_TIMING, last())).toBe(last());
  });

  it('avanza y retrocede con el mismo P: es una función del scroll, no del tiempo', () => {
    const forward = [0.1, 0.3, 0.5, 0.7, 0.9].map(p => frameAt(p, FINALE_TIMING, last()));
    expect([...forward].sort((a, b) => a - b)).toEqual(forward);
    expect(frameAt(0.3, FINALE_TIMING, last())).toBe(frameAt(0.3, FINALE_TIMING, last()));
  });

  it('acota P fuera de rango', () => {
    expect(frameAt(-2, FINALE_TIMING, last())).toBe(0);
    expect(frameAt(3, FINALE_TIMING, last())).toBe(last());
    expect(videoTime(-1, FINALE_TIMING)).toBe(0);
    expect(videoTime(2, FINALE_TIMING)).toBe(1);
  });

  it('«Dale Aether.» y el botón llegan con el logo', () => {
    expect(finaleChoreography(0)).toEqual({ close: 0, closeShift: 24 });
    expect(finaleChoreography(0.68).close).toBe(0);
    expect(finaleChoreography(0.82)).toEqual({ close: 1, closeShift: 0 });
    expect(finaleChoreography(1).close).toBe(1);
  });

  it('suaviza en los bordes', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 1)).toBe(1);
  });
});

describe('landing v2 · carga progresiva', () => {
  it('pide cada fotograma una sola vez, empezando por el actual', () => {
    const order = loadOrder(40, 100, 1);
    expect(order[0]).toBe(40);
    expect(new Set(order).size).toBe(100);
    expect(order).toHaveLength(100);
  });

  it('prioriza la dirección del scroll', () => {
    expect(loadOrder(10, 30, 1).slice(0, 3)).toEqual([10, 11, 9]);
    expect(loadOrder(10, 30, -1).slice(0, 3)).toEqual([10, 9, 11]);
  });

  it('decodifica solo una ventana acotada alrededor del actual', () => {
    expect(decodeWindow(50, 259, 1)).toEqual([44, 60]);
    expect(decodeWindow(50, 259, -1)).toEqual([40, 56]);
    expect(decodeWindow(0, 259, 1)).toEqual([0, 10]);
    expect(decodeWindow(258, 259, 1)).toEqual([252, 258]);
  });

  it('arma las rutas de los fotogramas, versionadas por contenido', () => {
    expect(manifest.version).toMatch(/^[0-9a-f]{10}$/);
    expect(frameUrl(0, 'd', 0)).toBe(`/marketing/cinematic/seq/v1/d_001.webp?v=${manifest.version}`);
    expect(frameUrl(1, 'm', 76)).toBe(`/marketing/cinematic/seq/v2/m_077.webp?v=${manifest.version}`);
  });

  it('en modo liviano usa uno de cada tres fotogramas y siempre el último', () => {
    expect(snapIndex(4, 143, 1)).toBe(4);
    expect(snapIndex(4, 143, 3)).toBe(3);
    expect(snapIndex(143, 143, 3)).toBe(143);
    expect(usesFrame(6, 143, 3)).toBe(true);
    expect(usesFrame(7, 143, 3)).toBe(false);
    expect(usesFrame(143, 143, 3)).toBe(true);
    expect(usesFrame(7, 143, 1)).toBe(true);
  });
});

describe('landing v2 · fotogramas generados', () => {
  const sets = [['desktop', 'd'], ['mobile', 'm']] as const;

  it.each(['v1', 'v2'] as const)('el manifiesto de %s calza con los archivos y su presupuesto', clip => {
    for (const [name, prefix] of sets) {
      const entry = manifest.clips[clip][name];
      const folder = path.join(publicDir, 'marketing/cinematic/seq', clip);
      const files = readdirSync(folder).filter(file => file.startsWith(`${prefix}_`));
      expect(files).toHaveLength(entry.count);
      const bytes = files.reduce((total, file) => total + statSync(path.join(folder, file)).size, 0);
      expect(bytes).toBe(entry.bytes);
      expect(bytes).toBeLessThanOrEqual(entry.maxBytes);
    }
  });

  it('usa la resolución de la fuente con su presupuesto: 15 MB escritorio y 5 MB móvil por video', () => {
    for (const clip of [manifest.clips.v1, manifest.clips.v2]) {
      expect(clip.desktop).toMatchObject({ width: 1920, height: 1080, maxBytes: 15_000_000 });
      expect(clip.mobile).toMatchObject({ width: 608, height: 1080, maxBytes: 5_000_000 });
    }
  });

  it('recorre v2 completo, desde el video elegido', () => {
    expect(manifest.clips.v2.source).toBe('v2 (2).mp4');
    expect(manifest.clips.v2.usedSeconds).toBe(manifest.clips.v2.sourceSeconds);
  });

  it('marca como claro el final de v2 (el cierre se corta antes) y nada de v1 (lo usa entero el login)', () => {
    for (const set of ['desktop', 'mobile'] as const) {
      expect(manifest.clips.v1[set].light).toEqual([]);
      const last = manifest.clips.v2[set].count - 1;
      expect(manifest.clips.v2[set].light.some(([first, end]) => first <= last && last <= end)).toBe(true);
    }
  });

  it('tiene el primer fotograma de cada video para los pósteres (cierre y login) en ambos sets', () => {
    const file = (url: string) => path.join(publicDir, url.split('?')[0]);
    for (const clip of [0, 1] as const) {
      expect(existsSync(file(frameUrl(clip, 'd', 0)))).toBe(true);
      expect(existsSync(file(frameUrl(clip, 'm', 0)))).toBe(true);
    }
  });
});

describe('landing v2 · movimiento con el scroll', () => {
  const viewport = 900;

  it('un bloque bajo la ventana no ha entrado y uno que ya subió está completo', () => {
    expect(enterProgress(viewport, viewport)).toBe(0);
    expect(enterProgress(viewport * (ENTER_FROM - ENTER_SPAN), viewport)).toBe(1);
    expect(enterProgress(-400, viewport)).toBe(1);
    const middle = enterProgress(viewport * (ENTER_FROM - ENTER_SPAN / 2), viewport);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });

  it('los hermanos de una fila entran en cascada, con un tope', () => {
    const top = viewport * 0.8;
    expect(enterProgress(top, viewport, 1)).toBeLessThan(enterProgress(top, viewport, 0));
    expect(enterProgress(top, viewport, 20)).toBe(enterProgress(top, viewport, MAX_STAGGER));
  });

  it('mide el paso por la ventana de 0 a 1', () => {
    expect(viewProgress(viewport, 300, viewport)).toBe(0);
    expect(viewProgress(viewport / 2 - 150, 300, viewport)).toBe(0.5);
    expect(viewProgress(-300, 300, viewport)).toBe(1);
  });
});

describe('landing v2 · cielo interactivo', () => {
  it('genera siempre el mismo cielo con la misma semilla', () => {
    expect(makeStars(20, 800, 600)).toEqual(makeStars(20, 800, 600));
    expect(makeStars(20, 800, 600, 1)).not.toEqual(makeStars(20, 800, 600, 2));
    for (const star of makeStars(200, 800, 600)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(800);
      expect(star.depth).toBeGreaterThan(0);
    }
  });

  it('las estrellas que salen por arriba vuelven por abajo', () => {
    expect(wrap(-10, 100)).toBe(90);
    expect(wrap(250, 100)).toBe(50);
  });

  it('une con más fuerza lo que está más cerca y nada fuera del radio', () => {
    expect(linkStrength(0, 100)).toBe(1);
    expect(linkStrength(50, 100)).toBeGreaterThan(linkStrength(80, 100));
    expect(linkStrength(100, 100)).toBe(0);
  });

  it('estira las estrellas con la velocidad del scroll, con tope', () => {
    expect(streakLength(0, 0.3)).toBe(0);
    expect(streakLength(20, 0.3)).toBeGreaterThan(streakLength(20, 0.1));
    expect(streakLength(10_000, 0.3)).toBe(90);
    expect(streakLength(-10_000, 0.3)).toBe(-90);
  });
});

describe('landing v2 · fluidez del video con la rueda', () => {
  it('la posición continua redondeada coincide con frameAt', () => {
    const last = finaleLast('desktop');
    for (const p of [0, 0.013, 0.2, 0.549, 0.55, 0.7, 0.93, 1]) {
      expect(Math.min(last, Math.round(framePoint(p, FINALE_TIMING, last)))).toBe(frameAt(p, FINALE_TIMING, last));
    }
  });

  it('entre dos fotogramas mezcla el siguiente en la proporción que toca', () => {
    expect(frameBlend(12.25, 143)).toEqual({ lower: 12, upper: 13, mix: 0.25 });
    expect(frameBlend(12, 143)).toEqual({ lower: 12, upper: 13, mix: 0 });
    // En el último fotograma no hay siguiente: se sostiene limpio.
    expect(frameBlend(143, 143)).toEqual({ lower: 143, upper: 143, mix: 0 });
    expect(frameBlend(150, 143).mix).toBe(0);
  });

  it('el resorte llega al objetivo sin pasarse y sin depender de los cuadros por segundo', () => {
    const run = (fps: number) => {
      let value = 0;
      let velocity = 0;
      let max = 0;
      for (let t = 0; t < 1.5; t += 1 / fps) {
        [value, velocity] = smoothDamp(value, 1, velocity, SMOOTH_TIME, 1 / fps);
        max = Math.max(max, value);
      }
      return { value, max };
    };
    const at60 = run(60);
    const at144 = run(144);
    expect(at60.max).toBeLessThanOrEqual(1);
    expect(at60.value).toBeGreaterThan(0.999);
    expect(Math.abs(at60.value - at144.value)).toBeLessThan(0.001);
  });

  it('el resorte arranca suave: el primer cuadro avanza poco', () => {
    const [first] = smoothDamp(0, 1, 0, SMOOTH_TIME, 1 / 60);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.05);
    expect(smoothDamp(0.4, 1, 0, SMOOTH_TIME, 0)).toEqual([0.4, 0]);
  });
});

describe('landing v2 · rueda del mouse suave', () => {
  it('distingue el clic de la rueda de un trackpad', () => {
    expect(isWheelNotch(0, 100)).toBe(true);
    expect(isWheelNotch(0, -120)).toBe(true);
    expect(isWheelNotch(1, 3)).toBe(true);
    expect(isWheelNotch(0, 4.5)).toBe(false);
  });

  it('convierte líneas y páginas a px', () => {
    expect(wheelPixels(0, 100, 900)).toBe(100);
    expect(wheelPixels(1, 3, 900)).toBe(120);
    expect(wheelPixels(2, -1, 900)).toBe(-900);
  });

  it('el acercamiento es independiente de los cuadros por segundo', () => {
    let at60 = 0;
    let at120 = 0;
    for (let i = 0; i < 12; i += 1) at60 = approach(at60, 100, 1 / 60, 0.11);
    for (let i = 0; i < 24; i += 1) at120 = approach(at120, 100, 1 / 120, 0.11);
    expect(at60).toBeCloseTo(at120, 6);
    expect(approach(40, 100, 0, 0.11)).toBe(40);
  });
});
