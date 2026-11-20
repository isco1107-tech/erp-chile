'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';
import { CanvasText } from '@/components/web-sites/site/CanvasScene';
import { CANVAS_TEXT_LIMIT, CANVAS_TEXT_RUN_LIMIT, type CanvasElement, type CanvasTextRun } from '@/lib/web-sites/canvas';

export type CanvasTextValue = Pick<CanvasElement, 'text' | 'richText'>;
type Mark = 'bold' | 'italic' | 'underline';

const FORMATS = [
  { mark: 'bold', label: 'Negrita', key: 'b', Icon: Bold },
  { mark: 'italic', label: 'Cursiva', key: 'i', Icon: Italic },
  { mark: 'underline', label: 'Subrayado', key: 'u', Icon: Underline },
] as const;

function readText(field: HTMLElement): CanvasTextValue {
  const runs: CanvasTextRun[] = [];
  let length = 0;

  function append(value: string, marks: Omit<CanvasTextRun, 'text'>) {
    const text = value.replace(/\u00a0/g, ' ').slice(0, CANVAS_TEXT_LIMIT - length);
    if (!text) return;
    length += text.length;
    const last = runs.at(-1);
    if (last && last.bold === marks.bold && last.italic === marks.italic && last.underline === marks.underline) last.text += text;
    else runs.push({ ...marks, text });
  }

  function visit(parent: HTMLElement, marks: Omit<CanvasTextRun, 'text'>) {
    let precedingBlock = false;
    for (const [index, node] of Array.from(parent.childNodes).entries()) {
      if (length >= CANVAS_TEXT_LIMIT) break;
      const block = node instanceof HTMLElement && (node.tagName === 'DIV' || node.tagName === 'P');
      if (index && (precedingBlock || block)) append('\n', {});
      precedingBlock = block;
      if (node.nodeType === Node.TEXT_NODE) append(node.textContent ?? '', marks);
      else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          if (parent.childNodes.length > 1) append('\n', marks);
          continue;
        }
        visit(node, {
          bold: node.matches('b,strong') || node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600 ? true : marks.bold,
          italic: node.matches('i,em') || node.style.fontStyle === 'italic' ? true : marks.italic,
          underline: node.tagName === 'U' || node.style.textDecorationLine.includes('underline') ? true : marks.underline,
        });
      }
    }
  }

  visit(field, {});
  return {
    text: runs.map(({ text }) => text).join(''),
    richText: runs.length <= CANVAS_TEXT_RUN_LIMIT && runs.some((run) => run.bold || run.italic || run.underline) ? runs : undefined,
  };
}

export function PageantInlineText({ name, initial, toolbarBelow, onChange, onClose }: {
  name: string;
  initial: CanvasTextValue;
  toolbarBelow: boolean;
  onChange: (value: CanvasTextValue) => void;
  onClose: () => void;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const [active, setActive] = useState('');
  const focus = useCallback((field: HTMLDivElement | null) => {
    fieldRef.current = field;
    field?.focus();
  }, []);

  function rememberRange() {
    const selection = window.getSelection();
    if (selection?.rangeCount && fieldRef.current?.contains(selection.anchorNode) && fieldRef.current.contains(selection.focusNode)) {
      lastRange.current = selection.getRangeAt(0).cloneRange();
      setActive(FORMATS.filter(({ mark }) => document.queryCommandState(mark)).map(({ key }) => key).join(''));
    }
  }

  function format(mark: Mark) {
    const field = fieldRef.current;
    if (!field) return;
    if (document.activeElement !== field) {
      field.focus();
      const range = lastRange.current;
      if (range && field.contains(range.commonAncestorContainer)) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    document.execCommand(mark);
    rememberRange();
    onChange(readText(field));
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onChange(initial);
      onClose();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const tool = FORMATS.find(({ key }) => key === event.key.toLowerCase());
    if (!tool && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (tool) format(tool.mark);
    else onClose();
  }

  return (
    <div className="absolute inset-0 z-20 cursor-text" onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()} onKeyDown={keyDown}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}>
      <div role="group" aria-label="Formato de la selección"
        className={`absolute left-0 z-10 flex w-max max-w-[90vw] gap-1 rounded-md border border-slate-300 bg-slate-50 p-1 font-sans text-slate-900 shadow-md ${toolbarBelow ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
        {FORMATS.map(({ mark, label, key, Icon }) => (
          <button key={mark} type="button" aria-label={label} aria-pressed={active.includes(key)} title={label}
            className="grid size-7 place-items-center rounded hover:bg-slate-200 focus-visible:outline-sky-600 aria-pressed:bg-sky-200"
            onMouseDown={(event) => { rememberRange(); event.preventDefault(); }}
            onClick={() => format(mark)}><Icon size={15} aria-hidden="true" /></button>
        ))}
      </div>
      <div
        ref={focus} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={`Editar ${name}`}
        className="h-full min-h-8 w-full overflow-auto whitespace-pre-wrap break-words rounded border border-sky-400 bg-white p-1 font-normal text-slate-900 outline-none"
        onSelect={rememberRange} onKeyUp={rememberRange} onMouseUp={rememberRange}
        onInput={(event) => { rememberRange(); onChange(readText(event.currentTarget)); }}
        onBeforeInput={(event) => {
          const text = event.currentTarget.textContent ?? '';
          const incoming = (event.nativeEvent as InputEvent).data ?? '';
          if (text.length - (window.getSelection()?.toString().length ?? 0) + incoming.length > CANVAS_TEXT_LIMIT) event.preventDefault();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const size = event.currentTarget.textContent?.length ?? 0;
          const available = CANVAS_TEXT_LIMIT - size + (window.getSelection()?.toString().length ?? 0);
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain').slice(0, Math.max(0, available)));
        }}
        onDrop={(event) => event.preventDefault()}
      ><CanvasText element={initial} /></div>
    </div>
  );
}
