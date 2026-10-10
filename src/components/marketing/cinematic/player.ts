import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';
import {
  IDLE_AHEAD, SMOOTH_TIME, chapterState, choreography, clamp01, decodeWindow, exitShade, frameBlend, framePoint, frameUrl,
  hudOpacity, loadOrder, smoothDamp, snapIndex, usesFrame, type Choreography, type Clip, type Timing,
} from './sequence';

/**
 * Motor de las escenas con video de la landing (el hero y el cierre): dibuja
 * en un canvas el fotograma que toca según el scroll y avisa el progreso para
 * que cada escena escriba sus textos directo al DOM. Nada de esto pasa por el
 * estado de React: todo vive en variables del cierre y se escribe dentro de
 * requestAnimationFrame.
 *
 * Memoria: los fotogramas se guardan comprimidos y solo se decodifican los de
 * una ventana alrededor del actual. Decodificar el video completo a 1920×1080
 * costaría más de 1 GB.
 */

export interface SceneElements {
  /** La pista larga (su alto es el recorrido del scroll). */
  track: HTMLElement;
  /** El escenario fijo dentro de la pista. */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Degradado de salida (opcional): sube desde abajo cuando el escenario ya se va. */
  fade?: HTMLElement | null;
}

export interface HeroElements {
  intro: HTMLElement;
  inside: HTMLElement;
  line: HTMLElement;
  /** Guía de capítulos (sus `li` llevan data-from y data-to) y «Desliza para entrar». */
  hud: HTMLElement;
}

export type FrameSetName = 'desktop' | 'mobile';

type Drawable = ImageBitmap | HTMLImageElement;

const MAX_FETCHES = 6;
const MAX_DECODES = 3;

function release(image: Drawable) {
  if ('close' in image) image.close();
}

function sizeOf(image: Drawable): [number, number] {
  return 'naturalWidth' in image ? [image.naturalWidth, image.naturalHeight] : [image.width, image.height];
}

