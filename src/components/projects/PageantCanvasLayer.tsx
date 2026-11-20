'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { layerBounds, constrainLayerDelta } from '@/lib/events/pageant-layer-operations';
import { snapPageantCanvas, type PageantCanvasRef, type PreviewToStudio } from '@/lib/events/pageant-studio';
import { canvasPosition, constrainPosition, type CanvasDevice, type CanvasElement, type CanvasPosition } from '@/lib/web-sites/canvas';
import { PageantInlineText, type CanvasTextValue } from './PageantInlineText';
import { pageantCanvasDevice, pageantDrop } from './pageant-board';

interface Drag {
  pointerId: number;
  device: CanvasDevice;
  initial: CanvasPosition;
  current: CanvasPosition;
  rect: DOMRect;
  board: HTMLElement;
  others: CanvasPosition[];
  groupIds?: string[];
  x: number;
  y: number;
  resize: boolean;
  moved: boolean;
}

interface Draft {
  position: CanvasPosition;
  board: HTMLElement;
  group: boolean;
  guideX?: number;
  guideY?: number;
}

function clearGroupTranslation(board: HTMLElement) {
  board.style.removeProperty('--studio-group-dx');
  board.style.removeProperty('--studio-group-dy');
}

export function PageantCanvasLayer({ target, layer, style, children, selection, placing, snap, send }: {
  target: PageantCanvasRef; layer: CanvasElement; style: CSSProperties; children: ReactNode;
  selection: CanvasElement[]; placing: boolean; snap: boolean; send: (message: PreviewToStudio) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Draft>();
  const [textEdit, setTextEdit] = useState<{ initial: CanvasTextValue; toolbarBelow: boolean } | null>(null);
  const editingText = textEdit !== null;
  const selected = selection.some((item) => item.id === layer.id);
  const grouped = selected && selection.length > 1;
  const canType = layer.kind === 'text' || layer.kind === 'button';
  const select = (element: HTMLElement, additive = false) => {
    const board = element.closest<HTMLElement>('.ws-canvas');
    send({ type: 'select', ...target, layerId: layer.id, additive, device: board ? pageantCanvasDevice(board) : undefined });
  };

  useEffect(() => () => {
    if (drag.current?.groupIds) clearGroupTranslation(drag.current.board);
  }, []);

  function begin(event: PointerEvent<HTMLElement>, resize = false) {
    if (placing || editingText || event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    const owner = event.currentTarget.closest<HTMLElement>('[data-studio-layer]');
    const board = owner?.closest<HTMLElement>('.ws-canvas');
    if (!owner || !board) return;
    owner.focus({ preventScroll: true });
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      select(owner, true);
      return;
    }
    if (!selected) select(owner);
    if (layer.locked) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const device = pageantCanvasDevice(board);
    const moving = grouped ? selection.filter((item) => !item.locked) : [layer];
    const groupIds = grouped ? moving.map((item) => item.id) : undefined;
    const initial = layerBounds(moving.map((item) => canvasPosition(item, device)));
    if (!initial) return;
    const movingIds = new Set(moving.map((item) => item.id));
    const siblings = Array.from(board.querySelectorAll<HTMLElement>('[data-studio-layer]')).filter((other) => !movingIds.has(other.dataset.studioLayer!) && other.offsetWidth);
    const others = siblings.map((other) => {
      const box = other.getBoundingClientRect();
      return { x: (box.left - rect.left) / rect.width * 100, y: (box.top - rect.top) / rect.height * 100, width: box.width / rect.width * 100, height: box.height / rect.height * 100 };
    });
    drag.current = { pointerId: event.pointerId, device, initial, current: initial, rect, board, others, groupIds, x: event.clientX, y: event.clientY, resize, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const { rect, initial, resize, board } = gesture;
    const dx = (event.clientX - gesture.x) / rect.width * 100;
    const dy = (event.clientY - gesture.y) / rect.height * 100;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 3) return;
    gesture.moved = true;
    const delta = constrainLayerDelta(initial, dx, dy);
    const position = resize
      ? constrainPosition({ ...initial, width: Math.min(100 - initial.x, initial.width + dx), height: Math.min(100 - initial.y, initial.height + dy) })
      : { ...initial, x: initial.x + delta.dx, y: initial.y + delta.dy };
    const snapped = snap && !resize && !event.altKey
      ? snapPageantCanvas(position, gesture.others, 7 / rect.width * 100, 7 / rect.height * 100)
      : { position };
    gesture.current = snapped.position;
    if (gesture.groupIds) {
      board.style.setProperty('--studio-group-dx', `${(snapped.position.x - initial.x) * rect.width / 100}px`);
      board.style.setProperty('--studio-group-dy', `${(snapped.position.y - initial.y) * rect.height / 100}px`);
    }
    setDraft({ ...snapped, board, group: Boolean(gesture.groupIds) });
  }

  function end(event: PointerEvent<HTMLElement>, cancelled = false) {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    setDraft(undefined);
    if (gesture.groupIds) clearGroupTranslation(gesture.board);
    if (cancelled || !gesture.moved) return;
    const { device, current, initial, groupIds } = gesture;
    if (!gesture.resize) {
      const point = pageantDrop(
        document.elementFromPoint(event.clientX, event.clientY),
        event.clientX - (gesture.x - gesture.rect.x - initial.x * gesture.rect.width / 100),
        event.clientY - (gesture.y - gesture.rect.y - initial.y * gesture.rect.height / 100),
      );
      if (point && (point.id !== target.id || point.region !== target.region)) {
        const to = point.region ? { region: point.region } : { id: point.id };
        send({ type: 'transfer', from: target, to, layerIds: groupIds ?? [layer.id], device: point.device, point });
        return;
      }
    }
    if (current.x === initial.x && current.y === initial.y && current.width === initial.width && current.height === initial.height) return;
    if (groupIds) send({ type: 'translate', ...target, layerIds: groupIds, device, dx: current.x - initial.x, dy: current.y - initial.y });
    else send({ type: 'position', ...target, layerId: layer.id, device, position: current });
  }

  function startText(element: HTMLElement) {
    if (!canType || placing || grouped) return;
    select(element);
    const top = element.getBoundingClientRect().top;
    const boardTop = element.closest('.ws-canvas')?.getBoundingClientRect().top ?? 0;
    setTextEdit({ initial: { text: layer.text, richText: layer.richText }, toolbarBelow: top < 85 || top - boardTop < 40 });
  }

  return (
    <div
      className="ws-canvas-element"
      data-kind={layer.kind}
      data-mobile-hidden={layer.mobileHidden || undefined}
      data-studio-layer={layer.id}
      data-pageant-layer={layer.id}
      data-studio-selected={selected || undefined}
      role="group"
      aria-label={layer.name}
      tabIndex={placing ? -1 : 0}
      style={{
        ...style,
        ...(draft && !draft.group && { left: `${draft.position.x}%`, top: `${draft.position.y}%`, width: `${draft.position.width}%`, height: `${draft.position.height}%` }),
        ...(grouped && !layer.locked && { translate: 'var(--studio-group-dx, 0px) var(--studio-group-dy, 0px)' }),
        ...(editingText && { opacity: 1, transform: 'none' }),
        overflow: 'visible',
        outline: selected ? '2px solid #38bdf8' : '1px dashed #94a3b880',
        cursor: placing ? 'crosshair' : layer.locked ? 'default' : 'move',
        touchAction: placing || editingText ? 'auto' : 'none',
        userSelect: editingText ? 'text' : 'none',
      }}
      onClick={(event) => {
        if (placing) return;
        event.stopPropagation();
        if (event.detail === 0 && event.target === event.currentTarget) select(event.currentTarget, event.shiftKey || event.ctrlKey || event.metaKey);
      }}
      onDoubleClick={(event) => { if (!event.shiftKey && !event.ctrlKey && !event.metaKey) startText(event.currentTarget); }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => end(event, true)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || placing) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.shiftKey || event.ctrlKey || event.metaKey) select(event.currentTarget, true);
          else if (canType && !grouped) startText(event.currentTarget);
          else select(event.currentTarget);
          return;
        }
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const offset = offsets[event.key];
        const board = event.currentTarget.closest<HTMLElement>('.ws-canvas');
        if (!offset || !board || layer.locked || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        if (!selected) select(event.currentTarget);
        const device = pageantCanvasDevice(board);
        const step = event.shiftKey ? 5 : 1;
        const dx = offset[0] * step;
        const dy = offset[1] * step;
        if (grouped) {
          send({ type: 'translate', ...target, layerIds: selection.map((item) => item.id), device, dx, dy });
        } else {
          const position = canvasPosition(layer, device);
          send({ type: 'position', ...target, layerId: layer.id, device, position: constrainPosition({ ...position, x: position.x + dx, y: position.y + dy }) });
        }
      }}
    >
      <div className="ws-canvas-motion" style={{ overflow: layer.kind === 'text' ? undefined : 'hidden', pointerEvents: 'none' }}>
        {children}
        {layer.kind === 'image' && !layer.imageUrl && <span className="m-auto rounded bg-slate-800 px-2 py-1 text-xs text-white">Elige una imagen</span>}
      </div>
      {textEdit && (
        <PageantInlineText
          name={layer.name} initial={textEdit.initial} toolbarBelow={textEdit.toolbarBelow}
          onChange={(value) => send({ type: 'text', ...target, layerId: layer.id, value })}
          onClose={() => setTextEdit(null)}
        />
      )}
      {draft && createPortal(
        <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" aria-hidden="true">
          {draft.group && <span data-studio-group-bounds className="absolute border border-dashed border-sky-500" style={{ left: `${draft.position.x}%`, top: `${draft.position.y}%`, width: `${draft.position.width}%`, height: `${draft.position.height}%` }} />}
          {draft.guideX !== undefined && <span className="absolute inset-y-0 w-px bg-fuchsia-500" style={{ left: `${draft.guideX}%` }} />}
          {draft.guideY !== undefined && <span className="absolute inset-x-0 h-px bg-fuchsia-500" style={{ top: `${draft.guideY}%` }} />}
        </div>,
        draft.board,
      )}
      {selected && !grouped && !layer.locked && !placing && !editingText && (
        <button type="button" aria-label={`Redimensionar ${layer.name}`} title="Arrastra para redimensionar"
          tabIndex={-1}
          className="absolute right-0 bottom-0 size-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded border-2 border-white bg-sky-600"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => begin(event, true)} onPointerMove={move} onPointerUp={end}
          onPointerCancel={(event) => end(event, true)} onLostPointerCapture={(event) => end(event, true)}
        />
      )}
    </div>
  );
}
