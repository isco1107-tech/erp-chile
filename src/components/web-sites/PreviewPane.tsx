'use client';

import { memo, useEffect, useId, useRef, useState } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import type { WebSiteTheme } from '@/lib/web-sites/theme';
import type { SiteDocument } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';
import SiteRenderer from './SiteRenderer';
import { DESKTOP_PREVIEW_WIDTH, MOBILE_PREVIEW_WIDTH, TABLET_PREVIEW_WIDTH, type PreviewDevice } from './editor-shared';

/**
 * Pedido para mover la vista previa: ir a lo más alto o bajo, a una sección con
 * título (`anchor`) o a una sección puntual (`blockId`). `id` crece con cada
 * pedido; si trae `pageId`, espera a que esa página sea la que se está mostrando.
 */
export interface PreviewScrollRequest {
  id: number;
  pageId?: string;
  target: 'top' | 'bottom' | 'anchor' | 'block';
  anchor?: string | null;
  blockId?: string | null;
}

type PreviewPaneProps = {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
} & (
  | {
      mode: 'GUIDED';
      name: string;
      logoUrl: string | null;
      theme: WebSiteTheme;
      document: SiteDocument;
      /** Página que se muestra. */
      pageId: string;
      slug: string;
      /** Elegir otra página desde el selector de la barra. */
      onPageChange: (pageId: string) => void;
      /** Se hizo clic en un enlace del sitio (menú, botón): lleva a otra página o sección. */
      onNavigate: (pageId: string, anchor: string | null) => void;
      /** Se hizo clic en una sección: hay que abrirla en el editor. */
      onSelectBlock: (blockId: string) => void;
      selectedBlockId: string | null;
      scrollRequest: PreviewScrollRequest | null;
    }
  | { mode: 'HTML'; srcDoc: string }
);

const DEVICES: { id: PreviewDevice; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Escritorio', Icon: Monitor },
  { id: 'tablet', label: 'Tablet', Icon: Tablet },
  { id: 'mobile', label: 'Celular', Icon: Smartphone },
];

const DEVICE_WIDTH: Record<PreviewDevice, number> = { desktop: DESKTOP_PREVIEW_WIDTH, tablet: TABLET_PREVIEW_WIDTH, mobile: MOBILE_PREVIEW_WIDTH };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lleva `target` a la vista dentro de `container` sin mover la ventana entera
 * (`scrollIntoView` arrastraría también la página del editor). Descuenta el
 * encabezado fijo para que no tape lo que se busca.
 */
function revealInside(container: HTMLElement, target: HTMLElement, mode: 'start' | 'nearest') {
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const header = container.querySelector('header');
  const sticky = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
  const top = box.top + sticky + 8;
  let delta = 0;
  if (mode === 'start') delta = rect.top - top;
  else if (rect.top < top) delta = rect.top - top;
  else if (rect.bottom > box.bottom - 8) delta = Math.min(rect.bottom - box.bottom + 8, rect.top - top);
  if (Math.abs(delta) < 2) return;
  container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

function findBlockElement(container: HTMLElement, blockId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
}

function performScroll(container: HTMLElement, request: PreviewScrollRequest) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  if (request.target === 'top') {
    container.scrollTo({ top: 0, behavior });
  } else if (request.target === 'bottom') {
    container.scrollTo({ top: container.scrollHeight, behavior });
  } else if (request.target === 'anchor') {
    const element = request.anchor ? container.querySelector<HTMLElement>(`[id="${CSS.escape(request.anchor)}"]`) : null;
    if (element) revealInside(container, element, 'start');
    else container.scrollTo({ top: 0, behavior });
  } else {
    const element = (request.blockId ? findBlockElement(container, request.blockId) : null) ?? (request.anchor ? container.querySelector<HTMLElement>(`[id="${CSS.escape(request.anchor)}"]`) : null);
    if (element) revealInside(container, element, 'nearest');
  }
}

