import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  SMOOTH_TIME, V1_END, chapterState, choreography, decodeWindow, exitShade, frameAt, frameBlend, framePoint, frameUrl, fromGlobal, globalIndex, hudOpacity, loadOrder, smoothDamp, smoothstep, snapIndex, usesFrame, v2Time,
} from '../src/components/marketing/cinematic/sequence';
import { ENTER_FROM, ENTER_SPAN, MAX_STAGGER, enterProgress, viewProgress } from '../src/components/marketing/cinematic/live';
import { linkStrength, makeStars, streakLength, traceAmounts, wrap } from '../src/components/marketing/cinematic/constellation';
import { weightedScore } from '../src/components/marketing/cinematic/EventMock';
import { CONSTELLATIONS, centerFocus, constellationY, projectStars, starRadius } from '../src/components/marketing/cinematic/constellations';
import { outcomes } from '../src/components/marketing/content';
import { views } from '../src/components/marketing/catalog';
import manifest from '../public/marketing/cinematic/seq/manifest.json';
import { approach, isWheelNotch, wheelPixels } from '../src/components/marketing/cinematic/smoothWheel';

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

  it('marca como claro el final de v2 (la cabecera toma fondo) y nada de v1', () => {
    for (const set of ['desktop', 'mobile'] as const) {
      expect(manifest.clips.v1[set].light).toEqual([]);
      const last = manifest.clips.v2[set].count - 1;
      expect(manifest.clips.v2[set].light.some(([first, end]) => first <= last && last <= end)).toBe(true);
    }
  });

  it('tiene el primer fotograma de v1 para el póster (LCP) en ambos sets', () => {
    const file = (url: string) => path.join(publicDir, url.split('?')[0]);
    expect(existsSync(file(frameUrl(0, 'd', 0)))).toBe(true);
    expect(existsSync(file(frameUrl(0, 'm', 0)))).toBe(true);
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

describe('landing v2 · fluidez del video con la rueda', () => {
  it('la posición continua redondeada coincide con frameAt', () => {
    for (const p of [0, 0.013, 0.2, 0.549, 0.55, 0.7, 0.93, 1]) {
      const point = framePoint(p, counts);
      expect({ clip: point.clip, index: Math.min(counts[point.clip] - 1, Math.round(point.index)) }).toEqual(frameAt(p, counts));
    }
  });

  it('entre dos fotogramas mezcla el siguiente en la proporción que toca', () => {
    expect(frameBlend({ clip: 0, index: 12.25 }, 143)).toEqual({ lower: 12, upper: 13, mix: 0.25 });
    expect(frameBlend({ clip: 0, index: 12 }, 143)).toEqual({ lower: 12, upper: 13, mix: 0 });
    // En el último fotograma no hay siguiente: se sostiene limpio.
    expect(frameBlend({ clip: 1, index: 143 }, 143)).toEqual({ lower: 143, upper: 143, mix: 0 });
    expect(frameBlend({ clip: 1, index: 150 }, 143).mix).toBe(0);
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

describe('landing v2 · constelaciones reales', () => {
  it('cada línea une dos estrellas que existen', () => {
    for (const item of CONSTELLATIONS) {
      for (const [a, b] of item.lines) {
        expect(item.stars[a]).toBeDefined();
        expect(item.stars[b]).toBeDefined();
        expect(a).not.toBe(b);
      }
    }
  });

  it('se reparten a lo largo de toda la página, alternando de lado', () => {
    const ats = CONSTELLATIONS.map(item => item.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(ats[0]).toBeLessThan(0.1);
    expect(ats[ats.length - 1]).toBeGreaterThan(0.9);
    CONSTELLATIONS.forEach((item, index) => {
      if (index > 0) expect(item.side).not.toBe(CONSTELLATIONS[index - 1].side);
    });
    expect(new Set(CONSTELLATIONS.map(item => item.name)).size).toBe(CONSTELLATIONS.length);
  });

  it('proyecta con el este a la izquierda y el norte arriba, en un cuadro de lado 1', () => {
    const cross = CONSTELLATIONS.find(item => item.name === 'Cruz del Sur');
    if (!cross) throw new Error('falta la Cruz del Sur');
    const [acrux, mimosa, gacrux] = projectStars(cross.stars);
    // Gacrux (más al norte) queda arriba de Acrux; Mimosa (mayor ascensión recta, al este) a la izquierda.
    expect(gacrux.y).toBeLessThan(acrux.y);
    expect(mimosa.x).toBeLessThan(acrux.x);
    for (const item of CONSTELLATIONS) {
      const points = projectStars(item.stars);
      const spanX = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
      const spanY = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
      expect(Math.max(spanX, spanY)).toBeCloseTo(1, 6);
      for (const point of points) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('las estrellas más brillantes se dibujan más grandes', () => {
    expect(starRadius(-1.46)).toBeGreaterThan(starRadius(1));
    expect(starRadius(1)).toBeGreaterThan(starRadius(3.5));
    expect(starRadius(9)).toBe(0.7);
  });

  it('cada una pasa por el centro de la pantalla en su punto de la página', () => {
    expect(constellationY(0.5, 5000, 1000, 9000, 800, 0.45)).toBe(400);
    expect(constellationY(0.5, 4000, 1000, 9000, 800, 0.45)).toBeGreaterThan(400);
    expect(centerFocus(400, 800)).toBe(1);
    expect(centerFocus(20, 800)).toBe(0);
    expect(centerFocus(200, 800)).toBeGreaterThan(0);
    expect(centerFocus(200, 800)).toBeLessThan(1);
  });

  it('el trazo dibuja las líneas una tras otra', () => {
    expect(traceAmounts(4, 0)).toEqual([0, 0, 0, 0]);
    expect(traceAmounts(4, 0.5)).toEqual([1, 1, 0, 0]);
    expect(traceAmounts(4, 0.625)).toEqual([1, 1, 0.5, 0]);
    expect(traceAmounts(4, 1)).toEqual([1, 1, 1, 1]);
  });
});

describe('landing v2 · pantallas de certámenes (datos de ejemplo)', () => {
  it('el promedio ponderado usa ponderaciones que suman 100 %', () => {
    expect(weightedScore([10, 10, 10])).toBeCloseTo(10, 10);
    expect(weightedScore([9.4, 9.1, 9.6])).toBeCloseTo(9.37, 10);
  });
});
