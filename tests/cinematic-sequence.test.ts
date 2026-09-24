import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  V1_END, chapterState, choreography, decodeWindow, exitShade, frameAt, frameUrl, fromGlobal, globalIndex, hudOpacity, loadOrder, smoothstep, v2Time,
} from '../src/components/marketing/cinematic/sequence';
import { ENTER_FROM, ENTER_SPAN, MAX_STAGGER, enterProgress, viewProgress } from '../src/components/marketing/cinematic/live';
import { linkStrength, makeStars, streakLength, wrap } from '../src/components/marketing/cinematic/constellation';
import { outcomes } from '../src/components/marketing/content';
import { views } from '../src/components/marketing/catalog';
import manifest from '../public/marketing/cinematic/seq/manifest.json';

const publicDir = path.join(__dirname, '..', 'public');
const counts: [number, number] = [manifest.clips.v1.desktop.count, manifest.clips.v2.desktop.count];

describe('landing v2 · mapeo del progreso a los videos', () => {
  it('recorre v1 entre P 0 y .55 y v2 hasta el final', () => {
    expect(frameAt(0, counts)).toEqual({ clip: 0, index: 0 });
    expect(frameAt(V1_END - 0.0001, counts)).toEqual({ clip: 0, index: counts[0] - 1 });
    expect(frameAt(V1_END, counts)).toEqual({ clip: 1, index: 0 });
    expect(frameAt(1, counts)).toEqual({ clip: 1, index: counts[1] - 1 });
  });

  it('avanza y retrocede con el mismo P: es una función del scroll, no del tiempo', () => {
    const forward = [0.1, 0.3, 0.5, 0.7, 0.9].map(p => globalIndex(frameAt(p, counts), counts));
    expect([...forward].sort((a, b) => a - b)).toEqual(forward);
    expect(frameAt(0.3, counts)).toEqual(frameAt(0.3, counts));
  });

  it('acota P fuera de rango', () => {
    expect(frameAt(-2, counts)).toEqual(frameAt(0, counts));
    expect(frameAt(3, counts)).toEqual(frameAt(1, counts));
  });

  const inV2 = (stretch: number) => V1_END + stretch * (1 - V1_END);

  it('v2 pasa más lento por la galaxia: su primer 25 % ocupa el 35 % del tramo', () => {
    expect(v2Time(0)).toBe(0);
    expect(v2Time(0.35)).toBeCloseTo(0.25, 10);
    expect(frameAt(inV2(0.35), counts)).toEqual({ clip: 1, index: Math.round(0.25 * (counts[1] - 1)) });
    const times = [0, 0.1, 0.35, 0.5, 0.7, 0.9, 1].map(v2Time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('llega al último fotograma de v2 antes del final de la pista y se queda ahí', () => {
    const last = { clip: 1, index: counts[1] - 1 };
    expect(v2Time(0.9)).toBe(1);
    expect(frameAt(inV2(0.9), counts)).toEqual(last);
    expect(frameAt(0.97, counts)).toEqual(last);
    expect(frameAt(1, counts)).toEqual(last);
    expect(frameAt(inV2(0.85), counts).index).toBeLessThan(counts[1] - 1);
  });

  it('convierte entre numeración continua y (video, fotograma)', () => {
    for (const global of [0, counts[0] - 1, counts[0], counts[0] + counts[1] - 1]) {
      expect(globalIndex(fromGlobal(global, counts), counts)).toBe(global);
    }
  });
});

describe('landing v2 · coreografía', () => {
  it('parte con el titular a la vista y todo lo demás apagado', () => {
    expect(choreography(0)).toEqual({ intro: 1, introShift: -0, inside: 0, insideShift: 28, line: 0, lineOpacity: 1 });
  });

  it('el titular sube 40 px y se desvanece entre P 0 y .22', () => {
    const gone = choreography(0.22);
    expect(gone.intro).toBe(0);
    expect(gone.introShift).toBe(-40);
    expect(choreography(0.11).intro).toBeGreaterThan(0);
  });

  it('«Ahora, estás dentro.» aparece entre .45 y .56, se sostiene y se va entre .64 y .7', () => {
    expect(choreography(0.45).inside).toBe(0);
    expect(choreography(0.56).inside).toBe(1);
    expect(choreography(0.62).inside).toBe(1);
    expect(choreography(0.64).inside).toBe(1);
    expect(choreography(0.7).inside).toBe(0);
    expect(choreography(0.9).inside).toBe(0);
  });

  it('el titular se va sobre la galaxia, antes de que se arme el logo', () => {
    const galaxyEnd = Math.round(0.25 * (counts[1] - 1));
    expect(frameAt(0.7, counts)).toMatchObject({ clip: 1 });
    expect(frameAt(0.7, counts).index).toBeLessThanOrEqual(galaxyEnd);
  });

  it('termina con el último fotograma a la vista: sin capa oscura mientras la pista está fija', () => {
    expect(choreography(1).line).toBe(1);
    expect(choreography(0.96).lineOpacity).toBe(1);
    expect(choreography(1).lineOpacity).toBe(0);
    expect(exitShade(0)).toBe(0);
  });

  it('al salir, el degradado sube desde abajo y a media salida cubre la unión', () => {
    expect(exitShade(0.1)).toBeGreaterThan(0);
    expect(exitShade(0.25)).toBeLessThan(1);
    expect(exitShade(0.5)).toBe(1);
    expect(exitShade(1)).toBe(1);
  });

  it('la guía de capítulos enciende solo el tramo actual y llena su barra', () => {
    expect(chapterState(0.1, 0, 0.2)).toEqual({ fill: 0.5, on: 1 });
    expect(chapterState(0.1, 0.2, 0.7).on).toBe(0);
    expect(chapterState(0.85, 0.7, 1.02).on).toBe(1);
    expect(chapterState(0.85, 0, 0.2)).toEqual({ fill: 1, on: 0 });
    expect(hudOpacity(0)).toEqual({ guide: 1, cue: 1 });
    expect(hudOpacity(1).guide).toBe(0);
    expect(hudOpacity(0.1).cue).toBe(0);
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

  it('arma las rutas de los fotogramas', () => {
    expect(frameUrl(0, 'd', 0)).toBe('/marketing/cinematic/seq/v1/d_001.webp');
    expect(frameUrl(1, 'm', 76)).toBe('/marketing/cinematic/seq/v2/m_077.webp');
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

  it('marca como claro el final de v2 (la cabecera toma fondo) y nada de v1', () => {
    for (const set of ['desktop', 'mobile'] as const) {
      expect(manifest.clips.v1[set].light).toEqual([]);
      const last = manifest.clips.v2[set].count - 1;
      expect(manifest.clips.v2[set].light.some(([first, end]) => first <= last && last <= end)).toBe(true);
    }
  });

  it('tiene el primer fotograma de v1 para el póster (LCP) en ambos sets', () => {
    expect(existsSync(path.join(publicDir, frameUrl(0, 'd', 0)))).toBe(true);
    expect(existsSync(path.join(publicDir, frameUrl(0, 'm', 0)))).toBe(true);
  });

  it('funde la unión v1→v2 cuando los cuadros no calzan', () => {
    const { ssim, crossfadeMs } = manifest.boundary;
    expect(crossfadeMs).toBe(ssim !== null && ssim >= 0.9 ? 0 : 300);
  });
});

describe('landing v2 · contenido restaurado', () => {
  it('cada tarjeta de resultados abre la vista que nombra', () => {
    expect(outcomes.map(item => views[item.view]?.label)).toEqual(['Ventas', 'Inventario', 'Finanzas']);
  });
});

describe('landing v2 · movimiento con el scroll fuera del hero', () => {
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