/**
 * Vista previa en vivo. En modo guiado usa el mismo renderizador que la página
 * pública (adapta su diseño al ancho de SU contenedor). Para que "Escritorio" y
 * "Tablet" se vean con su diseño real aunque el panel sea angosto, el sitio se
 * dibuja al ancho del aparato y se reduce (`zoom`) hasta que quepa.
 * En HTML propio usa un iframe con `sandbox` VACÍO: sin scripts ni acceso al
 * panel. No agregar valores a ese atributo.
 */
export const PreviewPane = memo(function PreviewPane(props: PreviewPaneProps) {
  const { device, onDeviceChange } = props;
  const pageSelectId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const handledScroll = useRef(0);
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Medidas del marco donde se dibuja el sitio (cambian al redimensionar la ventana o al pasar de una a dos columnas).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const guided = props.mode === 'GUIDED' ? props : null;
  const scrollRequest = guided?.scrollRequest ?? null;
  const shownPageId = guided?.pageId ?? null;
  useEffect(() => {
    const container = viewportRef.current;
    if (!container || !scrollRequest || handledScroll.current === scrollRequest.id) return;
    // La página se cambia con un pequeño retraso (igual que el resto de la vista previa): se espera a que llegue.
    if (scrollRequest.pageId && scrollRequest.pageId !== shownPageId) return;
    const frame = window.requestAnimationFrame(() => {
      handledScroll.current = scrollRequest.id;
      performScroll(container, scrollRequest);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest, shownPageId]);

  const deviceWidth = DEVICE_WIDTH[device];
  // Escritorio ocupa todo el ancho si cabe; si no, se dibuja a 1100 px y se reduce.
  const frameWidth = device === 'desktop' && box.width >= deviceWidth ? box.width : deviceWidth;
  const scale = box.width > 0 ? Math.min(1, box.width / frameWidth) : 1;

  return (
    <section aria-label="Vista previa del sitio" className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Vista previa</h2>
          {guided && guided.document.pages.length > 1 ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <label htmlFor={pageSelectId} className="sr-only">
                Página que ves en la vista previa
              </label>
              <select
                id={pageSelectId}
                value={guided.pageId}
                onChange={(event) => guided.onPageChange(event.target.value)}
                className="h-7 max-w-44 min-w-0 truncate rounded-md border border-input bg-transparent px-2 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {guided.document.pages.map((page, index) => (
                  <option key={page.id} value={page.id}>
                    {page.title}
                    {index === 0 ? ' (inicio)' : page.hidden ? ' (oculta)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div role="group" aria-label="Tamaño de la vista previa" className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {DEVICES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              onClick={() => onDeviceChange(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                device === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" /> <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={viewportRef} className="h-[70vh] min-h-[420px] overflow-auto bg-muted lg:h-[calc(100vh-13rem)]">
        {guided ? (
          <div
            className={cn('mx-auto bg-white shadow-sm', device !== 'desktop' && 'border-x border-border', box.width === 0 && 'w-full')}
            style={box.width > 0 ? { width: frameWidth, zoom: scale, minHeight: box.height / scale } : undefined}
          >
            <SiteRenderer
              name={guided.name}
              logoUrl={guided.logoUrl}
              theme={guided.theme}
              document={guided.document}
              pageId={guided.pageId}
              slug={guided.slug}
              mode="preview"
              basePath={`/web/${guided.slug}`}
              onNavigate={guided.onNavigate}
              onSelectBlock={guided.onSelectBlock}
              selectedBlockId={guided.selectedBlockId}
            />
          </div>
        ) : props.mode === 'HTML' ? (
          <div className={cn('mx-auto h-full bg-white shadow-sm', device !== 'desktop' && 'border-x border-border')} style={device === 'desktop' ? undefined : { width: deviceWidth, maxWidth: '100%' }}>
            <iframe sandbox="" srcDoc={props.srcDoc} title="Vista previa" className="block size-full border-0 bg-white" />
          </div>
        ) : null}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {guided ? 'Haz clic en una sección para editarla · el menú de la vista previa te lleva entre páginas.' : 'Así se verá tu sitio publicado. Los enlaces y el formulario no funcionan en la vista previa.'}
      </p>
    </section>
  );
});
