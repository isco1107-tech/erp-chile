'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Copy, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { EditorAction, EditorKey, InlineField, ToEditorMessage } from '@/lib/events/pageant-editor-protocol';
import { INLINE_FIELDS } from '@/lib/events/pageant-editor-protocol';

/**
 * Capa de edición del lienzo (dentro del iframe del editor visual). No toca el
 * HTML del sitio: lee dónde está cada sección (`data-edit-key` de las propias,
 * `data-block-id` de las del estudio) y dibuja encima, en coordenadas del
 * documento, el contorno al pasar y al seleccionar, la barra de acciones, los
 * puntos «+ Agregar aquí» entre secciones y el editor de textos en el lugar
 * (doble clic sobre un texto marcado con `data-edit-field`).
 *
 * Todo cambio se pide al panel por `send`: el panel es la única fuente del
 * borrador y lo devuelve con el cambio ya aplicado.
 */

type Outgoing = ToEditorMessage extends infer M ? (M extends { channel: unknown } ? Omit<M, 'channel'> : never) : never;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface OverlayItemInfo {
  label: string;
  kind: 'section' | 'block' | 'footer';
}

interface InlineEdit {
  key: EditorKey;
  field: InlineField;
  element: HTMLElement;
  box: Box;
  style: CSSProperties;
  value: string;
  /** Texto con que se abrió: si no cambia, no se pide nada al panel. */
  initial: string;
  multiline: boolean;
}

const KEY_SELECTOR = '[data-edit-key], [data-block-id]';

function keyOf(element: Element): EditorKey | null {
  const host = element.closest(KEY_SELECTOR);
  if (!host) return null;
  const editKey = host.getAttribute('data-edit-key');
  if (editKey) return editKey as EditorKey;
  const blockId = host.getAttribute('data-block-id');
  return blockId ? (`block:${blockId}` as EditorKey) : null;
}

function documentBox(element: Element): Box | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height };
}

