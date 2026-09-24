import manifest from '../../../../public/marketing/cinematic/seq/manifest.json';
import {
  LERP, V2_PRELOAD_FROM, chapterState, choreography, clamp01, decodeWindow, exitShade, frameAt, frameUrl, hudOpacity,
  fromGlobal, globalIndex, loadOrder, type Choreography, type Clip, type FramePosition,
} from './sequence';

/**
 * Motor del hero de /landing-v2: dibuja en un canvas el fotograma que toca
 * según el scroll y escribe la coreografía directo al DOM. Nada de esto pasa
 * por el estado de React: todo vive en variables del cierre y se escribe
 * dentro de requestAnimationFrame.
 *
 * Memoria: los fotogramas se guardan comprimidos (~23 MB en escritorio) y solo
 * se decodifican los de una ventana alrededor del actual. Decodificar la
 * secuencia completa a 1920×1080 costaría más de 2 GB.
 */

export interface PlayerElements {
  track: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  intro: HTMLElement;
  inside: HTMLElement;
  fade: HTMLElement;
  line: HTMLElement;
  /** Guía de capítulos (sus `li` llevan data-from y data-to) y «Desliza para entrar». */
  hud: HTMLElement;
}

export type FrameSetName = 'desktop' | 'mobile';

type Drawable = ImageBitmap | HTMLImageElement;

interface ClipFrames {
  count: number;
  blobs: (Blob | undefined)[];
  /** 0 sin pedir, 1 descargando, 2 descargado, 3 falló. */
  status: Uint8Array;
  images: Map<number, Drawable>;
  decoding: Set<number>;
}

const MAX_FETCHES = 6;
const MAX_DECODES = 3;

function makeClip(count: number): ClipFrames {
  return { count, blobs: new Array<Blob | undefined>(count), status: new Uint8Array(count), images: new Map(), decoding: new Set() };
}

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

