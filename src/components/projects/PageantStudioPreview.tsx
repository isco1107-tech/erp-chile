'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { applyDraftToSite } from '@/lib/events/pageant-editor-draft';
import { buildPageantView } from '@/lib/events/pageant-site';
import { formatCurrency } from '@/lib/chile/tax';
import { PAGEANT_INSERTIONS } from '@/lib/events/pageant-site-design';
import { PAGEANT_INSERT_TOOL_LABELS, PAGEANT_STUDIO_CHANNEL, pageantStudioShortcut, type PageantStudioState, type PreviewToStudio, type StudioToPreview } from '@/lib/events/pageant-studio';
import { BLOCK_INFO } from '@/lib/web-sites/blocks';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { PageantPage } from '@/components/public/pageant/PageantPage';
import { PageantCanvasLayer } from './PageantCanvasLayer';
import { PageantNativeTextEditor } from './PageantNativeTextEditor';
import { pageantDrop, readPageantItem } from './pageant-board';

const DRAG_BLOCK = 'application/x-pageant-block';
const PREVIEW_CSS = `
[data-pageant-insertion][data-empty]{display:none}
.pgs-section+[data-pageant-insertion],[data-pageant-insertion=before],[data-pageant-insertion=afterHero],[data-pageant-insertion=beforeFooter],[data-pageant-insertion=after]{display:block!important}
[data-pageant-insertion=before]{padding-top:4rem;background:#0f172a}
[data-studio-editing] .pgs-top{background:#111827e8}
[data-studio-placing] :is(.pgs-hero,.pgs-section,.pgs-footer,.ws-canvas){cursor:crosshair;outline:2px dashed #38bdf8;outline-offset:-2px}
[data-studio-placing] :is(.pgs-hero,.pgs-section,.pgs-footer,.ws-canvas) *{cursor:crosshair!important}
[data-studio-layer]:focus-visible{outline:2px solid #38bdf8!important}
[data-studio-moving] [data-pageant-item]{cursor:grab;touch-action:none;user-select:none;outline:1px dashed #38bdf8;outline-offset:3px}
[data-studio-moving] [data-pageant-item]:is(:hover,:focus-visible){outline:2px solid #38bdf8}
[data-studio-moving] .pgs-hero-cover::after{pointer-events:none}
`;

function send(message: PreviewToStudio) {
  window.parent.postMessage({ ...message, channel: PAGEANT_STUDIO_CHANNEL }, window.location.origin);
}

