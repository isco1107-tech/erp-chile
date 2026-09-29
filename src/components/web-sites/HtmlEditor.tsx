'use client';

import { useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleCheck, Copy, Info, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Label } from '@/components/ui/label';
import { textareaClass } from '@/components/ui/field-classes';
import { MAX_HTML_BYTES, type htmlHints } from '@/lib/web-sites/html';
import { starterHtml } from '@/lib/web-sites/templates';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { copyText, formatBytes, useEditorAssets } from './editor-shared';

interface HtmlEditorProps {
  html: string;
  onChange: (html: string) => void;
  siteName: string;
  /** Avisos de `sanitizeHtml` (calculados con retraso por el editor). */
  removed: string[];
  hints: ReturnType<typeof htmlHints>;
  readOnly: boolean;
}

const INDENT = '  ';

export function HtmlEditor({ html, onChange, siteName, removed, hints, readOnly }: HtmlEditorProps) {
  const confirm = useConfirm();
  const { assets } = useEditorAssets();
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<number | null>(null);
  // Tab indenta; Esc lo suelta para poder salir del cuadro con el teclado (no atrapar al usuario).
  const tabIndents = useRef(true);

  const bytes = useMemo(() => new TextEncoder().encode(html).length, [html]);
  const ratio = Math.min(bytes / MAX_HTML_BYTES, 1);
  const overLimit = bytes > MAX_HTML_BYTES;

  // Tras insertar texto, el cursor se reposiciona (un textarea controlado lo manda al final).
  useLayoutEffect(() => {
    const position = pendingSelection.current;
    if (position === null) return;
    pendingSelection.current = null;
    textareaRef.current?.setSelectionRange(position, position);
  }, [html]);

  function insertAtCursor(text: string) {
    const area = textareaRef.current;
    const start = area?.selectionStart ?? html.length;
    const end = area?.selectionEnd ?? html.length;
    pendingSelection.current = start + text.length;
    onChange(`${html.slice(0, start)}${text}${html.slice(end)}`);
    area?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      tabIndents.current = false;
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey && tabIndents.current && !readOnly) {
      event.preventDefault();
      insertAtCursor(INDENT);
    }
  }

  async function reset() {
    const ok = await confirm({
      title: '¿Restablecer la plantilla?',
      description: 'Se reemplaza todo el HTML por la plantilla inicial y lo que escribiste se pierde.',
      confirmLabel: 'Restablecer',
    });
    if (ok) onChange(starterHtml(siteName));
  }

  return (
    <div className="space-y-4">
      <details className="group rounded-lg border border-border bg-card shadow-card" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4 text-info" aria-hidden="true" /> Cómo funciona el HTML propio
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="list-disc space-y-1.5 border-t border-border px-4 py-3 pl-9 text-sm text-muted-foreground">
          <li>Escribes tu página con HTML y CSS. Si nunca lo hiciste, parte de la plantilla y cambia solo los textos.</li>
          <li>
            <strong className="font-medium text-foreground">No se ejecuta JavaScript ni funcionan los formularios.</strong> Los quitamos al publicar por seguridad.
          </li>
          <li>
            Para que te contacten usa enlaces: <code className="rounded bg-muted px-1 font-mono text-xs">mailto:hola@tudominio.cl</code>, <code className="rounded bg-muted px-1 font-mono text-xs">tel:+56912345678</code> o{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">https://wa.me/56912345678</code>.
          </li>
          <li>Sube tus imágenes en la pestaña Imágenes y copia su dirección con el botón “Copiar dirección” (o insértalas desde la lista de abajo).</li>
          <li>Los estilos (colores, tipografía) van dentro de tu propio HTML, en una etiqueta {'<style>'}.</li>
        </ul>
      </details>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label htmlFor={textareaId}>Tu HTML y CSS</Label>
          <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={() => void reset()}>
            <RotateCcw aria-hidden="true" /> Restablecer plantilla
          </Button>
        </div>
        <textarea
          id={textareaId}
          ref={textareaRef}
          value={html}
          disabled={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
          aria-describedby={`${textareaId}-help ${textareaId}-size`}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            tabIndents.current = true;
          }}
          className={cn(textareaClass, 'min-h-[26rem] resize-y font-mono text-[13px] leading-relaxed whitespace-pre lg:min-h-[32rem]')}
        />
        <p id={`${textareaId}-help`} className="text-xs text-muted-foreground">
          La tecla Tab inserta sangría. Para salir del cuadro con el teclado, pulsa Esc y luego Tab.
        </p>
        <div id={`${textareaId}-size`} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className={cn('tabular-nums', overLimit ? 'font-semibold text-danger' : ratio > 0.9 ? 'text-warning' : 'text-muted-foreground')}>
              {formatBytes(bytes)} de {formatBytes(MAX_HTML_BYTES)}
            </span>
            {overLimit ? <span className="font-medium text-danger">Te pasaste: reduce el HTML para poder guardar.</span> : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn('h-full rounded-full transition-all', overLimit ? 'bg-danger' : ratio > 0.9 ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        </div>
      </div>

      <section aria-label="Lo que se quitará al publicar" className="rounded-lg border border-border bg-card p-4 shadow-card">
        {removed.length > 0 ? (
          <div role="status" className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" /> Esto se quitará al publicar
            </p>
            <ul className="list-disc space-y-1 pl-9 text-sm text-muted-foreground">
              {removed.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" aria-hidden="true" /> No hay nada que la plataforma tenga que quitar.
          </p>
        )}
      </section>

      <section aria-label="Recomendaciones para tu HTML" className="rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="mb-2 text-sm font-semibold">Recomendaciones</h2>
        <ul className="space-y-2">
          {hints.map((hint) => (
            <li key={hint.id} className="flex items-start gap-2 text-sm">
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', hint.ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>{hint.ok ? <Check className="size-3" aria-hidden="true" /> : <AlertTriangle className="size-3" aria-hidden="true" />}</span>
              <span className="min-w-0">
                <span className="block font-medium">
                  {hint.label}
                  <span className="sr-only">{hint.ok ? ' (listo)' : ' (pendiente)'}</span>
                </span>
                {!hint.ok ? <span className="block text-xs text-muted-foreground">{hint.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Imágenes de la biblioteca" className="rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="mb-1 text-sm font-semibold">Tus imágenes</h2>
        <p className="mb-3 text-xs text-muted-foreground">Copia la dirección para usarla en un {'<img src="…">'} o insértala donde está el cursor. Súbelas en la pestaña Imágenes.</p>
        {assets.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">Todavía no subiste imágenes a este sitio.</p>
        ) : (
          <ul className="space-y-2">
            {assets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-3">
                <span className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={safeImageSrc(asset.url) ?? undefined} alt="" className="size-full object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{asset.fileName}</span>
                <Button type="button" size="xs" variant="outline" aria-label={`Copiar dirección de ${asset.fileName}`} onClick={() => void copyText(asset.url)}>
                  <Copy aria-hidden="true" /> Copiar dirección
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={readOnly}
                  aria-label={`Insertar ${asset.fileName} en el HTML`}
                  onClick={() => insertAtCursor(`<img src="${asset.url}" alt="${asset.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" style="max-width:100%;height:auto">`)}
                >
                  <Plus aria-hidden="true" /> Insertar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