/** Escribe la coreografía en el DOM. Se usa también para dejar el estado inicial. */
export function writeChoreography(elements: PlayerElements, state: Choreography) {
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

function clearChoreography(elements: PlayerElements) {
  elements.line.parentElement?.style.removeProperty('opacity');
  for (const node of elements.hud.querySelectorAll<HTMLElement>('*')) node.removeAttribute('style');
  elements.hud.removeAttribute('style');
  for (const node of [elements.intro, elements.inside, elements.fade, elements.line]) {
    node.style.removeProperty('opacity');
    node.style.removeProperty('transform');
    node.removeAttribute('data-hidden');
  }
}

export function startPlayer(elements: PlayerElements, setName: FrameSetName, crossfadeMs: number, inertia = true): () => void {
  const { track, stage, canvas } = elements;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;

  const prefix = setName === 'desktop' ? 'd' : 'm';
  const source = manifest.clips.v1[setName];
  const counts: [number, number] = [manifest.clips.v1[setName].count, manifest.clips.v2[setName].count];
  // Tramos [primero, último] de fotogramas claros (los mide el generador).
  const light: [readonly (readonly number[])[], readonly (readonly number[])[]] = [manifest.clips.v1[setName].light, manifest.clips.v2[setName].light];
  const total = counts[0] + counts[1];
  const clips: [ClipFrames, ClipFrames] = [makeClip(counts[0]), makeClip(counts[1])];
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
  let fetches = 0;
  let decodes = 0;
  let v2Allowed = false;
  let direction: 1 | -1 = 1;
  let current = 0;
  let drawn: { position: FramePosition; image: Drawable } | null = null;
  let outgoing: { image: Drawable; started: number } | null = null;
  let width = 0;
  let height = 0;
  // Hasta el evento load solo se piden los fotogramas cercanos: el resto
  // espera para no competir con lo que necesita la primera pantalla.
  let warm = document.readyState === 'complete';

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
    const next = exitShade(exit);
    if (next === shade) return;
    shade = next;
    elements.fade.style.transform = `scaleY(${shade.toFixed(4)})`;
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

  function paint(now: number) {
    if (!drawn || width === 0 || height === 0) return;
    if (outgoing) {
      const t = (now - outgoing.started) / crossfadeMs;
      if (t >= 1) {
        outgoing = null;
        draw(drawn.image, 1);
      } else {
        draw(outgoing.image, 1);
        draw(drawn.image, Math.max(0, t));
      }
    } else {
      draw(drawn.image, 1);
    }
    if (!track.hasAttribute('data-painted')) track.setAttribute('data-painted', '');
    // Fotograma visible (p. ej. «v1:1»): lo leen las pruebas de la landing.
    track.dataset.frame = `v${drawn.position.clip + 1}:${drawn.position.index + 1}`;
    // Sobre un cuadro claro la cabecera y la línea de progreso cambian de fondo (CSS).
    const { clip, index } = drawn.position;
    track.toggleAttribute('data-light', light[clip].some(([first, last]) => index >= first && index <= last));
  }

  function fetchFrame(clip: Clip, index: number) {
    const frames = clips[clip];
    frames.status[index] = 1;
    fetches += 1;
    fetch(frameUrl(clip, prefix, index), { signal: abort.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (disposed) return;
        frames.blobs[index] = blob;
        frames.status[index] = 2;
      })
      .catch(() => {
        // Un fotograma que no llega no apaga el canvas: sigue el último dibujado.
        if (!disposed) frames.status[index] = 3;
      })
      .finally(() => {
        fetches -= 1;
        if (disposed) return;
        loaderDirty = true;
        schedule();
      });
  }

  function decodeFrame(clip: Clip, index: number, blob: Blob) {
    const frames = clips[clip];
    frames.decoding.add(index);
    decodes += 1;
    decodeBlob(blob)
      .then(image => {
        if (disposed) release(image);
        else frames.images.set(index, image);
      })
      .catch(() => {
        if (disposed) return;
        frames.blobs[index] = undefined;
        frames.status[index] = 3;
      })
      .finally(() => {
        frames.decoding.delete(index);
        decodes -= 1;
        if (disposed) return;
        loaderDirty = true;
        schedule();
      });
  }

  /** Descarga por cercanía al fotograma actual y decodifica solo la ventana. */
  function pump() {
    loaderDirty = false;
    const [first, last] = decodeWindow(current, total, direction);
    for (const clip of [0, 1] as const) {
      for (const [index, image] of clips[clip].images) {
        const global = globalIndex({ clip, index }, counts);
        const pinned = drawn?.image === image || outgoing?.image === image;
        if (!pinned && (global < first - 2 || global > last + 2)) {
          release(image);
          clips[clip].images.delete(index);
        }
      }
    }
    const order = loadOrder(current, total, direction);
    for (const global of order) {
      if (decodes >= MAX_DECODES) break;
      if (global < first || global > last) continue;
      const { clip, index } = fromGlobal(global, counts);
      const frames = clips[clip];
      const blob = frames.blobs[index];
      if (blob && !frames.images.has(index) && !frames.decoding.has(index)) decodeFrame(clip, index, blob);
    }
    for (const global of order) {
      if (fetches >= MAX_FETCHES) break;
      if (!warm && (global < current - 2 || global > current + 8)) continue;
      const { clip, index } = fromGlobal(global, counts);
      if (clip === 1 && !v2Allowed) continue;
      if (clips[clip].status[index] === 0) fetchFrame(clip, index);
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
    // Al volver a una página a mitad de la pista se salta directo, sin barrido.
    // Sin inercia (movimiento reducido) el video sigue al scroll 1:1.
    progress = Number.isNaN(progress) || !inertia ? target : progress + (target - progress) * LERP;
    if (Math.abs(target - progress) < 0.0005) progress = target;
    if (progress !== previous) {
      writeChoreography(elements, choreography(progress));
      track.dataset.progress = progress.toFixed(3);
    }
    if (!v2Allowed && progress > V2_PRELOAD_FROM) {
      v2Allowed = true;
      loaderDirty = true;
    }

    const position = frameAt(progress, counts);
    const global = globalIndex(position, counts);
    if (global !== current) {
      direction = global > current ? 1 : -1;
      current = global;
      loaderDirty = true;
    }

    const image = clips[position.clip].images.get(position.index);
    if (image && image !== drawn?.image) {
      // Cambio de video (v1 ↔ v2): el último cuadro del anterior se funde
      // durante `crossfadeMs`, porque los videos no calzan cuadro a cuadro.
      if (drawn && drawn.position.clip !== position.clip && crossfadeMs > 0) outgoing = { image: drawn.image, started: now };
      drawn = { position, image };
      repaint = true;
    }
    if (outgoing) repaint = true;
    if (repaint) {
      paint(now);
      repaint = false;
    }
    if (loaderDirty) pump();
    if (progress !== target || outgoing) schedule();
  }

  // Se mide en el evento de scroll, cuando el diseño está al día; en
  // requestAnimationFrame solo se escribe. Medir ahí, después de que otro
  // módulo escribió, obligaría a recalcular estilos y diseño en cada cuadro.
  const onScroll = () => {
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

  // Fuera de pantalla no se dibuja ni se descarga nada.
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
  }, { rootMargin: '200px 0px' });
  observer.observe(track);
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(stage);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  track.setAttribute('data-player', setName);
  ({ target, exit } = readScroll());
  writeChoreography(elements, choreography(target));
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
    for (const frames of clips) {
      for (const image of frames.images.values()) release(image);
      frames.images.clear();
      frames.blobs.fill(undefined);
    }
    drawn = null;
    outgoing = null;
    track.removeAttribute('data-painted');
    track.removeAttribute('data-player');
    track.removeAttribute('data-progress');
    track.removeAttribute('data-frame');
    track.removeAttribute('data-light');
    clearChoreography(elements);
  };
}
