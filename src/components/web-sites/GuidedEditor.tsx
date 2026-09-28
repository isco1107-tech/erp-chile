'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, Circle, Copy, Eye, EyeOff, Lightbulb, Plus, Trash2 } from 'lucide-react';
import type { WebSiteKind } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BLOCK_INFO, BLOCK_TYPES, createBlock, MAX_BLOCKS, newBlockId, type BlockType, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { KIND_INFO } from '@/lib/web-sites/templates';
import { cn } from '@/lib/utils';
import { BlockFields } from './BlockEditor';
import { BLOCK_ICONS, blockSummary } from './editor-shared';

type BlocksUpdater = (updater: (previous: WebSiteBlock[]) => WebSiteBlock[]) => void;

interface GuidedEditorProps {
  kind: WebSiteKind;
  blocks: WebSiteBlock[];
  onBlocksChange: BlocksUpdater;
  /** Sección abierta (vive en el editor para que sobreviva al cambio de pestaña). */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  readOnly: boolean;
}

export function GuidedEditor({ kind, blocks, onBlocksChange, openId, onOpenChange, readOnly }: GuidedEditorProps) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const focusRequest = useRef<{ id: string; dir: -1 | 1 } | null>(null);
  const revealRequest = useRef<string | null>(null);
  const atMax = blocks.length >= MAX_BLOCKS;
  const hasHero = blocks.some((block) => block.type === 'hero');

  // Tras subir/bajar una sección el foco vuelve a su botón (React reubica el nodo y el navegador lo suelta).
  useEffect(() => {
    const request = focusRequest.current;
    if (request) {
      focusRequest.current = null;
      const up = document.getElementById(`sec-${request.id}-up`) as HTMLButtonElement | null;
      const down = document.getElementById(`sec-${request.id}-down`) as HTMLButtonElement | null;
      const first = request.dir === -1 ? up : down;
      const second = request.dir === -1 ? down : up;
      (first && !first.disabled ? first : second)?.focus();
    }
    const reveal = revealRequest.current;
    if (reveal) {
      revealRequest.current = null;
      const card = document.getElementById(`sec-${reveal}`);
      card?.scrollIntoView({ block: 'nearest' });
      card?.querySelector<HTMLElement>('input:not([type="file"]), textarea')?.focus({ preventScroll: true });
    }
  }, [blocks]);

  const addBlock = useCallback(
    (type: BlockType) => {
      if (atMax) {
        toast.error(`Un sitio puede tener hasta ${MAX_BLOCKS} secciones.`);
        return;
      }
      if (type === 'hero' && hasHero) {
        toast.error('Tu sitio ya tiene una portada. Solo puede haber una.');
        return;
      }
      const block = createBlock(type);
      revealRequest.current = block.id;
      onBlocksChange((previous) => [...previous, block]);
      onOpenChange(block.id);
      setAdding(false);
    },
    [atMax, hasHero, onBlocksChange, onOpenChange]
  );

  const changeBlock = useCallback(
    (id: string, next: WebSiteBlock) => onBlocksChange((previous) => previous.map((block) => (block.id === id ? next : block))),
    [onBlocksChange]
  );

  const moveBlock = useCallback(
    (id: string, dir: -1 | 1) => {
      focusRequest.current = { id, dir };
      onBlocksChange((previous) => {
        const index = previous.findIndex((block) => block.id === id);
        const target = index + dir;
        if (index < 0 || target < 0 || target >= previous.length) return previous;
        const next = [...previous];
        const [moved] = next.splice(index, 1);
        if (!moved) return previous;
        next.splice(target, 0, moved);
        return next;
      });
    },
    [onBlocksChange]
  );

  const toggleHidden = useCallback(
    (id: string) => onBlocksChange((previous) => previous.map((block) => (block.id === id ? { ...block, hidden: !block.hidden } : block))),
    [onBlocksChange]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const copyId = newBlockId();
      revealRequest.current = copyId;
      onBlocksChange((previous) => {
        const index = previous.findIndex((block) => block.id === id);
        const source = previous[index];
        if (!source || previous.length >= MAX_BLOCKS) return previous;
        const next = [...previous];
        next.splice(index + 1, 0, { ...structuredClone(source), id: copyId });
        return next;
      });
      onOpenChange(copyId);
    },
    [onBlocksChange, onOpenChange]
  );

  const removeBlock = useCallback(
    async (block: WebSiteBlock) => {
      const label = BLOCK_INFO[block.type].label;
      const ok = await confirm({
        title: `¿Eliminar la sección "${label}"?`,
        description: 'Se perderá todo lo que escribiste en ella. Si solo quieres que no se vea por ahora, usa "Ocultar".',
        confirmLabel: 'Eliminar',
      });
      if (!ok) return;
      onBlocksChange((previous) => previous.filter((item) => item.id !== block.id));
      if (openId === block.id) onOpenChange(null);
    },
    [confirm, onBlocksChange, onOpenChange, openId]
  );

  const toggleOpen = useCallback((id: string) => onOpenChange(openId === id ? null : id), [onOpenChange, openId]);

  return (
    <div className="space-y-4">
      <KindGuide kind={kind} blocks={blocks} canAdd={!readOnly && !atMax} onAdd={addBlock} hasHero={hasHero} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Secciones de tu sitio{' '}
          <span className="font-normal text-muted-foreground">
            ({blocks.length} de {MAX_BLOCKS})
          </span>
        </h2>
        <Button type="button" size="sm" variant={adding ? 'secondary' : 'default'} disabled={readOnly || atMax} aria-expanded={adding} aria-controls="add-section-panel" onClick={() => setAdding((value) => !value)}>
          <Plus aria-hidden="true" /> Agregar sección
        </Button>
      </div>

      {adding ? (
        <section id="add-section-panel" aria-label="Elige el tipo de sección" className="rounded-lg border border-border bg-card p-3 shadow-card">
          <p className="mb-3 text-sm text-muted-foreground">¿Qué quieres agregar? Se suma al final; después puedes subirla o bajarla.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {BLOCK_TYPES.map((type) => {
              const info = BLOCK_INFO[type];
              const Icon = BLOCK_ICONS[info.icon];
              const blocked = type === 'hero' && hasHero;
              return (
                <li key={type}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => addBlock(type)}
                    className="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left outline-none transition-colors hover:border-ring hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{info.label}</span>
                      <span className="block text-xs text-muted-foreground">{blocked ? 'Ya tienes una portada; solo puede haber una.' : info.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card">
          <EmptyState title="Tu sitio todavía no tiene secciones" description="Empieza por una portada y una sección de contacto; después agrega lo demás." actionLabel={readOnly ? undefined : 'Agregar sección'} onAction={() => setAdding(true)} />
        </div>
      ) : (
        <ol className="space-y-3">
          {blocks.map((block, index) => (
            <SectionCard
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              open={openId === block.id}
              readOnly={readOnly}
              atMax={atMax}
              onToggleOpen={toggleOpen}
              onMove={moveBlock}
              onToggleHidden={toggleHidden}
              onDuplicate={duplicateBlock}
              onRemove={removeBlock}
              onChange={changeBlock}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini-guía "qué debe tener un sitio de …"
// ---------------------------------------------------------------------------

function KindGuide({ kind, blocks, canAdd, hasHero, onAdd }: { kind: WebSiteKind; blocks: WebSiteBlock[]; canAdd: boolean; hasHero: boolean; onAdd: (type: BlockType) => void }) {
  const info = KIND_INFO[kind];
  const checks = info.mustHave.map((need) => ({ need, ok: blocks.some((block) => !block.hidden && block.type === need.type) }));
  const done = checks.filter((check) => check.ok).length;
  return (
    <details className="group rounded-lg border border-border bg-card shadow-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Qué debe tener un sitio tipo “{info.label}”</span>
          <span className="block text-xs text-muted-foreground">
            {done} de {checks.length} listas · {info.description}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 text-xs text-muted-foreground">Ejemplos: {info.examples}</p>
        <ul className="space-y-2">
          {checks.map(({ need, ok }) => (
            <li key={`${need.type}-${need.label}`} className="flex items-start gap-2 text-sm">
              {ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={cn('font-medium', ok && 'text-muted-foreground line-through decoration-1')}>{need.label}</span>
                <span className="sr-only">{ok ? ' (lista)' : ' (falta)'}</span>
                {!ok ? <span className="block text-xs text-muted-foreground">{need.why}</span> : null}
              </span>
              {!ok && canAdd && !(need.type === 'hero' && hasHero) ? (
                <Button type="button" size="xs" variant="outline" onClick={() => onAdd(need.type)} aria-label={`Agregar sección: ${need.label}`}>
                  <Plus aria-hidden="true" /> Agregar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de una sección
// ---------------------------------------------------------------------------

interface SectionCardProps {
  block: WebSiteBlock;
  index: number;
  total: number;
  open: boolean;
  readOnly: boolean;
  atMax: boolean;
  onToggleOpen: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggleHidden: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (block: WebSiteBlock) => Promise<void>;
  onChange: (id: string, block: WebSiteBlock) => void;
}

const SectionCard = memo(function SectionCard({ block, index, total, open, readOnly, atMax, onToggleOpen, onMove, onToggleHidden, onDuplicate, onRemove, onChange }: SectionCardProps) {
  const info = BLOCK_INFO[block.type];
  const Icon = BLOCK_ICONS[info.icon];
  const name = `${info.label} (sección ${index + 1})`;
  const bodyId = `sec-${block.id}-body`;
  return (
    <li id={`sec-${block.id}`} className={cn('rounded-lg border bg-card shadow-card', open ? 'border-ring/60' : 'border-border', block.hidden && 'opacity-80')}>
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggleOpen(block.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {info.label}
              {block.hidden ? <StatusBadge tone="neutral">Oculta</StatusBadge> : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{blockSummary(block)}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button id={`sec-${block.id}-up`} type="button" variant="ghost" size="icon-sm" disabled={readOnly || index === 0} aria-label={`Subir ${name}`} onClick={() => onMove(block.id, -1)}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button id={`sec-${block.id}-down`} type="button" variant="ghost" size="icon-sm" disabled={readOnly || index === total - 1} aria-label={`Bajar ${name}`} onClick={() => onMove(block.id, 1)}>
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`${block.hidden ? 'Mostrar' : 'Ocultar'} ${name}`} title={block.hidden ? 'Mostrar en el sitio' : 'Ocultar del sitio (se conserva el contenido)'} onClick={() => onToggleHidden(block.id)}>
            {block.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={readOnly || atMax || block.type === 'hero'}
            aria-label={`Duplicar ${name}`}
            title={block.type === 'hero' ? 'Solo puede haber una portada' : 'Duplicar sección'}
            onClick={() => onDuplicate(block.id)}
          >
            <Copy aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={readOnly} aria-label={`Eliminar ${name}`} onClick={() => void onRemove(block)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open ? (
        <div id={bodyId} className="space-y-4 border-t border-border p-4">
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground">Consejo: </span>
              {info.help}
            </span>
          </p>
          <BlockFields block={block} disabled={readOnly} onChange={(next) => onChange(block.id, next)} />
        </div>
      ) : null}
    </li>
  );
});
