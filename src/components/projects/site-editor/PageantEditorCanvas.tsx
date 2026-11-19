'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageantPage } from '@/components/public/pageant/PageantPage';
import { formatCurrency } from '@/lib/chile/tax';
import { applyDraftToSite, pageantEditorDraftSchema, type PageantEditorDraft } from '@/lib/events/pageant-editor-draft';
import { editorMessage, parseToCanvas, type EditorKey, type InlineField, type ToEditorMessage } from '@/lib/events/pageant-editor-protocol';
import { PAGEANT_SECTION_INFO, parseItemKey } from '@/lib/events/pageant-layout';
import { buildPageantView, type PageantAudience } from '@/lib/events/pageant-site';
import { BLOCK_INFO } from '@/lib/web-sites/blocks';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { EditOverlay, type OverlayItemInfo } from './EditOverlay';

type Outgoing = ToEditorMessage extends infer M ? (M extends { channel: unknown } ? Omit<M, 'channel'> : never) : never;

/**
 * Lienzo del editor visual: el sitio REAL del certamen (los mismos componentes
 * que el público) dentro de un iframe del tamaño del dispositivo, así las
 * pantallas de teléfono y tableta se ven de verdad. Recibe el borrador del panel
 * por `postMessage` (solo del panel que lo contiene y del mismo origen), lo pinta
 * sobre los datos del certamen y le devuelve lo que la persona hace.
 *
 * En el lienzo nada sale del sitio: los enlaces externos no navegan y los
 * formularios no se envían (ni en el modo «Probar»).
 */
export function PageantEditorCanvas({ base, now, baseUrl }: { base: PublicPageantSite; now: string; baseUrl: string }) {
  const [draft, setDraft] = useState<PageantEditorDraft | null>(null);
  const [audience, setAudience] = useState<PageantAudience | null>(null);
  const [mode, setMode] = useState<'edit' | 'test'>('edit');
  const [selected, setSelected] = useState<EditorKey | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const site = useMemo(() => (draft ? applyDraftToSite(base, draft) : base), [base, draft]);
  const view = useMemo(() => buildPageantView(site, new Date(now), baseUrl, formatCurrency), [site, now, baseUrl]);

  const send = useCallback((message: Outgoing) => {
    if (window.parent === window) return;
    window.parent.postMessage(editorMessage(message), window.location.origin);
  }, []);

  useEffect(() => {
    const parent = window.parent;
    if (parent === window) return; // Abierto aparte: solo se mira.
    setEmbedded(true);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== parent) return;
      const message = parseToCanvas(event.data);
      if (!message) return;
      if (message.type === 'state') {
        const parsed = pageantEditorDraftSchema.safeParse(message.draft);
        if (parsed.success) setDraft(parsed.data);
        setAudience(message.audience);
        setMode(message.mode);
        setSelected(message.selected);
      } else if (message.type === 'scrollTo') {
        const element = findElement(message.key);
        if (element) window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - 80), behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMessage);
    parent.postMessage(editorMessage({ type: 'ready' }), window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Nada sale del lienzo: ni enlaces a otras páginas ni envíos de formularios.
  useEffect(() => {
    if (!embedded) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]');
      if (!link || (link.getAttribute('href') ?? '').startsWith('#')) return;
      event.preventDefault();
      send({ type: 'notice', text: 'En el editor los enlaces no salen del sitio: pruébalos en el sitio publicado.' });
    };
    const onSubmit = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      send({ type: 'notice', text: 'En el editor los formularios no se envían.' });
    };
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        send({ type: 'shortcut', shortcut: 'save' });
      } else if (!typing && mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        send({ type: 'shortcut', shortcut: event.shiftKey ? 'redo' : 'undo' });
      } else if (!typing && mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        send({ type: 'shortcut', shortcut: 'redo' });
      } else if (!typing && event.key === 'Escape' && modeRef.current === 'edit') {
        setSelected(null);
        send({ type: 'select', key: null });
      }
    };
    window.addEventListener('click', onClick, true);
    window.addEventListener('submit', onSubmit, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [embedded, send]);

  const info = useCallback(
    (key: EditorKey): OverlayItemInfo => {
      if (key === 'footer') return { label: 'Pie de página', kind: 'footer' };
      const item = parseItemKey(key);
      if (item?.kind === 'section') return { label: PAGEANT_SECTION_INFO[item.id].label, kind: 'section' };
      const block = item ? site.creative?.blocks.find((entry) => entry.id === item.id) : undefined;
      const canvas = block?.style.canvas?.enabled && block.style.canvas.replaceContent;
      return { label: block ? (canvas ? 'Lienzo libre' : BLOCK_INFO[block.type].label) : 'Sección', kind: 'block' };
    },
    [site.creative?.blocks]
  );

  const inlineValue = useCallback(
    (_key: EditorKey, field: InlineField, element: HTMLElement) => {
      if (field === 'description') return draft?.description ?? site.description ?? '';
      if (field === 'tagline') return draft?.tagline ?? site.tagline ?? '';
      return element.textContent ?? '';
    },
    [draft?.description, draft?.tagline, site.description, site.tagline]
  );

  return (
    <>
      <PageantPage site={site} view={view} editing={{ audience: audience ?? undefined }} />
      {embedded && mode === 'edit' && (
        <EditOverlay selected={selected} info={info} inlineValue={inlineValue} send={send} onSelect={setSelected} version={draft} />
      )}
    </>
  );
}

function findElement(key: EditorKey): Element | null {
  if (key.startsWith('block:')) return document.querySelector(`[data-block-id="${CSS.escape(key.slice('block:'.length))}"]`);
  return document.querySelector(`[data-edit-key="${CSS.escape(key)}"]`);
}
