'use client';

import { useEffect, useRef } from 'react';
import { makeStars, seeded, wrap, type Star } from '@/components/marketing/cinematic/constellation';

/** Velocidad de deriva del cielo, en px por segundo a profundidad 1. */
const DRIFT = { x: -26, y: -9 };
/** Cada cuánto (aprox.) cruza una estrella fugaz, en ms. */
const SHOOTING_EVERY_MS = 7000;
/** Duración de una estrella fugaz, en ms. */
const SHOOTING_MS = 1100;

interface Shooting {
  x: number;
  y: number;
  dx: number;
  dy: number;
  born: number;
}

/**
 * Cielo en movimiento constante de las pantallas de acceso, la continuación
 * de la intro en video del login (`LoginIntro`): polvo de estrellas que deriva
 * lento a distintas profundidades, titila, y cada tanto una estrella fugaz
 * dorada. Un solo canvas detrás de todo; se detiene con la pestaña oculta y,
 * con "reducir movimiento", se dibuja una vez y queda quieto.
 */
export default function AuthSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const random = seeded(Date.now());

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let phases: number[] = [];
    let raf = 0;
    let last = 0;
    let elapsed = 0;
    let nextShooting = 2500;
    let shooting: Shooting | null = null;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      stars = makeStars(Math.min(260, Math.round((width * height) / 6500)), width, height, 20260925);
      phases = stars.map((_, index) => (index * 2.399) % (Math.PI * 2));
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const t = elapsed / 1000;
      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index]!;
        const x = wrap(star.x + DRIFT.x * star.depth * t, width);
        const y = wrap(star.y + DRIFT.y * star.depth * t, height);
        const twinkle = 0.55 + 0.45 * Math.sin(t * (0.6 + star.depth * 3) + phases[index]!);
        const alpha = (0.25 + star.depth * 1.6) * twinkle;
        ctx.fillStyle = star.gold ? `rgba(219, 192, 118, ${Math.min(0.9, alpha)})` : `rgba(235, 240, 255, ${Math.min(0.85, alpha)})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (shooting) {
        const life = (elapsed - shooting.born) / SHOOTING_MS;
        if (life >= 1) {
          shooting = null;
        } else {
          const headX = shooting.x + shooting.dx * life;
          const headY = shooting.y + shooting.dy * life;
          const tail = 0.18;
          const gradient = ctx.createLinearGradient(headX - shooting.dx * tail, headY - shooting.dy * tail, headX, headY);
          const fade = Math.sin(life * Math.PI);
          gradient.addColorStop(0, 'rgba(219, 192, 118, 0)');
          gradient.addColorStop(1, `rgba(245, 226, 170, ${0.85 * fade})`);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(headX - shooting.dx * tail, headY - shooting.dy * tail);
          ctx.lineTo(headX, headY);
          ctx.stroke();
        }
      }
    }

    function frame(now: number) {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      elapsed += dt;
      if (!shooting && elapsed >= nextShooting) {
        shooting = {
          x: width * (0.35 + random() * 0.6),
          y: height * (random() * 0.35),
          dx: -width * (0.25 + random() * 0.2),
          dy: height * (0.18 + random() * 0.15),
          born: elapsed,
        };
        nextShooting = elapsed + SHOOTING_EVERY_MS * (0.6 + random() * 0.8);
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      last = 0;
      if (reduced.matches || document.hidden) {
        draw();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', start);
    reduced.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
      reduced.removeEventListener('change', start);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 size-full" />;
}
