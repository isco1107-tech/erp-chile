'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Contador global de solicitudes en vuelo, compartido por todas las instancias
 * del componente (en teoría solo se monta una vez, en el layout raíz).
 *
 * `window.fetch` es el único punto en común entre dos cosas muy distintas:
 * - Navegación de ruta: el router de App Router pide el payload RSC por fetch.
 * - Server Actions: `sonner`-toasted `xxxAction()` invocadas desde componentes
 *   de cliente viajan como POST a la propia ruta con el header `Next-Action`.
 * Parchar fetch una sola vez y contar en/out cubre ambos casos sin tener que
 * instrumentar cada Server Action o cada `router.push` del proyecto.
 */
let activeRequests = 0;
let listeners: Array<(active: boolean) => void> = [];
let patched = false;

function notify() {
  const active = activeRequests > 0;
  for (const listener of listeners) listener(active);
}

function patchFetch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    // Las peticiones GET incluyen el prefetch en hover/viewport de <Link>, que
    // no representa una navegación real y dispararía la barra sin que el
    // usuario haya hecho nada. Los Server Actions y las navegaciones que sí
    // importa mostrar viajan como POST.
    const method = String(args[1]?.method ?? 'GET').toUpperCase();
    if (method !== 'POST') return originalFetch(...args);

    activeRequests++;
    notify();
    try {
      return await originalFetch(...args);
    } finally {
      activeRequests--;
      notify();
    }
  };
}

/**
 * Barra de progreso superior, sutil, para cambios de ruta y envíos de Server
 * Actions. Se monta una sola vez en el layout raíz.
 */
export default function RouteProgressBar() {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const growTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    patchFetch();
    listeners.push(setActive);
    return () => {
      listeners = listeners.filter((listener) => listener !== setActive);
    };
  }, []);

  useEffect(() => {
    if (active) {
      clearTimeout(hideTimer.current);
      setVisible(true);
      setWidth(15);
      // Avanza rápido al principio y frena cerca del final: nunca llega al
      // 100% por sí sola, porque no sabe cuánto falta — solo que sigue en vuelo.
      growTimer.current = setInterval(() => {
        setWidth((w) => (w < 88 ? w + (88 - w) * 0.15 : w));
      }, 200);
    } else {
      clearInterval(growTimer.current);
      setWidth(100);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250);
    }
    return () => clearInterval(growTimer.current);
  }, [active]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed top-0 right-0 left-0 z-[100] h-0.5 print:hidden" aria-hidden="true">
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
