import { CONSTELLATIONS, centerFocus, constellationY, projectStars, starRadius, type Point } from './constellations';

/**
 * Cielo interactivo de la landing (canvas detrás del contenido):
 * - un polvo de estrellas que se desplaza con el scroll a distintas
 *   profundidades, se estira en estelas cuando el scroll es rápido y se corre
 *   un poco hacia el puntero (o con el giro del teléfono, en Android);
 * - constelaciones reales (constellations.ts) repartidas a lo largo de la
 *   página: cada una se traza sola al pasar por el centro de la pantalla, se
 *   enciende con su nombre cuando el puntero o el dedo se le acerca, y un clic
 *   en una zona vacía enciende la más cercana (y, si el sistema permite
 *   animaciones, lanza una estrella fugaz).
 *
 * Es la única capa de estrellas de la página: un solo canvas, que solo dibuja
 * mientras algo cambia (puntero, scroll, trazos). Quieto no gasta batería.
 * Las funciones puras de arriba se prueban sin DOM.
 */

export interface Star {
  x: number;
  y: number;
  /** Cuánto se mueve por px de scroll (más cerca, más rápido). */
  depth: number;
  size: number;
  gold: boolean;
}

/** Generador pseudoaleatorio con semilla: el mismo cielo en cada visita. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStars(count: number, width: number, height: number, seed = 20240924): Star[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    // Muchas lejanas y pequeñas, pocas cercanas y grandes.
    depth: 0.03 + random() ** 2 * 0.35,
    size: 0.45 + random() ** 3 * 1.4,
    gold: random() < 0.16,
  }));
}

/** Módulo siempre positivo: las estrellas que salen por arriba vuelven por abajo. */
export function wrap(value: number, size: number): number {
  if (size <= 0) return 0;
  const result = value % size;
  return result < 0 ? result + size : result;
}

/** Intensidad según la distancia: 1 pegada, 0 desde `radius` (cae suave al final). */
export function linkStrength(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * (2 - t);
}

/** Largo de la estela (px) según la velocidad del scroll y la profundidad. */
export function streakLength(velocity: number, depth: number): number {
  const length = velocity * depth * 2.4;
  return Math.max(-90, Math.min(90, length));
}

/**
 * Trazo de una constelación: con `level` de 0 a 1 se dibujan sus líneas una
 * tras otra. Devuelve cuánto de cada línea se ve (0 a 1).
 */
export function traceAmounts(lines: number, level: number): number[] {
  const drawn = Math.max(0, Math.min(1, level)) * lines;
  return Array.from({ length: lines }, (_, index) => Math.max(0, Math.min(1, drawn - index)));
}

/** Clics sobre esto son del contenido, no del cielo. */
const CONTENT = 'a, button, input, select, textarea, label, summary, details, dialog, [role="tab"], p, h1, h2, h3, h4, li, figure, img, svg, canvas, [data-cinematic-track], header, nav, form';

const GLOW_RADIUS = 150;
/** Las constelaciones se mueven a esta fracción del scroll: están más lejos que el contenido. */
const PARALLAX = 0.45;
/** Tiempo en que una constelación se enciende y se apaga (s). */
const RISE = 0.28;
const FALL = 0.55;
const LIT_MS = 4500;
/** Brillo de una constelación que se traza sola: tenue, para no competir con el texto. */
const AUTO_GLOW = 0.32;
const FLASH_MS = 1100;
const SHOOT_MS = 850;

interface Flash { x: number; y: number; start: number }
interface Shooting { x: number; y: number; dx: number; dy: number; start: number }

/** Acerca un valor a su objetivo en el tiempo: sube en RISE y baja en FALL segundos. */
function ease(value: number, goal: number, dt: number): number {
  if (value === goal) return goal;
  const next = goal + (value - goal) * Math.exp(-dt / (goal > value ? RISE : FALL));
  return Math.abs(goal - next) < 0.003 ? goal : next;
}

interface Figure {
  points: Point[];
  radii: number[];
  /** Cuánto de su trazo se ve (0 a 1). */
  level: number;
  /** Cuánto brilla (0 a 1): tenue al trazarse sola, entera con el puntero, el dedo o un clic. */
  glow: number;
  litUntil: number;
  /** Centro y lado en pantalla del último cuadro (para el puntero y los clics). */
  cx: number;
  cy: number;
  size: number;
}

