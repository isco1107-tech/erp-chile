'use client';

import { Fragment, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { textareaClass } from '@/components/ui/field-classes';
import { parseRichText, type RichInline } from '@/lib/web-sites/rich-text';
import { insertLink, toggleInline, toggleLineFormat, type LineFormat, type TextEdit, type TextSelection } from '@/lib/web-sites/rich-text-edit';
import type { SiteDocument } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';
import { LinkField } from './LinkField';

interface RichTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /** Sitio completo y página actual, para que los enlaces puedan llevar a otras páginas o secciones. */
  document: SiteDocument;
  pageId: string;
}

type ToolId = 'bold' | 'italic' | 'link' | 'ul' | 'ol' | 'heading';

const TOOLS: { id: ToolId; label: string; shortcut?: string; Icon: typeof Bold }[] = [
  { id: 'bold', label: 'Negrita', shortcut: 'Ctrl+B', Icon: Bold },
  { id: 'italic', label: 'Cursiva', shortcut: 'Ctrl+I', Icon: Italic },
  { id: 'link', label: 'Enlace', shortcut: 'Ctrl+K', Icon: Link2 },
  { id: 'ul', label: 'Lista', Icon: List },
  { id: 'ol', label: 'Lista numerada', Icon: ListOrdered },
  { id: 'heading', label: 'Subtítulo', Icon: Heading2 },
];

const LINE_FORMATS: Record<'ul' | 'ol' | 'heading', LineFormat> = { ul: 'ul', ol: 'ol', heading: 'heading' };

/**
 * Cuadro de texto con barra de formato: quien no conoce las marcas
 * (`**negrita**`, `[texto](enlace)`…) toca un botón y se insertan solas en la
 * selección. El texto guardado es el mismo de siempre (ver `rich-text.ts`).
 */
