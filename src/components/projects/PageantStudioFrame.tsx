'use client';

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { PAGEANT_STUDIO_CHANNEL, type PageantStudioState, type PreviewToStudio, type StudioToPreview } from '@/lib/events/pageant-studio';
import type { CanvasDevice } from '@/lib/web-sites/canvas';

export type PageantZoom = 'fit' | '75' | '100' | '125' | '150';

const WIDTH = { desktop: 1024, tablet: 768, mobile: 390 };

export function sendToPageantPreview(frame: HTMLIFrameElement | null, message: StudioToPreview) {
  frame?.contentWindow?.postMessage({ ...message, channel: PAGEANT_STUDIO_CHANNEL }, window.location.origin);
}

export function PageantStudioFrame({ projectId, frame, device, state, onMessage, saving, zoom }: {
  projectId: string;
  frame: RefObject<HTMLIFrameElement | null>;
  device: CanvasDevice;
  state: PageantStudioState;
  saving: boolean;
  zoom: PageantZoom;
  onMessage: (message: PreviewToStudio) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const frameWidth = device === 'desktop' ? Math.max(WIDTH.desktop, width) : WIDTH[device];
  const scale = zoom === 'fit' ? (width ? Math.min(1, width / frameWidth) : 1) : Number(zoom) / 100;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    measure();
    return () => resize.disconnect();
  }, []);

  const receive = useEffectEvent((event: MessageEvent<PreviewToStudio & { channel: string }>) => {
    if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== PAGEANT_STUDIO_CHANNEL) return;
    if (event.data.type === 'ready') {
      setReady(true);
      sendToPageantPreview(frame.current, { type: 'state', state });
    } else {
      onMessage(event.data);
    }
  });

  useEffect(() => {
    const onMessageEvent = (event: MessageEvent) => receive(event);
    window.addEventListener('message', onMessageEvent);
    return () => window.removeEventListener('message', onMessageEvent);
  }, []);

  useEffect(() => {
    sendToPageantPreview(frame.current, { type: 'state', state });
  }, [frame, state]);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setFailed(true), 12000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  return (
    <div ref={viewport} className="relative h-full min-h-0 min-w-0 overflow-x-auto overflow-y-hidden bg-muted">
      {!ready && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-card/95 p-3 text-center text-sm" role="status">
          {failed ? 'No se pudo conectar con la vista en vivo. Si la sesión venció, vuelve a entrar.' : 'Cargando sitio del certamen…'}
        </div>
      )}
      <div className="mx-auto h-full overflow-hidden" inert={saving || undefined} style={{ width: frameWidth * scale }}>
        <iframe ref={frame} src={`/preview/certamen/${projectId}?studio=1`} title="Vista previa en vivo del certamen"
          className="block origin-top-left border-0 bg-white shadow-sm"
          style={{ width: frameWidth, height: `${100 / scale}%`, transform: scale !== 1 ? `scale(${scale})` : undefined }}
        />
      </div>
    </div>
  );
}