function union(a: Box, b: Box): Box {
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  return { top, left, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
}

/** Dónde está cada elemento editable ahora y en qué orden se ven (de arriba abajo). */
function measure(): { boxes: Map<EditorKey, Box>; order: EditorKey[]; height: number } {
  const boxes = new Map<EditorKey, Box>();
  document.querySelectorAll(KEY_SELECTOR).forEach((element) => {
    // Un bloque del estudio vive dentro de su tramo: se toma el elemento más cercano con clave.
    const key = element.getAttribute('data-edit-key') ?? (element.getAttribute('data-block-id') ? `block:${element.getAttribute('data-block-id')}` : null);
    if (!key) return;
    const box = documentBox(element);
    if (!box) return;
    const previous = boxes.get(key as EditorKey);
    boxes.set(key as EditorKey, previous ? union(previous, box) : box);
  });
  const order = [...boxes.entries()].filter(([key]) => key !== 'footer').sort((a, b) => a[1].top - b[1].top).map(([key]) => key);
  return { boxes, order, height: document.documentElement.scrollHeight };
}

/** Tipografía del texto que se edita, para que el cuadro de escritura se vea igual que el sitio. */
function textStyle(element: HTMLElement): CSSProperties {
  const computed = window.getComputedStyle(element);
  return {
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight as CSSProperties['fontWeight'],
    fontStyle: computed.fontStyle,
    fontSizeAdjust: computed.fontSizeAdjust as CSSProperties['fontSizeAdjust'],
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight,
    textTransform: computed.textTransform as CSSProperties['textTransform'],
    textAlign: computed.textAlign as CSSProperties['textAlign'],
    color: computed.color,
  };
}

const ACTIONS: Record<OverlayItemInfo['kind'], Array<{ action: EditorAction; label: string; Icon: typeof ArrowUp; danger?: boolean }>> = {
  section: [
    { action: 'up', label: 'Subir', Icon: ArrowUp },
    { action: 'down', label: 'Bajar', Icon: ArrowDown },
    { action: 'hide', label: 'Ocultar', Icon: EyeOff },
  ],
  block: [
    { action: 'up', label: 'Subir', Icon: ArrowUp },
    { action: 'down', label: 'Bajar', Icon: ArrowDown },
    { action: 'duplicate', label: 'Duplicar', Icon: Copy },
    { action: 'hide', label: 'Ocultar', Icon: EyeOff },
    { action: 'delete', label: 'Eliminar', Icon: Trash2, danger: true },
  ],
  footer: [],
};

export function EditOverlay({
  selected,
  info,
  inlineValue,
  send,
  onSelect,
  version,
}: {
  selected: EditorKey | null;
  info: (key: EditorKey) => OverlayItemInfo;
  /** Texto inicial al editar en el lugar (la descripción y la frase salen del borrador, no del HTML). */
  inlineValue: (key: EditorKey, field: InlineField, element: HTMLElement) => string;
  send: (message: Outgoing) => void;
  onSelect: (key: EditorKey | null) => void;
  /** Cambia con cada borrador: vuelve a medir. */
  version: unknown;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ boxes: Map<EditorKey, Box>; order: EditorKey[]; height: number }>({ boxes: new Map(), order: [], height: 0 });
  const [hovered, setHovered] = useState<EditorKey | null>(null);
  const [inline, setInline] = useState<InlineEdit | null>(null);
  // La edición en curso también en una referencia (los manejadores del documento la leen al instante).
  const inlineRef = useRef<InlineEdit | null>(null);
  const writeInline = useCallback((next: InlineEdit | null) => {
    inlineRef.current = next;
    setInline(next);
  }, []);
  const frame = useRef(0);

  const lastOrder = useRef('');
  const remeasure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const next = measure();
      setLayout(next);
      // Al panel solo le importa qué se ve y en qué orden: se le avisa cuando cambia.
      const signature = next.order.join('|');
      if (signature !== lastOrder.current) {
        lastOrder.current = signature;
        send({ type: 'rendered', keys: next.order });
      }
    });
  }, [send]);

  // Medir con cada borrador y cada vez que algo cambia de tamaño, se carga o termina de animarse.
  useLayoutEffect(() => {
    remeasure();
  }, [version, remeasure]);
  useEffect(() => {
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    resize?.observe(document.body);
    const mutations = new MutationObserver((records) => {
      // Lo que cambia dentro de la propia capa no mueve el sitio.
      if (records.every((record) => layerRef.current?.contains(record.target))) return;
      remeasure();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'], characterData: true });
    window.addEventListener('resize', remeasure);
    document.addEventListener('load', remeasure, true);
    document.addEventListener('transitionend', remeasure, true);
    document.addEventListener('animationend', remeasure, true);
    void document.fonts?.ready.then(remeasure);
    return () => {
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', remeasure);
      document.removeEventListener('load', remeasure, true);
      document.removeEventListener('transitionend', remeasure, true);
      document.removeEventListener('animationend', remeasure, true);
      cancelAnimationFrame(frame.current);
    };
  }, [remeasure]);

  const closeInline = useCallback(
    (commit: boolean) => {
      const current = inlineRef.current;
      if (!current) return;
      // Se suelta de inmediato: el blur y el clic que lo provocó no guardan dos veces.
      writeInline(null);
      current.element.style.visibility = '';
      if (commit && current.value !== current.initial) send({ type: 'editText', key: current.key, field: current.field, value: current.value });
    },
    [send, writeInline]
  );

  const openInline = useCallback(
    (element: HTMLElement) => {
      const field = element.getAttribute('data-edit-field') as InlineField | null;
      const key = keyOf(element);
      if (!field || !key || !(INLINE_FIELDS as readonly string[]).includes(field)) return;
      const box = documentBox(element);
      if (!box) return;
      // Otro texto abierto se guarda antes de abrir este.
      if (inlineRef.current) closeInline(true);
      const multiline = field === 'description';
      element.style.visibility = 'hidden';
      onSelect(key);
      send({ type: 'select', key });
      const value = inlineValue(key, field, element);
      writeInline({ key, field, element, box, style: textStyle(field === 'description' ? (element.querySelector('p') ?? element) : element), value, initial: value, multiline });
    },
    [closeInline, inlineValue, onSelect, send, writeInline]
  );

  // Clic = seleccionar (nada navega ni se abre); doble clic sobre un texto = editarlo ahí mismo.
  useEffect(() => {
    const insideLayer = (target: EventTarget | null) => target instanceof Node && Boolean(layerRef.current?.contains(target));
    const onClick = (event: MouseEvent) => {
      if (insideLayer(event.target) || !(event.target instanceof Element)) return;
      event.preventDefault();
      event.stopPropagation();
      if (inlineRef.current) {
        closeInline(true);
        return;
      }
      const key = keyOf(event.target);
      onSelect(key);
      send({ type: 'select', key });
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (insideLayer(event.target) || !(event.target instanceof Element)) return;
      const element = event.target.closest('[data-edit-field]');
      if (!(element instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopPropagation();
      openInline(element);
    };
    const onOver = (event: MouseEvent) => {
      if (insideLayer(event.target) || !(event.target instanceof Element)) return;
      const key = keyOf(event.target);
      setHovered((previous) => (previous === key ? previous : key));
    };
    const onLeave = () => setHovered(null);
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', onDoubleClick, true);
    document.addEventListener('mouseover', onOver, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDoubleClick, true);
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [closeInline, onSelect, openInline, send]);

  // Si el elemento editado desaparece (otro cambio lo quitó), se cierra sin guardar.
  useEffect(() => {
    if (inline && !inline.element.isConnected) closeInline(false);
  }, [inline, version, closeInline]);

  const selectedBox = selected ? layout.boxes.get(selected) : undefined;
  const hoveredBox = hovered && hovered !== selected ? layout.boxes.get(hovered) : undefined;
  const selectedInfo = selected ? info(selected) : null;

  // Puntos para insertar: antes del primero, entre cada par visible y después del último.
  const inserts: Array<{ y: number; after: EditorKey | null; before: EditorKey | null }> = [];
  layout.order.forEach((key, index) => {
    const box = layout.boxes.get(key)!;
    if (index === 0) inserts.push({ y: box.top, after: null, before: key });
    const next = layout.order[index + 1];
    const nextBox = next ? layout.boxes.get(next) : undefined;
    inserts.push({ y: nextBox ? (box.top + box.height + nextBox.top) / 2 : box.top + box.height, after: key, before: next ?? null });
  });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={layerRef} data-edit-layer="" className="pointer-events-none absolute inset-x-0 top-0 z-[2147483000]" style={{ height: layout.height }}>
      {hoveredBox && (
        <div className="absolute rounded-sm ring-2 ring-primary/70 ring-inset" style={{ top: hoveredBox.top, left: hoveredBox.left, width: hoveredBox.width, height: hoveredBox.height }}>
          <span className="absolute left-2 top-2 rounded bg-primary/90 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">{info(hovered!).label}</span>
        </div>
      )}

      {selectedBox && selectedInfo && (
        <div className="absolute rounded-sm ring-[3px] ring-primary ring-inset" style={{ top: selectedBox.top, left: selectedBox.left, width: selectedBox.width, height: selectedBox.height }}>
          <div className="pointer-events-auto sticky top-2 ml-2 mt-2 inline-flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg bg-primary p-1 text-primary-foreground shadow-lg">
            <span className="flex items-center gap-1 px-1.5 text-xs font-semibold">
              <Pencil className="size-3" aria-hidden="true" />
              {selectedInfo.label}
            </span>
            {ACTIONS[selectedInfo.kind].map(({ action, label, Icon, danger }) => (
              <button
                key={action}
                type="button"
                title={label}
                aria-label={`${label} «${selectedInfo.label}»`}
                onClick={() => send({ type: 'action', key: selected!, action })}
                className={`grid size-7 place-items-center rounded-md hover:bg-primary-foreground/15 ${danger ? 'text-danger hover:bg-danger/20' : ''}`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </button>
            ))}
            {selectedInfo.kind !== 'footer' && (
              <button
                type="button"
                onClick={() => send({ type: 'insert', after: selected, before: null })}
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-primary-foreground/15"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Agregar debajo
              </button>
            )}
          </div>
        </div>
      )}

      {!inline &&
        inserts.map((point) => (
          <div
            key={`${point.after ?? 'inicio'}-${point.before ?? 'fin'}`}
            className="group pointer-events-auto absolute inset-x-0 flex h-4 -translate-y-1/2 items-center justify-center"
            style={{ top: point.y }}
          >
            <span className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            <button
              type="button"
              onClick={() => send({ type: 'insert', after: point.after, before: point.before })}
              className="relative flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground opacity-0 shadow-lg outline-none transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Agregar sección aquí
            </button>
          </div>
        ))}

      {inline && (
        <InlineEditor
          edit={inline}
          onChange={(value) => {
            const current = inlineRef.current;
            if (current) writeInline({ ...current, value });
          }}
          onCommit={() => closeInline(true)}
          onCancel={() => closeInline(false)}
        />
      )}
    </div>,
    document.body
  );
}

function InlineEditor({ edit, onChange, onCommit, onCancel }: { edit: InlineEdit; onChange: (value: string) => void; onCommit: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.select();
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(edit.box.height, element.scrollHeight)}px`;
  }, [edit.value, edit.box.height]);
  return (
    <div className="pointer-events-auto absolute" style={{ top: edit.box.top - 6, left: edit.box.left - 6, width: Math.max(edit.box.width, 160) + 12 }}>
      <textarea
        ref={ref}
        value={edit.value}
        aria-label="Editar texto"
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          // Una línea: Enter guarda. Varios párrafos: Enter es salto y Ctrl/⌘ + Enter guarda.
          if (event.key === 'Enter' && (!edit.multiline || event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onCommit();
          }
        }}
        className="block w-full resize-none overflow-hidden rounded-md bg-transparent p-1.5 outline-none ring-2 ring-primary"
        style={edit.style}
      />
      <p className="mt-1 inline-block rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow">
        {edit.multiline ? 'Ctrl + Enter para guardar · Esc para cancelar · línea en blanco = otro párrafo' : 'Enter para guardar · Esc para cancelar'}
      </p>
    </div>
  );
}