export function RichTextField({ label, value, onChange, max, rows = 6, placeholder, hint, disabled, document: siteDocument, pageId }: RichTextFieldProps) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<TextSelection | null>(null);
  const [activeTool, setActiveTool] = useState(0);
  const [linkForm, setLinkForm] = useState<{ range: TextSelection; text: string; href: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Tras aplicar un formato el texto vuelve a pintarse: se devuelve el foco y la selección.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const element = textareaRef.current;
    if (!selection || !element) return;
    pendingSelection.current = null;
    element.focus();
    element.setSelectionRange(selection.start, selection.end);
  }, [value]);

  function currentSelection(): TextSelection {
    const element = textareaRef.current;
    return element ? { start: element.selectionStart, end: element.selectionEnd } : { start: value.length, end: value.length };
  }

  function applyEdit(edit: TextEdit) {
    if (edit.value.length > max) {
      setNotice(`No hay espacio para agregar el formato: el texto llegó al máximo de ${max} caracteres.`);
      return;
    }
    setNotice(null);
    if (edit.value === value) {
      textareaRef.current?.setSelectionRange(edit.selection.start, edit.selection.end);
      textareaRef.current?.focus();
      return;
    }
    pendingSelection.current = edit.selection;
    onChange(edit.value);
  }

  function openLinkForm() {
    const range = currentSelection();
    setLinkForm({ range, text: value.slice(range.start, range.end).trim().slice(0, 200), href: '' });
  }

  function runTool(tool: ToolId) {
    if (tool === 'bold') applyEdit(toggleInline(value, currentSelection(), '**', 'texto en negrita'));
    else if (tool === 'italic') applyEdit(toggleInline(value, currentSelection(), '*', 'texto en cursiva'));
    else if (tool === 'link') openLinkForm();
    else applyEdit(toggleLineFormat(value, currentSelection(), LINE_FORMATS[tool]));
  }

  function submitLink() {
    if (!linkForm) return;
    const edit = insertLink(value, linkForm.range, linkForm.text, linkForm.href);
    if (!edit) return;
    setLinkForm(null);
    applyEdit(edit);
  }

  function closeLinkForm() {
    setLinkForm(null);
    textareaRef.current?.focus();
  }

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || disabled) return;
    const key = event.key.toLowerCase();
    const tool: ToolId | null = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'k' ? 'link' : null;
    if (!tool) return;
    event.preventDefault();
    runTool(tool);
  }

  function onToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (buttons.length === 0) return;
    const current = buttons.findIndex((button) => button === event.currentTarget.ownerDocument.activeElement);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else next = buttons.length - 1;
    event.preventDefault();
    buttons[next]?.focus();
  }

  const helpId = `${id}-help`;
  const countId = `${id}-count`;
  const noticeId = `${id}-notice`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span id={countId} className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {value.length}/{max}
          <span className="sr-only"> caracteres</span>
        </span>
      </div>

      <div role="toolbar" aria-label={`Formato del texto: ${label}`} aria-controls={id} onKeyDown={onToolbarKeyDown} className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1">
        {TOOLS.map((tool, index) => (
          <Button
            key={tool.id}
            type="button"
            size="sm"
            variant="ghost"
            tabIndex={index === activeTool ? 0 : -1}
            disabled={disabled}
            aria-label={tool.label}
            aria-pressed={tool.id === 'link' ? linkForm !== null : undefined}
            title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
            onFocus={() => setActiveTool(index)}
            onClick={() => runTool(tool.id)}
          >
            <tool.Icon aria-hidden="true" />
            <span className="hidden sm:inline">{tool.label}</span>
          </Button>
        ))}
      </div>

      {linkForm ? (
        <div
          role="group"
          aria-label="Agregar un enlace"
          className="space-y-3 rounded-lg border border-ring/50 bg-card p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeLinkForm();
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-link-text`}>Texto que se verá</Label>
            <Input id={`${id}-link-text`} value={linkForm.text} maxLength={200} placeholder="Ej.: ver la carta completa" onChange={(event) => setLinkForm({ ...linkForm, text: event.target.value })} autoFocus />
            <p className="text-xs text-muted-foreground">Es lo que la persona va a tocar. Evita “haz clic aquí”: mejor dile qué va a encontrar.</p>
          </div>
          <LinkField label="¿A dónde lleva el enlace?" value={linkForm.href} onChange={(href) => setLinkForm((previous) => (previous ? { ...previous, href } : previous))} document={siteDocument} pageId={pageId} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={closeLinkForm}>
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={!linkForm.text.trim() || !linkForm.href.trim()} onClick={submitLink}>
              Insertar enlace
            </Button>
          </div>
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        id={id}
        className={cn(textareaClass, 'leading-relaxed')}
        rows={rows}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={[helpId, countId, notice ? noticeId : null].filter(Boolean).join(' ')}
        onChange={(event) => {
          setNotice(null);
          onChange(event.target.value);
        }}
        onKeyDown={onTextareaKeyDown}
      />

      {notice ? (
        <p id={noticeId} role="status" className="text-xs font-medium text-warning">
          {notice}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <p id={helpId} className="text-xs text-muted-foreground">
        Así se escribe: <Mark>**negrita**</Mark>, <Mark>*cursiva*</Mark>, <Mark>[texto](enlace)</Mark>. Para una lista, empieza cada línea con <Mark>- </Mark> o <Mark>1. </Mark>; para un subtítulo, con <Mark>## </Mark>. Los botones de arriba lo hacen por ti: selecciona el texto y tócalos.
      </p>

      {value.trim() ? (
        <details className="group rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver cómo queda el formato</span>
            <span className="hidden group-open:inline">Ocultar la vista del formato</span>
          </summary>
          <div className="space-y-2 border-t border-border px-3 py-3 text-sm">
            <RichPreview value={value} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Mark({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{children}</code>;
}

// ---------------------------------------------------------------------------
// Vista del formato (la misma lectura que hace el sitio, sin enlaces que navegan)
// ---------------------------------------------------------------------------

function Inline({ nodes }: { nodes: RichInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === 'text') return <Fragment key={index}>{node.text}</Fragment>;
        if (node.kind === 'strong') return <strong key={index}><Inline nodes={node.children} /></strong>;
        if (node.kind === 'em') return <em key={index}><Inline nodes={node.children} /></em>;
        return (
          <span key={index} className="text-info underline underline-offset-2">
            <Inline nodes={node.children} />
          </span>
        );
      })}
    </>
  );
}

function RichPreview({ value }: { value: string }) {
  const blocks = parseRichText(value);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'h3') {
          return (
            <h4 key={index} className="text-base font-semibold">
              <Inline nodes={block.content} />
            </h4>
          );
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          const Tag = block.kind;
          return (
            <Tag key={index} className={cn('space-y-0.5 pl-5', block.kind === 'ul' ? 'list-disc' : 'list-decimal')}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline nodes={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <Inline nodes={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
