'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { editorMessage, parseToEditor, type EditorKey, type ToCanvasMessage, type ToEditorMessage } from '@/lib/events/pageant-editor-protocol';
import { cn } from '@/lib/utils';

export const STAGE_DEVICES = [
  { id: 'desktop', label: 'Escritorio', width: 1440 },
  { id: 'notebook', label: 'Notebook', width: 1280 },
  { id: 'tablet', label: 'Tableta', width: 768 },
  { id: 'phone', label: 'Celular', width: 390 },
] as const;
export type StageDeviceId = (typeof STAGE_DEVICES)[number]['id'];
export type StageZoom = 'fit' | 1 | 0.75 | 0.5;

type StateMessage = Extract<ToCanvasMessage, { type: 'state' }>;

/**
 * Escenario del editor visual: el lienzo (iframe del mismo origen) al ancho
 * REAL del dispositivo, achicado para que entre. El alto del iframe es el que
 * queda en pantalla dividido por la escala, así una portada de «pantalla
 * completa» se ve como en ese dispositivo. Le manda el borrador cuando el
 * lienzo avisa que está listo y después de cada cambio (agrupando las teclas).
 */
export function EditorStage({
  src,
  width,
  zoom,
  state,
  onMessage,
  scrollTo,
  reloadKey,
  phoneFrame,
}: {
  src: string;
  width: number;
  zoom: StageZoom;
  state: Omit<StateMessage, 'channel' | 'type'>;
  onMessage: (message: ToEditorMessage) => void;
  scrollTo: { key: EditorKey; seq: number } | null;
  reloadKey: number;
  phoneFrame: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Solo se escucha al iframe propio y del mismo origen.
  useEffect(() => {
    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseToEditor(event.data);
      if (!message) return;
      if (message.type === 'ready') setReady(true);
      onMessageRef.current(message);
    };
    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, []);

  // Recargar el lienzo (p. ej. tras cambiar ganadoras) vuelve a esperar su aviso.
  useEffect(() => setReady(false), [reloadKey, src]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage(editorMessage({ type: 'state', ...state }), window.location.origin);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [state, ready]);

  useEffect(() => {
    if (!ready || !scrollTo) return;
    frameRef.current?.contentWindow?.postMessage(editorMessage({ type: 'scrollTo', key: scrollTo.key }), window.location.origin);
  }, [scrollTo, ready]);

  const gutter = 32;
  const fit = size.width > 0 ? Math.min(1, (size.width - gutter) / width) : 1;
  const scale = zoom === 'fit' ? fit : zoom;
  const visibleHeight = Math.max(320, size.height - gutter);
  const frameHeight = Math.round(visibleHeight / scale);

  return (
    <div ref={boxRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-muted/70">
      <div
        className={cn('mx-auto my-4 overflow-hidden bg-background shadow-xl ring-1 ring-border', phoneFrame ? 'rounded-[1.75rem] ring-4 ring-foreground/80' : 'rounded-lg')}
        style={{ width: Math.round(width * scale), height: Math.round(frameHeight * scale) }}
      >
        <iframe
          key={reloadKey}
          ref={frameRef}
          src={src}
          title="Lienzo del editor visual del sitio"
          style={{ width, height: frameHeight, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, display: 'block' }}
        />
      </div>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-muted-foreground shadow-card">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Cargando el sitio…
          </span>
        </div>
      )}
    </div>
  );
}