export function PageantStudioPreview({ saved, at, baseUrl }: { saved: PublicPageantSite; at: string; baseUrl: string }) {
  const [state, setState] = useState<PageantStudioState>();
  const root = useRef<HTMLDivElement>(null);
  const moving = useRef<{ id: number; item: NonNullable<ReturnType<typeof readPageantItem>>; dx: number; dy: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string }>();
  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && !document.querySelector('.pgs-dialog-overlay, .pgs-menu')) {
      send({ type: 'close' });
      return;
    }
    if (!state?.editing) return;
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input,textarea,select'));
    const command = pageantStudioShortcut(event, typing);
    if (!command || command === 'paste') return;
    if ((command === 'copy' || command === 'cut' || command === 'delete' || command === 'duplicate') && !(state.layerIds?.length || state.layerId)) return;
    if ((command === 'copy' || command === 'cut') && window.getSelection()?.toString()) return;
    event.preventDefault();
    send({ type: 'command', command });
  });
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    if (!state?.editing || (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input,textarea,select')))) return;
    const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      send({ type: 'imagePaste', file });
    } else if (state.canPaste) {
      event.preventDefault();
      send({ type: 'command', command: 'paste' });
    }
  });
  useEffect(() => {
    function receive(event: MessageEvent<StudioToPreview & { channel: string }>) {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== PAGEANT_STUDIO_CHANNEL) return;
      if (event.data.type === 'state') setState(event.data.state);
      if (event.data.type === 'scroll') {
        const selector = event.data.region
          ? `[data-pageant-overlay="${CSS.escape(event.data.region)}"]`
          : `[data-block-id="${CSS.escape(event.data.id)}"]`;
        document.querySelector(selector)?.scrollIntoView({ block: 'center' });
      }
    }
    const onKeyDown = (event: KeyboardEvent) => keyboard(event);
    window.addEventListener('message', receive);
    window.addEventListener('keydown', onKeyDown);
    const onClipboard = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener('paste', onClipboard);
    send({ type: 'ready' });
    return () => {
      window.removeEventListener('message', receive);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onClipboard);
    };
  }, []);
  const movingContent = Boolean(state?.movingContent);
  useEffect(() => {
    if (!movingContent || !root.current) return;
    const added = Array.from(root.current.querySelectorAll<HTMLElement>('[data-pageant-item]:not([tabindex]):not(a)'))
      .filter((element) => readPageantItem(element));
    for (const element of added) element.tabIndex = 0;
    return () => { for (const element of added) element.removeAttribute('tabindex'); };
  }, [movingContent]);
  const site = useMemo(() => state ? applyDraftToSite(saved, { ...state.content, design: state.design }, false) : saved, [saved, state]);
  const view = useMemo(() => buildPageantView(site, new Date(at), baseUrl, formatCurrency), [site, at, baseUrl]);
  const selection = state?.selection;
  const selectedCanvas = selection?.region ? state?.design.overlays?.[selection.region]
    : state?.design.blocks.find((block) => block.id === selection?.id)?.style.canvas;
  const selectedLayers = selectedCanvas?.elements.filter((layer) => state?.layerIds ? state.layerIds.includes(layer.id) : state?.layerId === layer.id) ?? [];

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    if (state?.editing && state.inserting) {
      const point = pageantDrop(event.target, event.clientX, event.clientY);
      if (point) {
        event.preventDefault();
        event.stopPropagation();
        send({ type: 'place', ...point });
        return;
      }
    }

    const href = event.target.closest('a')?.getAttribute('href');
    if ((href && !href.startsWith('#')) || event.target.closest('form input[type=file]')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function grab(event: PointerEvent<HTMLDivElement>) {
    if (!state?.editing || !state.movingContent || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element) || event.target.closest('[data-studio-layer]')) return;
    const node = event.target.closest<HTMLElement>('[data-pageant-item]');
    const item = node && readPageantItem(node);
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    moving.current = { id: event.pointerId, item, dx: event.clientX - item.rect.x, dy: event.clientY - item.rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setGhost({ x: event.clientX, y: event.clientY, label: item.content.name ?? 'Elemento' });
  }

  function placeNativeItem(item: NonNullable<ReturnType<typeof readPageantItem>>, point: NonNullable<ReturnType<typeof pageantDrop>>) {
    const scaleFont = (size: number, width: number) => Math.min(160, Math.max(11, size * width / point.canvasWidth));
    const fontSize = 'fontSize' in item.content ? item.content.fontSize : undefined;
    const font = fontSize ? {
      fontSize: scaleFont(fontSize, 1200),
      tabletFontSize: scaleFont(fontSize, 768),
      mobileFontSize: scaleFont(fontSize, 390),
    } : {};
    send({ type: 'relocate', ...point, key: item.key, content: {
      ...item.content,
      ...font,
      desktop: { x: point.x, y: point.y, width: item.rect.width / point.canvasWidth * 100, height: item.rect.height / point.canvasHeight * 100 },
    } });
  }

  function drop(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = moving.current;
    if (gesture?.id !== event.pointerId) return;
    moving.current = null;
    setGhost(undefined);
    if (cancelled) return;
    const { item, dx, dy } = gesture;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const point = pageantDrop(element, event.clientX - dx, event.clientY - dy);
    if (point) placeNativeItem(item, point);
  }

  return (
    <div ref={root} data-studio-editing={state?.editing || undefined} data-studio-placing={state?.inserting || undefined} data-studio-moving={movingContent || undefined}
      onClickCapture={onClickCapture}
      onPointerDownCapture={grab}
      onKeyDownCapture={(event) => {
        if (!movingContent || event.key !== 'Enter' || !(event.target instanceof HTMLElement) || !event.target.matches('[data-pageant-item]')) return;
        const item = readPageantItem(event.target);
        const point = item && pageantDrop(event.target, item.rect.x, item.rect.y);
        if (!item || !point) return;
        event.preventDefault();
        event.stopPropagation();
        placeNativeItem(item, point);
      }}
      onPointerMove={(event) => {
        if (moving.current?.id === event.pointerId) setGhost((previous) => previous ? { ...previous, x: event.clientX, y: event.clientY } : previous);
      }}
      onPointerUp={drop}
      onPointerCancel={(event) => drop(event, true)}
      onLostPointerCapture={(event) => drop(event, true)}
      onDragOver={(event) => {
        if (state?.editing && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        if (!state?.editing) return;
        const point = pageantDrop(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY);
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));
        if (file && point) send({ type: 'imageDrop', file, ...point });
      }}
      onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      <style>{PREVIEW_CSS}</style>
      {ghost && <span aria-hidden="true" className="pointer-events-none fixed z-[1000] max-w-64 truncate rounded-md bg-sky-700 px-3 py-2 text-sm text-white shadow-lg" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>{ghost.label}</span>}
      <PageantPage site={site} view={view} layerEditor={state?.editing ? {
        selectedId: state.selection?.id,
        onSelect: (id) => send({ type: 'select', id }),
        renderNativeText: state.inserting || state.movingContent ? undefined : (field, children) => (
          <PageantNativeTextEditor field={field} value={state.nativeText[field]} onChange={(value) => send({ type: 'nativeText', field, value })}>{children}</PageantNativeTextEditor>
        ),
        renderInsertion: (target, block) => (
          <div className="flex min-h-9 items-center justify-center gap-2 border-y border-slate-300 bg-slate-100 px-2 py-1 font-sans text-slate-900"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(DRAG_BLOCK)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              const id = event.dataTransfer.getData(DRAG_BLOCK);
              if (!id) return;
              event.preventDefault();
              send({ type: 'move', id, target });
            }}
          >
            <button type="button" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold hover:border-sky-600 focus-visible:outline-sky-600"
              aria-label={`${state.inserting === 'paste' ? 'Pegar capas' : state.inserting ? 'Colocar ' + PAGEANT_INSERT_TOOL_LABELS[state.inserting].toLowerCase() : 'Insertar'} · ${block ? 'Antes de ' + BLOCK_INFO[block.type].label : PAGEANT_INSERTIONS[target.slot]}`}
              onClick={() => send({ type: 'insert', target })}
            >+ {state.inserting ? PAGEANT_INSERT_TOOL_LABELS[state.inserting] : 'Insertar'}</button>
            {block && (
              <button type="button" draggable
                className="max-w-[65%] truncate rounded px-2 py-1 text-xs hover:bg-slate-200 focus-visible:outline-sky-600"
                title="Selecciona o arrastra la sección"
                onClick={() => send({ type: 'select', id: block.id })}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_BLOCK, block.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
              >⠿ {block.style.canvas?.replaceContent ? 'Lienzo libre' : BLOCK_INFO[block.type].label}{block.hidden ? ' · Oculta' : ''}</button>
            )}
          </div>
        ),
        renderCanvasLayer: (id, layer, style, children) => (
          <PageantCanvasLayer target={{ id }} layer={layer} style={style} selection={selection?.id === id ? selectedLayers : []}
            placing={Boolean(state.inserting)} snap={state.snap} send={send}>{children}</PageantCanvasLayer>
        ),
        renderNativeLayer: (region, layer, style, children) => (
          <PageantCanvasLayer target={{ region }} layer={layer} style={style} selection={selection?.region === region ? selectedLayers : []}
            placing={Boolean(state.inserting)} snap={state.snap} send={send}>{children}</PageantCanvasLayer>
        ),
      } : undefined} />
    </div>
  );
}
