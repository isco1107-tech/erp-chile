'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import manifest from '../../../public/marketing/cinematic/seq/manifest.json';
import { isLightweightDevice } from '@/components/marketing/cinematic/device';
import { frameUrl } from '@/components/marketing/cinematic/sequence';
import {
  EXIT_FADE_MS,
  LOGIN_INTRO_SEEN_KEY,
  REDUCED_MOTION_QUERY,
  MAX_WAIT_MS,
  canStart,
  introFrames,
  logoOpacity,
  positionAt,
  readyPrefix,
} from './login-intro-timeline';

/** Mismo corte que la landing: en teléfono se usa el recorte vertical. */
const MOBILE_QUERY = '(max-width: 760px)';

type Phase = 'pending' | 'playing' | 'leaving' | 'done';

function markSeen() {
  try {
    sessionStorage.setItem(LOGIN_INTRO_SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento (modo privado estricto): la intro se repetiría, no es grave.
  }
}

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(LOGIN_INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Intro en video del login: reproduce la secuencia v1 de la landing (cielo de
 * Atacama hasta la galaxia) a pantalla completa, cierra con el logo de Aether
 * y se abre con un fundido hacia el login, cuyo cielo animado (`AuthSky`)
 * continúa el movimiento. Una vez por sesión, con botón para saltar, y nunca
 * con "reducir movimiento" ni si la conexión no alcanza a cargarla a tiempo.
 */
export default function LoginIntro() {
  const [phase, setPhase] = useState<Phase>('pending');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const leaveTimer = useRef<number | null>(null);

  const leave = useCallback(() => {
    markSeen();
    setPhase((current) => (current === 'done' || current === 'leaving' ? current : 'leaving'));
  }, []);

  // Antes de pintar: quien ya la vio, o pidió menos movimiento, no la ve.
  useLayoutEffect(() => {
    if (alreadySeen() || window.matchMedia(REDUCED_MOTION_QUERY).matches) setPhase('done');
  }, []);

  useEffect(() => {
    if (phase !== 'leaving') return;
    leaveTimer.current = window.setTimeout(() => setPhase('done'), EXIT_FADE_MS);
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [phase]);

  useEffect(() => {
    if (alreadySeen() || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      setPhase('done');
      return;
    }

    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const set = mobile ? manifest.clips.v1.mobile : manifest.clips.v1.desktop;
    const prefix = mobile ? 'm' : 'd';
    const stride = isLightweightDevice() ? 3 : 1;
    const frames = introFrames(set.count, stride);
    const images = frames.map(() => new Image());
    const ready = frames.map(() => false);

    let disposed = false;
    let raf = 0;
    let started = false;
    let played = 0;
    let lastTick = 0;
    let drawn = -1;

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      drawn = -1;
    }

    /** Dibuja el fotograma cubriendo la pantalla, igual que `object-fit: cover`. */
    function draw(position: number) {
      if (!canvas || !context || position === drawn) return;
      const image = images[position];
      if (!image || !ready[position]) return;
      const scale = Math.max(canvas.width / set.width, canvas.height / set.height);
      const width = set.width * scale;
      const height = set.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      drawn = position;
    }

    function tick(now: number) {
      if (disposed) return;
      const dt = lastTick ? Math.min(100, now - lastTick) : 0;
      lastTick = now;
      const target = positionAt(played + dt, set.fps, stride, frames.length);
      // Si el fotograma siguiente no llegó, el reloj espera (como un video que carga).
      if (ready[target]) played += dt;
      const position = positionAt(played, set.fps, stride, frames.length);
      draw(position);
      const progress = frames.length > 1 ? position / (frames.length - 1) : 1;
      if (logoRef.current) logoRef.current.style.opacity = String(logoOpacity(progress));
      if (position >= frames.length - 1 && ready[frames.length - 1]) {
        leave();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function maybeStart() {
      if (started || disposed || !canStart(ready)) return;
      started = true;
      markSeen();
      setPhase('playing');
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener('resize', resize);

    // Se piden en orden: primero lo que se ve primero.
    frames.forEach((frame, position) => {
      const image = images[position]!;
      image.decoding = 'async';
      image.onload = () => {
        ready[position] = true;
        if (position === 0) draw(0);
        maybeStart();
      };
      image.onerror = () => {
        // Un fotograma caído no debe congelar la intro: se salta a la siguiente.
        ready[position] = true;
        maybeStart();
      };
      image.src = frameUrl(0, prefix, frame);
    });

    const giveUp = window.setTimeout(() => {
      if (!started && readyPrefix(ready) < frames.length) {
        markSeen();
        setPhase('done');
      }
    }, MAX_WAIT_MS);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(giveUp);
      window.removeEventListener('resize', resize);
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
    // `leave` es estable (useCallback sin dependencias): corre una sola vez al montar.
  }, [leave]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, leave]);

  if (phase === 'done') return null;

  return (
    <div
      data-login-intro
      className={`login-intro fixed inset-0 z-[60] bg-[#070910] transition-opacity ease-out ${phase === 'leaving' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${EXIT_FADE_MS}ms` }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(7_9_16/0.65)_100%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={logoRef}
        src="/branding/logo-on-dark.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto h-auto w-[min(85vw,1250px)] object-contain opacity-0 lg:w-[min(58vw,1000px)]"
      />
      {phase === 'pending' && (
        <div className="absolute inset-x-0 bottom-10 flex justify-center" aria-hidden="true">
          <span className="h-px w-24 overflow-hidden bg-white/10">
            <span className="block h-full w-1/3 animate-[login-intro-load_1.2s_ease-in-out_infinite] bg-primary/70" />
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={leave}
        className="absolute right-5 bottom-5 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-medium tracking-wide text-white/80 backdrop-blur transition-colors hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:right-8 sm:bottom-8"
      >
        Saltar intro
      </button>
    </div>
  );
}
