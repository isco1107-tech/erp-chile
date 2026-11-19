'use client';

import { useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, LayoutTemplate, PanelBottom, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { designLayout, isHidden, sampleTextCount } from '@/lib/events/pageant-design-ops';
import type { EditorKey } from '@/lib/events/pageant-editor-protocol';
import { PAGEANT_SECTION_INFO, itemKey, sectionSettings, type LayoutItem } from '@/lib/events/pageant-layout';
import type { PageantSiteDesign } from '@/lib/events/pageant-site-design';
import { BLOCK_INFO, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { cn } from '@/lib/utils';

/** Una línea que describe un bloque del estudio (su primer texto). */
export function blockSummary(block: WebSiteBlock): string {
  const record = block as unknown as Record<string, unknown>;
  for (const field of ['title', 'heading', 'eyebrow', 'text', 'subtitle', 'quote', 'body']) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return BLOCK_INFO[block.type].description;
}

export function itemLabel(design: PageantSiteDesign, item: LayoutItem): string {
  if (item.kind === 'section') return PAGEANT_SECTION_INFO[item.id].label;
  const block = design.blocks.find((entry) => entry.id === item.id);
  if (!block) return 'Sección';
  return block.style.canvas?.enabled && block.style.canvas.replaceContent ? 'Lienzo libre' : BLOCK_INFO[block.type].label;
}

/**
 * «Estructura»: TODO el sitio en orden, como el índice de un documento. Cada
 * fila se selecciona (y el lienzo la muestra), se arrastra a otra posición o
 * se mueve con los botones, y entre dos filas se puede insertar una sección
 * del estudio. Las secciones propias sin datos se ven atenuadas con la razón:
 * aparecen solas cuando el dato existe.
 */
export function StructurePanel({
  design,
  rendered,
  selected,
  readOnly,
  onSelect,
  onMove,
  onMoveTo,
  onToggleHidden,
  onDuplicate,
  onRemove,
  onInsert,
}: {
  design: PageantSiteDesign;
  rendered: ReadonlySet<string>;
  selected: EditorKey | null;
  readOnly: boolean;
  onSelect: (key: EditorKey) => void;
  onMove: (key: EditorKey, dir: -1 | 1) => void;
  onMoveTo: (key: EditorKey, index: number) => void;
  onToggleHidden: (key: EditorKey) => void;
  onDuplicate: (blockId: string) => void;
  onRemove: (blockId: string) => void;
  onInsert: (at: { after: EditorKey | null; before: EditorKey | null }) => void;
}) {
  const layout = designLayout(design);
  const [dragging, setDragging] = useState<EditorKey | null>(null);
  const [drop, setDrop] = useState<{ index: number; edge: 'before' | 'after' } | null>(null);
  const known = rendered.size > 0;

  const onDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!dragging || readOnly) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    setDrop({ index, edge: event.clientY < box.top + box.height / 2 ? 'before' : 'after' });
  };
  const onDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    if (!dragging || !drop) return;
    const from = layout.findIndex((item) => itemKey(item) === dragging);
    const target = drop.edge === 'before' ? drop.index : drop.index + 1;
    // La posición de destino se cuenta en la lista sin el elemento que se mueve.
    onMoveTo(dragging, from < target ? target - 1 : target);
    setDragging(null);
    setDrop(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Arrastra las filas para cambiar el orden, o usa las flechas. Entre dos filas aparece <span className="font-medium text-foreground">+ Agregar aquí</span> para insertar una sección nueva.
      </p>
      {!design.enabled && design.blocks.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Las secciones del estudio están apagadas: enciéndelas en «Diseño» para que se vean en el sitio.</p>
      )}
      <ol className="space-y-0.5" onDragLeave={() => setDrop(null)}>
        {layout.map((item, index) => {
          const key = itemKey(item);
          const block = item.kind === 'block' ? design.blocks.find((entry) => entry.id === item.id) : undefined;
          const hidden = isHidden(design, key);
          const missing = known && !hidden && !rendered.has(key) && !(item.kind === 'block' && !design.enabled);
          const sample = block !== undefined && !hidden && sampleTextCount(block) > 0;
          const nav = item.kind === 'section' ? sectionSettings(design.sections, item.id).navLabel : null;
          const label = itemLabel(design, item);
          const isSelected = selected === key;
          const Icon = item.kind === 'block' ? Sparkles : LayoutTemplate;
          return (
            <li
              key={key}
              draggable={!readOnly}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', key);
                setDragging(key);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
              onDragOver={(event) => onDragOver(event, index)}
              onDrop={onDrop}
              className={cn('group relative', dragging === key && 'opacity-50')}
            >
              {!readOnly && <InsertPoint onClick={() => onInsert({ after: index > 0 ? itemKey(layout[index - 1]!) : null, before: key })} />}
              {drop?.index === index && dragging !== key && (
                <span aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary', drop.edge === 'before' ? 'top-0' : 'bottom-0')} />
              )}
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 transition-colors',
                  isSelected ? 'border-ring bg-accent' : 'border-transparent hover:border-border hover:bg-muted/60',
                  (hidden || missing) && 'opacity-60'
                )}
              >
                <span className={cn('text-muted-foreground', readOnly ? 'opacity-30' : 'cursor-grab active:cursor-grabbing')} aria-hidden="true">
                  <GripVertical className="size-4" />
                </span>
                <button type="button" onClick={() => onSelect(key)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', item.kind === 'block' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground')}>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{label}</span>
                      {nav && <span className="truncate text-xs font-normal text-muted-foreground">· «{nav}»</span>}
                      {hidden && <StatusBadge tone="neutral">Oculta</StatusBadge>}
                      {missing && <StatusBadge tone="neutral">{item.kind === 'section' ? 'Sin datos' : 'Vacía'}</StatusBadge>}
                      {sample && <StatusBadge tone="warning">Texto de ejemplo</StatusBadge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" title={item.kind === 'section' && missing ? PAGEANT_SECTION_INFO[item.id].appearsWhen : undefined}>
                      {item.kind === 'section' ? (missing ? PAGEANT_SECTION_INFO[item.id].appearsWhen : PAGEANT_SECTION_INFO[item.id].description) : block ? blockSummary(block) : ''}
                    </span>
                  </span>
                </button>
                {!readOnly && (
                  <span className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Subir ${label}`} title="Subir" onClick={() => onMove(key, -1)}>
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Bajar ${label}`} title="Bajar" onClick={() => onMove(key, 1)}>
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${label}`} title={hidden ? 'Mostrar en el sitio' : 'Ocultar del sitio'} onClick={() => onToggleHidden(key)}>
                      {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                    </Button>
                    {item.kind === 'block' && (
                      <>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Duplicar ${label}`} title="Duplicar" onClick={() => onDuplicate(item.id)}>
                          <Copy aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Eliminar ${label}`} title="Eliminar" className="text-danger hover:text-danger" onClick={() => onRemove(item.id)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        <li className="relative">
          {!readOnly && <InsertPoint onClick={() => onInsert({ after: layout.length ? itemKey(layout[layout.length - 1]!) : null, before: null })} />}
          <button
            type="button"
            onClick={() => onSelect('footer')}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border px-1.5 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              selected === 'footer' ? 'border-ring bg-accent' : 'border-transparent hover:border-border hover:bg-muted/60'
            )}
          >
            <span className="w-4" aria-hidden="true" />
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
              <PanelBottom className="size-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Pie de página</span>
              <span className="block truncate text-xs text-muted-foreground">Siempre al final: redes, contacto, enlaces y logos.</span>
            </span>
          </button>
        </li>
      </ol>
    </div>
  );
}

function InsertPoint({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex h-3 items-center justify-center opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 group-hover:opacity-100">
      <button
        type="button"
        onClick={onClick}
        className="relative z-10 flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-3" aria-hidden="true" />
        Agregar aquí
      </button>
    </div>
  );
}
