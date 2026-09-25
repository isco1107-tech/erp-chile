'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import manifest from '../../../public/marketing/cinematic/seq/manifest.json';
import { isLightweightDevice } from '@/components/marketing/cinematic/device';
import { frameUrl } from '@/components/marketing/cinematic/sequence';
import { LOAD_CONCURRENCY, STALL_JUMP_MS, coverRect, loadOrder, positionAt, videoFrames } from './login-video-timeline';

/** Mismo corte que la landing: en teléfono, el recorte vertical (y 4 veces más liviano). */
const MOBILE_QUERY = '(max-width: 760px)';

/**
 * Video de fondo del login: las secuencias v1 + v2 de la landing en un canvas
 * que llena su contenedor, siempre que se abre la página, y fijo al final en
 * la imagen "AETHER · ERP SOLUTIONS". Nunca tapa el formulario: vive en su
 * propio panel (ver `LoginShell`).
 *
 * - Empieza apenas llega el primer fotograma y avanza al ritmo de lo que se
 *   descarga (si un fotograma no llegó, espera, como un video que carga).
 * - Si se queda esperando demasiado, salta a la imagen final.
 * - Se reproduce siempre, también con "reducir movimiento" activo en el
 *   sistema (Windows lo activa al apagar "Efectos de animación", y así el
 *   video no se veía nunca): es un video lento dentro de su propio panel, no
 *   mueve la página, y el botón "Saltar video" lo detiene en cualquier
 *   momento (WCAG 2.2.2).
 * - Suelta de memoria los fotogramas ya mostrados: decodificados a 1920×1080
 *   los 288 pesarían más de 2 GB.
 */
export default function LoginVideo({ className = 'relative' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(false);

  const skip = useCallback(() => skipRef.current(), []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!container || !canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;

    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const set = mobile ? manifest.clips.v1.mobile : manifest.clips.v1.desktop;
    const counts: [number, number] = mobile
      ? [manifest.clips.v1.mobile.count, manifest.clips.v2.mobile.count]
      : [manifest.clips.v1.desktop.count, manifest.clips.v2.desktop.count];
    const prefix = mobile ? 'm' : 'd';
    const stride = isLightweightDevice() ? 3 : 1;
    const frames = videoFrames(counts, stride);
    const last = frames.length - 1;
    const images: Array<HTMLImageElement | null> = frames.map(() => null);
    const ready = frames.map(() => false);

    let disposed = false;
    let raf = 0;
    let played = 0;
    let lastTick = 0;
    let drawn = -1;
    let position = 0;
    let finished = false;
    let waitingSince = 0;

    function resize() {
      if (!canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(container!.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(container!.clientHeight * ratio));
      const redraw = drawn;
      drawn = -1;
      if (redraw >= 0) draw(redraw);
    }

    function draw(at: number) {
      if (at === drawn || !ready[at]) return;
      const image = images[at];
      if (!image || !image.naturalWidth) return;
      const rect = coverRect(set.width, set.height, canvas!.width, canvas!.height);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      drawn = at;
    }

    /** Suelta los fotogramas que ya pasaron (nunca se vuelve atrás), salvo el último. */
    function release(upTo: number) {
      for (let index = 0; index < upTo && index < last; index += 1) images[index] = null;
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      position = last;
      draw(last);
      release(last);
      setPlaying(false);
    }

    function tick(now: number) {
      if (disposed || finished) return;
      const dt = lastTick ? Math.min(100, now - lastTick) : 0;
      lastTick = now;
      const next = positionAt(played + dt, set.fps, stride, frames.length);
      if (ready[next]) {
        played += dt;
        waitingSince = 0;
      } else {
        waitingSince ||= now;
        if (now - waitingSince > STALL_JUMP_MS && ready[last]) return finish();
      }
      position = positionAt(played, set.fps, stride, frames.length);
      draw(position);
      release(position);
      if (position >= last && ready[last]) return finish();
      raf = requestAnimationFrame(tick);
    }

    skipRef.current = () => {
      if (ready[last]) finish();
      else {
        // La imagen final aún no llega: se muestra apenas llegue.
        finished = true;
        cancelAnimationFrame(raf);
        setPlaying(false);
      }
    };

    function onReady(at: number) {
      ready[at] = true;
      if (disposed) return;
      if (finished) {
        if (at === last) draw(last);
        return;
      }
      if (at === 0 && !raf) {
        draw(0);
        setPlaying(true);
        raf = requestAnimationFrame(tick);
      }
    }

    // Descarga en orden con concurrencia acotada (primero el primero y el último).
    const queue = loadOrder(frames.length);
    let cursor = 0;
    function loadNext() {
      if (disposed || cursor >= queue.length) return;
      const at = queue[cursor]!;
      cursor += 1;
      const frame = frames[at]!;
      const image = new Image();
      image.decoding = 'async';
      images[at] = image;
      const done = () => {
        onReady(at);
        loadNext();
      };
      image.onload = done;
      // Un fotograma caído no congela el video: se marca listo y se salta.
      image.onerror = done;
      image.src = frameUrl(frame.clip, prefix, frame.index);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    for (let slot = 0; slot < LOAD_CONCURRENCY; slot += 1) loadNext();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      for (const image of images) {
        if (!image) continue;
        image.onload = null;
        image.onerror = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`overflow-hidden bg-[#070910] ${className}`}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
      {playing && (
        <button
          type="button"
          onClick={skip}
          className="absolute right-4 bottom-4 z-[3] rounded-full border border-white/15 bg-black/35 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur transition-colors hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Saltar video
        </button>
      )}
    </div>
  );
}