async function decodeBlob(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Algunos navegadores no decodifican WebP con createImageBitmap: se usa <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Guía de capítulos: los valores se calculan aquí y se escriben ya resueltos.
 * Encadenar variables CSS heredadas hacía que Chrome los recalculara tarde.
 */
function writeGuide(hud: HTMLElement, progress: number) {
  const { guide, cue } = hudOpacity(progress);
  hud.style.opacity = guide.toFixed(3);
  const hint = hud.lastElementChild as HTMLElement | null;
  if (hint) hint.style.opacity = cue.toFixed(3);
  for (const item of hud.querySelectorAll<HTMLElement>('li[data-from]')) {
    const { fill, on } = chapterState(progress, Number(item.dataset.from), Number(item.dataset.to));
    item.style.opacity = (0.34 + 0.66 * on).toFixed(3);
    item.style.transform = `translate3d(${((1 - on) * 8).toFixed(1)}px, 0, 0)`;
    const bar = item.lastElementChild?.firstElementChild as HTMLElement | null | undefined;
    if (bar) bar.style.transform = `scaleX(${fill.toFixed(4)})`;
  }
}

/** Escribe la coreografía del hero en el DOM. Se usa también para dejar el estado inicial. */
export function writeChoreography(elements: HeroElements, state: Choreography) {
  const { intro, inside, line } = elements;
  intro.style.opacity = state.intro.toFixed(3);
  intro.style.transform = `translate3d(0, ${state.introShift.toFixed(1)}px, 0)`;
  inside.style.opacity = state.inside.toFixed(3);
  inside.style.transform = `translate3d(0, ${state.insideShift.toFixed(1)}px, 0)`;
  line.style.transform = `scaleX(${state.line.toFixed(4)})`;
  writeGuide(elements.hud, state.line);
  line.parentElement?.style.setProperty('opacity', state.lineOpacity.toFixed(3));
  // Lo que no se ve tampoco se enfoca ni se lee: `visibility: hidden` en CSS.
  intro.toggleAttribute('data-hidden', state.intro < 0.02);
  inside.toggleAttribute('data-hidden', state.inside < 0.02);
}

/** Coreografía del hero para un progreso. */
export function writeHero(elements: HeroElements, progress: number) {
  writeChoreography(elements, choreography(progress));
}

export function clearChoreography(elements: HeroElements) {
  elements.line.parentElement?.style.removeProperty('opacity');
  for (const node of elements.hud.querySelectorAll<HTMLElement>('*')) node.removeAttribute('style');
  elements.hud.removeAttribute('style');
  for (const node of [elements.intro, elements.inside, elements.line]) {
    node.style.removeProperty('opacity');
    node.style.removeProperty('transform');
    node.removeAttribute('data-hidden');
  }
}

export interface PlayerOptions {
  /** Qué video: 0 es v1 (hero), 1 es v2 (cierre). */
  clip: Clip;
  set: FrameSetName;
  /** Ritmo del video en la pista (ver sequence.ts). */
  timing: Timing;
  /** Último fotograma que usa la escena (el cierre no llega al final claro de v2). */
  last: number;
  /** `stride` > 1 es el modo liviano (ver device.ts): uno de cada `stride` fotogramas. */
  stride: number;
  /** Se llama con el progreso (0 a 1) cada vez que cambia, y una vez al empezar. */
  onProgress: (progress: number) => void;
  /**
   * Cuánto antes de asomar la escena empieza a descargar (margen del
   * IntersectionObserver). El hero está arriba; el cierre se prepara antes
   * de llegar para que la persona no lo vea vacío.
   */
  lookahead?: string;
}

/**
 * Con `stride` > 1 solo se descarga y decodifica esa fracción del video (y no
 * se funden fotogramas vecinos, que cuesta un segundo dibujo por cuadro).
 *
 * El avance sigue al scroll con inercia también con movimiento reducido: no
 * es una animación que corra sola, es el mismo recorrido que hace la persona,
 * sin los saltos de cada clic de la rueda.
 */
export function startPlayer(elements: SceneElements, options: PlayerOptions): () => void {
  const { track, stage, canvas, fade } = elements;
  const { clip, set, timing, stride, onProgress } = options;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;

  const prefix = set === 'desktop' ? 'd' : 'm';
  const source = (clip === 0 ? manifest.clips.v1 : manifest.clips.v2)[set];
  const last = Math.max(0, Math.min(source.count - 1, options.last));
  const total = last + 1;
  const blobs = new Array<Blob | undefined>(total);
  /** 0 sin pedir, 1 descargando, 2 descargado, 3 falló. */
  const status = new Uint8Array(total);
  const images = new Map<number, Drawable>();
  const decoding = new Set<number>();
  const abort = new AbortController();

  let disposed = false;
  let visible = false;
  let raf = 0;
  let measure = true;
  let resize = true;
  let repaint = false;
  let loaderDirty = true;
  let target = 0;
  let exit = 0;
  let shade = Number.NaN;
  let progress = Number.NaN;
  let velocity = 0;
  let lastTime = 0;
  let fetches = 0;
  let decodes = 0;
  let direction: 1 | -1 = 1;
  let current = 0;
  let drawn: { index: number; image: Drawable } | null = null;
  /** Fotograma siguiente al dibujado, fundido encima en la proporción `mix`. */
  let blend: { image: Drawable; mix: number } | null = null;
  let width = 0;
  let height = 0;
  // Hasta el evento load solo se pide el fotograma actual (el póster ya está
  // en caché): nada compite con la primera pantalla. Después, hasta que la
  // persona hace scroll, solo un tramo corto por delante (IDLE_AHEAD).
  let warm = document.readyState === 'complete';
  let engaged = false;

  function schedule() {
    if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }

  /** Progreso de la pista y, pasado su final, cuánto subió ya el escenario (0 a 1 de su alto). */
  function readScroll(): { target: number; exit: number } {
    const travel = track.offsetHeight - stage.offsetHeight;
    if (travel <= 0) return { target: 0, exit: 0 };
    const scrolled = -track.getBoundingClientRect().top;
    return { target: clamp01(scrolled / travel), exit: clamp01((scrolled - travel) / stage.offsetHeight) };
  }

  /** La salida sigue al scroll sin inercia: el escenario ya se está moviendo con la página. */
  function writeExit() {
    if (!fade) return;
    const next = exitShade(exit);
    if (next === shade) return;
    shade = next;
    fade.style.transform = `scaleY(${shade.toFixed(4)})`;
  }

  function sizeCanvas() {
    width = stage.clientWidth;
    height = stage.clientHeight;
    // Nunca más píxeles que el fotograma (máximo DPR 2): el compositor escala
    // el canvas, y dibujar a más resolución que la fuente no agrega detalle.
    const cover = Math.max(width / source.width, height / source.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.max(0.5, 1 / cover));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingQuality = 'high';
  }

  /** Dibuja cubriendo el escenario, centrado (object-fit: cover). */
  function draw(image: Drawable, alpha: number) {
    const [imageWidth, imageHeight] = sizeOf(image);
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.globalAlpha = 1;
  }

  function paint() {
    if (!drawn || width === 0 || height === 0) return;
    draw(drawn.image, 1);
    if (blend) draw(blend.image, blend.mix);
    if (!track.hasAttribute('data-painted')) track.setAttribute('data-painted', '');
    // Fotograma que más se ve (p. ej. «v1:1»): lo leen las pruebas de la landing.
    track.dataset.frame = `v${clip + 1}:${drawn.index + (blend && blend.mix >= 0.5 ? 1 : 0) + 1}`;
  }

  function fetchFrame(index: number) {
    status[index] = 1;
    fetches += 1;
    fetch(frameUrl(clip, prefix, index), { signal: abort.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (disposed) return;
        blobs[index] = blob;
        status[index] = 2;
      })
      .catch(() => {
        // Un fotograma que no llega no apaga el canvas: sigue el último dibujado.
        if (!disposed) status[index] = 3;
      })
      .finally(() => {
        fetches -= 1;
        if (disposed) return;
        loaderDirty = true;
        schedule();
      });
  }

  function decodeFrame(index: number, blob: Blob) {
    decoding.add(index);
    decodes += 1;
    decodeBlob(blob)
      .then(image => {
        if (disposed) release(image);
        else images.set(index, image);
      })
      .catch(() => {
        if (disposed) return;
        blobs[index] = undefined;
        status[index] = 3;
      })
      .finally(() => {
        decoding.delete(index);
        decodes -= 1;
        if (disposed) return;
        loaderDirty = true;
        schedule();
      });
  }

  /** Descarga por cercanía al fotograma actual y decodifica solo la ventana. */
  function pump() {
    loaderDirty = false;
    const [first, end] = decodeWindow(current, total, direction);
    for (const [index, image] of images) {
      const pinned = drawn?.image === image || blend?.image === image;
      if (!pinned && (index < first - 2 || index > end + 2)) {
        release(image);
        images.delete(index);
      }
    }
    const order = loadOrder(current, total, direction);
    for (const index of order) {
      if (decodes >= MAX_DECODES) break;
      if (index < first || index > end) continue;
      const blob = blobs[index];
      if (blob && !images.has(index) && !decoding.has(index)) decodeFrame(index, blob);
    }
    for (const index of order) {
      if (fetches >= MAX_FETCHES) break;
      if (!warm && index !== current) continue;
      if (!engaged && (index < current || index > current + IDLE_AHEAD)) continue;
      if (!usesFrame(index, last, stride)) continue;
      if (status[index] === 0) fetchFrame(index);
    }
  }

  function tick(now: number) {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    if (resize) {
      sizeCanvas();
      resize = false;
      repaint = true;
    }
    if (measure) {
      ({ target, exit } = readScroll());
      measure = false;
    }
    writeExit();

    const previous = progress;
    // Segundos desde el cuadro anterior (acotado: una pestaña que vuelve no da un salto).
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    if (Number.isNaN(progress)) {
      // Al volver a una página a mitad de la pista se salta directo, sin barrido.
      progress = target;
      velocity = 0;
    } else {
      [progress, velocity] = smoothDamp(progress, target, velocity, SMOOTH_TIME, dt);
      if (Math.abs(target - progress) < 0.00005) {
        progress = target;
        velocity = 0;
      }
    }
    if (progress !== previous) {
      onProgress(progress);
      track.dataset.progress = progress.toFixed(3);
    }

    const point = framePoint(progress, timing, last);
    const index = snapIndex(Math.min(last, Math.round(point)), last, stride);
    if (index !== current) {
      direction = index > current ? 1 : -1;
      current = index;
      loaderDirty = true;
    }

    // Entre dos fotogramas se dibuja el de abajo y encima el siguiente, en la
    // proporción que toca. Si el de abajo aún no está decodificado, el más cercano solo.
    let base = index;
    let over: { image: Drawable; mix: number } | null = null;
    if (stride === 1) {
      const { lower, upper, mix } = frameBlend(point, last);
      if (images.has(lower)) {
        base = lower;
        const upperImage = mix > 0.015 ? images.get(upper) : undefined;
        // En 64 pasos: por debajo de eso el cambio no se ve y no vale un dibujo.
        if (upperImage) over = { image: upperImage, mix: Math.round(mix * 64) / 64 };
      }
    }
    const image = images.get(base);
    if (image && image !== drawn?.image) {
      drawn = { index: base, image };
      repaint = true;
    }
    if (!image) over = null;
    if (over?.image !== blend?.image || over?.mix !== blend?.mix) {
      blend = over;
      repaint = true;
    }
    if (repaint) {
      paint();
      repaint = false;
    }
    if (loaderDirty) pump();
    if (progress !== target) schedule();
    else lastTime = 0;
  }

  // Se mide en el evento de scroll, cuando el diseño está al día; en
  // requestAnimationFrame solo se escribe. Medir ahí, después de que otro
  // módulo escribió, obligaría a recalcular estilos y diseño en cada cuadro.
  const onScroll = () => {
    if (!engaged) {
      engaged = true;
      loaderDirty = true;
    }
    if (visible) {
      ({ target, exit } = readScroll());
      measure = false;
    } else {
      measure = true;
    }
    schedule();
  };
  const onLoad = () => {
    warm = true;
    loaderDirty = true;
    schedule();
  };
  if (!warm) window.addEventListener('load', onLoad, { once: true });
  const onResize = () => {
    resize = true;
    measure = true;
    schedule();
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      onScroll();
    }
  };

  // Lejos de la pantalla no se dibuja ni se descarga nada.
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      resize = true;
      measure = true;
      loaderDirty = true;
      schedule();
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }, { rootMargin: options.lookahead ?? '200px 0px' });
  observer.observe(track);
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(stage);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  track.setAttribute('data-player', set);
  ({ target, exit } = readScroll());
  // Si la página abre a mitad de la pista (recarga, ancla), la persona ya está recorriéndola.
  engaged = target > 0;
  onProgress(target);
  writeExit();

  return () => {
    disposed = true;
    abort.abort();
    cancelAnimationFrame(raf);
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('load', onLoad);
    document.removeEventListener('visibilitychange', onVisibility);
    for (const image of images.values()) release(image);
    images.clear();
    blobs.fill(undefined);
    drawn = null;
    blend = null;
    if (fade) {
      fade.style.removeProperty('transform');
    }
    track.removeAttribute('data-painted');
    track.removeAttribute('data-player');
    track.removeAttribute('data-progress');
    track.removeAttribute('data-frame');
  };
}