/**
 * `covered` dice si algo opaco tapa todo el canvas (el hero con su video):
 * entonces no se dibuja nada. `heroEnd` es el scroll en que el hero termina
 * de salir: ahí empieza el recorrido de las constelaciones.
 */
export function startConstellation(
  canvas: HTMLCanvasElement,
  reduced: MediaQueryList,
  covered: (scroll: number) => boolean,
  heroEnd: () => number,
): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;
  const family = getComputedStyle(canvas).fontFamily || 'sans-serif';

  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let frame = 0;
  let last = 0;
  let lastScroll = window.scrollY;
  // Lo que depende del diseño se lee en los eventos (con el diseño al día), no al dibujar.
  let scrollTop = lastScroll;
  let scrollEnd = 0;
  let start = 0;
  let velocity = 0;
  const pointer = { x: 0, y: 0, until: 0 };
  /** Corrimiento del cielo hacia el puntero o el giro del teléfono (-.5 a .5), con inercia. */
  const sway = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let flash: Flash | null = null;
  const shooting: Shooting[] = [];
  const margin = 160;
  let blank = false;
  let litLabel = '';
  const figures: Figure[] = CONSTELLATIONS.map(item => ({
    points: projectStars(item.stars),
    radii: item.stars.map(star => starRadius(star.mag)),
    level: 0,
    glow: 0,
    litUntil: 0,
    cx: 0,
    cy: -9999,
    size: 0,
  }));

  function measurePage() {
    scrollTop = window.scrollY;
    scrollEnd = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    start = heroEnd();
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = makeStars(Math.min(240, Math.round((width * height) / 7500)), width, height + margin * 2);
    measurePage();
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function screenY(star: Star, scroll: number) {
    return wrap(star.y - scroll * star.depth, height + margin * 2) - margin;
  }

  /** Lado de una constelación en pantalla: grande en el teléfono, acotado en escritorio. */
  function figureSize() {
    return width < 700 ? width * 0.56 : Math.min(320, Math.max(220, width * 0.2));
  }

  function drawFigure(index: number, figure: Figure) {
    const item = CONSTELLATIONS[index];
    const { level, glow, cx, cy, size } = figure;
    const at = figure.points.map(point => ({ x: cx + point.x * size, y: cy + point.y * size }));

    // Silueta tenue siempre presente y, encima, el trazo que se dibuja al encenderse.
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgb(244 241 234 / ${(0.06 + 0.04 * level).toFixed(3)})`;
    ctx.beginPath();
    for (const [a, b] of item.lines) {
      ctx.moveTo(at[a].x, at[a].y);
      ctx.lineTo(at[b].x, at[b].y);
    }
    ctx.stroke();
    if (level > 0.001) {
      const amounts = traceAmounts(item.lines.length, level);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgb(219 192 118 / ${(0.1 + 0.62 * glow).toFixed(3)})`;
      ctx.beginPath();
      item.lines.forEach(([a, b], line) => {
        const amount = amounts[line];
        if (amount <= 0) return;
        ctx.moveTo(at[a].x, at[a].y);
        ctx.lineTo(at[a].x + (at[b].x - at[a].x) * amount, at[a].y + (at[b].y - at[a].y) * amount);
      });
      ctx.stroke();
    }

    // Estrellas: su tamaño sale de la magnitud real; las brillantes llevan halo al encenderse.
    at.forEach((point, star) => {
      const radius = figure.radii[star] * (1 + 0.3 * glow);
      if (glow > 0.05 && figure.radii[star] >= 2) {
        const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 6);
        halo.addColorStop(0, `rgb(255 242 200 / ${(0.35 * glow).toFixed(3)})`);
        halo.addColorStop(1, 'rgb(255 242 200 / 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(point.x - radius * 6, point.y - radius * 6, radius * 12, radius * 12);
      }
      ctx.fillStyle = `rgb(250 246 236 / ${(0.45 + 0.55 * glow).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Nombre: apenas insinuado al trazarse sola, entero al encenderla.
    const label = Math.min(Math.max(0, Math.min(1, (level - 0.55) / 0.4)), Math.max(0, Math.min(1, (glow - 0.2) / 0.7)));
    if (label > 0) {
      const top = Math.max(...at.map(point => point.y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.letterSpacing = '3px';
      ctx.font = `600 11px ${family}`;
      ctx.fillStyle = `rgb(219 192 118 / ${(0.9 * label).toFixed(3)})`;
      ctx.fillText(item.name.toUpperCase(), cx, top + 20);
      if (item.note) {
        ctx.letterSpacing = '1px';
        ctx.font = `400 11px ${family}`;
        ctx.fillStyle = `rgb(244 241 234 / ${(0.55 * label).toFixed(3)})`;
        ctx.fillText(item.note, cx, top + 38);
      }
      ctx.letterSpacing = '0px';
    }
  }

  function draw(now: number) {
    frame = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const scroll = scrollTop;
    velocity += (scroll - lastScroll - velocity) * 0.3;
    lastScroll = scroll;
    if (Math.abs(velocity) < 0.08) velocity = 0;

    // Bajo el hero no se ve: se limpia una vez y no se vuelve a tocar hasta salir.
    if (covered(scroll)) {
      if (!blank) ctx.clearRect(0, 0, width, height);
      blank = true;
      last = 0;
      return;
    }
    blank = false;
    ctx.clearRect(0, 0, width, height);
    const easing = reduced.matches ? 1 : 0.08;
    sway.x += (sway.targetX - sway.x) * easing;
    sway.y += (sway.targetY - sway.y) * easing;
    const swaying = Math.abs(sway.targetX - sway.x) > 0.001 || Math.abs(sway.targetY - sway.y) > 0.001;
    if (!swaying) {
      sway.x = sway.targetX;
      sway.y = sway.targetY;
    }
    const pointing = now < pointer.until;

    // Polvo de estrellas: se aviva un poco cerca del puntero, sin líneas.
    for (const star of stars) {
      const x = star.x + sway.x * star.depth * 140;
      const y = screenY(star, scroll) + sway.y * star.depth * 140;
      if (y < -40 || y > height + 40) continue;
      const glow = pointing ? linkStrength(Math.hypot(x - pointer.x, y - pointer.y), GLOW_RADIUS) : 0;
      const alpha = 0.26 + 0.4 * glow + star.size * 0.1;
      const color = star.gold ? `rgb(234 216 165 / ${alpha.toFixed(3)})` : `rgb(244 241 234 / ${alpha.toFixed(3)})`;
      const streak = streakLength(velocity, star.depth);
      if (Math.abs(streak) > 1.5) {
        ctx.strokeStyle = color;
        ctx.lineWidth = star.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + streak);
        ctx.stroke();
      } else {
        // Un rectángulo es mucho más barato que un arco.
        ctx.fillStyle = color;
        const size = star.size * (1 + glow * 0.6);
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }

    // Constelaciones: posición, cuánto deben encenderse y trazo.
    const size = figureSize();
    const inset = Math.max(size / 2 + 16, width * 0.16);
    let animating = false;
    let brightest = '';
    figures.forEach((figure, index) => {
      const item = CONSTELLATIONS[index];
      figure.size = size;
      figure.cx = (item.side === 'left' ? inset : width - inset) + sway.x * 20;
      figure.cy = constellationY(item.at, scroll, start, scrollEnd, height, PARALLAX) + sway.y * 20;
      const onScreen = figure.cy > -size && figure.cy < height + size;
      const near = pointing ? Math.min(1, 1.4 * linkStrength(Math.hypot(pointer.x - figure.cx, pointer.y - figure.cy), size * 0.85)) : 0;
      // Al pasar por el centro se traza sola, tenue; el puntero, el dedo o un clic la encienden.
      const focus = onScreen ? centerFocus(figure.cy, height) : 0;
      const touched = onScreen ? Math.max(near, now < figure.litUntil ? 1 : 0) : 0;
      figure.level = ease(figure.level, Math.max(focus, touched), dt);
      figure.glow = ease(figure.glow, Math.max(focus * AUTO_GLOW, touched), dt);
      if (figure.level !== Math.max(focus, touched) || figure.glow !== Math.max(focus * AUTO_GLOW, touched) || figure.litUntil > now) animating = true;
      if (onScreen) drawFigure(index, figure);
      if (figure.glow > 0.95 && !brightest) brightest = item.name;
    });
    // Constelación encendida (la leen las pruebas de la landing).
    if (brightest !== litLabel) {
      litLabel = brightest;
      if (brightest) canvas.dataset.lit = brightest;
      else delete canvas.dataset.lit;
    }

    // Destello de un clic: un halo breve donde se hizo clic.
    if (flash) {
      const age = now - flash.start;
      if (age > FLASH_MS) {
        flash = null;
      } else {
        const fade = 1 - age / FLASH_MS;
        const halo = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, 60);
        halo.addColorStop(0, `rgb(255 242 200 / ${(0.5 * fade).toFixed(3)})`);
        halo.addColorStop(1, 'rgb(255 242 200 / 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(flash.x - 60, flash.y - 60, 120, 120);
      }
    }

    // Estrellas fugaces (solo si el sistema permite animaciones).
    for (let index = shooting.length - 1; index >= 0; index -= 1) {
      const shot = shooting[index];
      const t = (now - shot.start) / SHOOT_MS;
      if (t >= 1) {
        shooting.splice(index, 1);
        continue;
      }
      const eased = 1 - (1 - t) * (1 - t);
      const hx = shot.x + shot.dx * eased;
      const hy = shot.y + shot.dy * eased;
      const tail = 0.22;
      const tx = shot.x + shot.dx * Math.max(0, eased - tail);
      const ty = shot.y + shot.dy * Math.max(0, eased - tail);
      const gradient = ctx.createLinearGradient(tx, ty, hx, hy);
      gradient.addColorStop(0, 'rgb(219 192 118 / 0)');
      gradient.addColorStop(1, `rgb(255 244 214 / ${(1 - t).toFixed(3)})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }

    if (pointing || swaying || animating || velocity !== 0 || flash || shooting.length) schedule();
    else last = 0;
  }

  const onPointer = (x: number, y: number) => {
    pointer.x = x;
    pointer.y = y;
    pointer.until = performance.now() + 1600;
    schedule();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      sway.targetX = event.clientX / width - 0.5;
      sway.targetY = event.clientY / height - 0.5;
    }
    onPointer(event.clientX, event.clientY);
  };
  // Giro del teléfono (Android; iOS pide permiso y ahí no se usa).
  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.gamma === null || event.beta === null) return;
    sway.targetX = Math.max(-1, Math.min(1, event.gamma / 40)) * 0.5;
    sway.targetY = Math.max(-1, Math.min(1, (event.beta - 50) / 40)) * 0.5;
    schedule();
  };
  const gyroscope = window.matchMedia('(hover: none)').matches && typeof DeviceOrientationEvent !== 'undefined' && !('requestPermission' in DeviceOrientationEvent);
  const onTouch = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) onPointer(touch.clientX, touch.clientY);
  };
  // Un clic en una zona vacía enciende la constelación visible más cercana.
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(CONTENT) || (window.getSelection()?.toString() ?? '') !== '') return;
    const now = performance.now();
    let nearest: Figure | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const figure of figures) {
      if (figure.cy < -figure.size / 2 || figure.cy > height + figure.size / 2) continue;
      const distance = Math.hypot(event.clientX - figure.cx, event.clientY - figure.cy);
      if (distance < best) {
        best = distance;
        nearest = figure;
      }
    }
    if (nearest) nearest.litUntil = now + LIT_MS;
    flash = { x: event.clientX, y: event.clientY, start: now };
    if (!reduced.matches) {
      const angle = Math.PI * (0.62 + Math.random() * 0.22);
      const length = 260 + Math.random() * 220;
      shooting.push({ x: event.clientX, y: event.clientY, dx: Math.cos(angle) * length, dy: Math.sin(angle) * length, start: now });
    }
    schedule();
  };
  const onResize = () => {
    resize();
    schedule();
  };
  const onScroll = () => {
    scrollTop = window.scrollY;
    // El alto de la página cambia mientras se pintan las secciones (content-visibility).
    scrollEnd = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    schedule();
  };

  resize();
  schedule();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('touchstart', onTouch, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  document.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', schedule);
  if (gyroscope) window.addEventListener('deviceorientation', onOrientation, { passive: true });

  return () => {
    window.removeEventListener('deviceorientation', onOrientation);
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('touchstart', onTouch);
    document.removeEventListener('touchmove', onTouch);
    document.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', schedule);
    delete canvas.dataset.lit;
  };
}
