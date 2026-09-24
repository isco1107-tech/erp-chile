/**
 * Cielo interactivo de /landing-v2 (canvas detrás del contenido):
 * - las estrellas se desplazan con el scroll a distintas profundidades, se
 *   estiran en estelas cuando el scroll es rápido y se corren un poco hacia
 *   el puntero (o con el giro del teléfono, en Android);
 * - las cercanas al cursor (o al dedo, en el teléfono) se unen a él y entre
 *   sí, como una constelación que lo sigue;
 * - un clic o toque en una zona vacía enciende la constelación de ese punto
 *   y, si el sistema permite animaciones, lanza una estrella fugaz.
 *
 * Es la única capa de estrellas de la página: un solo canvas, que solo dibuja
 * mientras algo cambia (puntero, scroll, destellos). Quieto no gasta batería. Las funciones puras de arriba se prueban sin DOM.
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

/** Intensidad de una línea según la distancia: 1 pegada, 0 desde `radius` (cae suave al final). */
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

/** Clics sobre esto son del contenido, no del cielo. */
const CONTENT = 'a, button, input, select, textarea, label, summary, details, dialog, [role="tab"], p, h1, h2, h3, h4, li, figure, img, svg, canvas, [data-cinematic-track], header, nav, form';

const LINK_RADIUS = 190;
const PAIR_RADIUS = 125;
const FLASH_RADIUS = 210;
/** Estrellas que une un destello: las más cercanas al punto. */
const FLASH_STARS = 8;
const FLASH_MS = 1400;
const SHOOT_MS = 850;

interface Flash { x: number; y: number; scroll: number; start: number }
interface Shooting { x: number; y: number; dx: number; dy: number; start: number }

/**
 * `covered` dice si algo opaco tapa todo el canvas (el hero con su video):
 * entonces no se dibuja nada.
 */
export function startConstellation(canvas: HTMLCanvasElement, reduced: MediaQueryList, covered: (scroll: number) => boolean): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;

  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let frame = 0;
  let lastScroll = window.scrollY;
  // La posición del scroll se lee en el evento (con el diseño al día), no al dibujar.
  let scrollTop = lastScroll;
  let velocity = 0;
  const pointer = { x: 0, y: 0, until: 0 };
  /** Corrimiento del cielo hacia el puntero o el giro del teléfono (-.5 a .5), con inercia. */
  const sway = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let flash: Flash | null = null;
  const shooting: Shooting[] = [];
  const margin = 160;
  let blank = false;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = makeStars(Math.min(280, Math.round((width * height) / 6500)), width, height + margin * 2);
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function screenY(star: Star, scroll: number) {
    return wrap(star.y - scroll * star.depth, height + margin * 2) - margin;
  }

  function draw(now: number) {
    frame = 0;
    const scroll = scrollTop;
    velocity += (scroll - lastScroll - velocity) * 0.3;
    lastScroll = scroll;
    if (Math.abs(velocity) < 0.08) velocity = 0;

    // Bajo el hero no se ve: se limpia una vez y no se vuelve a tocar hasta salir.
    if (covered(scroll)) {
      if (!blank) ctx.clearRect(0, 0, width, height);
      blank = true;
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
    const near: { x: number; y: number; strength: number }[] = [];

    for (const star of stars) {
      const x = star.x + sway.x * star.depth * 140;
      const y = screenY(star, scroll) + sway.y * star.depth * 140;
      if (y < -40 || y > height + 40) continue;
      let glow = 0;
      if (pointing) {
        glow = linkStrength(Math.hypot(x - pointer.x, y - pointer.y), LINK_RADIUS);
        if (glow > 0) near.push({ x, y, strength: glow });
      }
      const alpha = 0.32 + 0.5 * glow + star.size * 0.12;
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
      } else if (star.size < 0.9 && glow === 0) {
        // Las lejanas son un punto: un rectángulo es mucho más barato que un arco.
        ctx.fillStyle = color;
        ctx.fillRect(x - star.size / 2, y - star.size / 2, star.size, star.size);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, star.size * (1 + glow * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Constelación que sigue al puntero: cada estrella cercana al cursor y a sus vecinas.
    if (near.length) {
      ctx.lineWidth = 0.8;
      for (let a = 0; a < near.length; a += 1) {
        const star = near[a];
        ctx.strokeStyle = `rgb(219 192 118 / ${(star.strength * 0.7).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
        for (let b = a + 1; b < near.length; b += 1) {
          const other = near[b];
          const pair = linkStrength(Math.hypot(star.x - other.x, star.y - other.y), PAIR_RADIUS) * Math.min(star.strength, other.strength);
          if (pair <= 0.01) continue;
          ctx.strokeStyle = `rgb(244 241 234 / ${(pair * 0.45).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(star.x, star.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    }

    // Destello de un clic: la constelación alrededor del punto se enciende y se apaga.
    if (flash) {
      const age = now - flash.start;
      if (age > FLASH_MS) {
        flash = null;
      } else {
        const fade = reduced.matches ? 1 : 1 - age / FLASH_MS;
        const fx = flash.x;
        const fy = flash.y - (scroll - flash.scroll) * 0.2;
        const lit = stars
          .map(star => ({ x: star.x + sway.x * star.depth * 140, y: screenY(star, scroll) + sway.y * star.depth * 140 }))
          .map(star => ({ ...star, distance: Math.hypot(star.x - fx, star.y - fy) }))
          .filter(star => star.distance < FLASH_RADIUS)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, FLASH_STARS)
          .sort((a, b) => Math.atan2(a.y - fy, a.x - fx) - Math.atan2(b.y - fy, b.x - fx));
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgb(219 192 118 / ${(0.6 * fade).toFixed(3)})`;
        ctx.beginPath();
        lit.forEach((star, index) => (index === 0 ? ctx.moveTo(star.x, star.y) : ctx.lineTo(star.x, star.y)));
        if (lit.length > 2) ctx.closePath();
        ctx.stroke();
        for (const star of lit) {
          ctx.strokeStyle = `rgb(244 241 234 / ${(0.25 * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(star.x, star.y);
          ctx.lineTo(fx, fy);
          ctx.stroke();
        }
        const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, 60);
        halo.addColorStop(0, `rgb(255 242 200 / ${(0.55 * fade).toFixed(3)})`);
        halo.addColorStop(1, 'rgb(255 242 200 / 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(fx - 60, fy - 60, 120, 120);
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

    if (pointing || swaying || velocity !== 0 || flash || shooting.length) schedule();
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
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(CONTENT) || (window.getSelection()?.toString() ?? '') !== '') return;
    const now = performance.now();
    flash = { x: event.clientX, y: event.clientY, scroll: scrollTop, start: now };
    if (!reduced.matches) {
      const angle = Math.PI * (0.62 + Math.random() * 0.22);
      const length = 260 + Math.random() * 220;
      shooting.push({ x: event.clientX, y: event.clientY, dx: Math.cos(angle) * length, dy: Math.sin(angle) * length, start: now });
    }
    schedule();
  };
  const onResize = () => {
    resize();
    scrollTop = window.scrollY;
    schedule();
  };
  const onScroll = () => {
    scrollTop = window.scrollY;
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
  };
}
