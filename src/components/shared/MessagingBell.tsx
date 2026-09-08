'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { getTotalUnreadCountAction } from '@/modules/messaging/actions/messaging.actions';

const POLL_MS = 20000;

/** Dibuja el favicon actual + un badge circular con el contador encima, como data URL. */
function drawBadgedFavicon(baseHref: string, count: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('sin contexto 2D'));
      ctx.drawImage(img, 0, 0, size, size);

      const radius = size * 0.32;
      const cx = size - radius - 2;
      const cy = radius + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `${radius}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 9 ? '9+' : String(count), cx, cy + 1);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('no se pudo cargar el favicon actual'));
    img.src = baseHref;
  });
}

const BADGE_TITLE_RE = /^\(\d+\+?\)\s/;

/**
 * Botón de mensajería en el header (junto a notificaciones): badge con no
 * leídos, más el efecto de título de pestaña/favicon con contador — ambos
 * comparten el mismo polling para no duplicar requests. Sigue el patrón de
 * `setInterval` ya usado en `MessagingClient.tsx` (no hay SWR en el proyecto).
 */
export default function MessagingBell() {
  const [unread, setUnread] = useState(0);
  const originalFaviconHref = useRef<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await getTotalUnreadCountAction();
      if (!cancelled && result.success) setUnread(result.data);
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;
    if (originalFaviconHref.current === null) originalFaviconHref.current = link.href;

    // El título "base" se recalcula desde el `document.title` actual (no una
    // constante fija de módulo): Next.js lo reescribe en cada navegación, así
    // que hay que leerlo de nuevo cada vez — solo se le quita el badge que
    // nosotros mismos le hayamos puesto antes, si quedó pegado.
    const baseTitle = document.title.replace(BADGE_TITLE_RE, '');

    if (unread === 0) {
      document.title = baseTitle;
      if (originalFaviconHref.current) link.href = originalFaviconHref.current;
      return;
    }

    document.title = `(${unread > 99 ? '99+' : unread}) ${baseTitle}`;
    if (originalFaviconHref.current) {
      drawBadgedFavicon(originalFaviconHref.current, unread)
        .then((dataUrl) => {
          link.href = dataUrl;
        })
        .catch(() => {
          // Favicon actual no se pudo leer/dibujar (ej. CORS en un dominio
          // externo) — se deja el favicon tal cual, el título ya avisa igual.
        });
    }
    // `pathname` fuerza reaplicar el badge tras cada navegación (Next.js
    // reescribe `document.title` a la entrar a la nueva ruta).
  }, [unread, pathname]);

  return (
    <Link
      href="/dashboard/messaging"
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Mensajería"
    >
      <MessageSquare className="size-5" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
