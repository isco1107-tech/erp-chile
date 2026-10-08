'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, Circle, Eye, EyeOff, Lightbulb, Plus } from 'lucide-react';
import type { WebSiteKind } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BLOCK_INFO, cloneBlock, createBlock, MAX_BLOCKS, type BlockStyle, type BlockType, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { allBlocks, blockCount, findPage, homeOf, MAX_TOTAL_BLOCKS, setPageBlocks, type SiteDocument } from '@/lib/web-sites/site';
import { DEFAULT_THEME, type WebSiteTheme } from '@/lib/web-sites/theme';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { KIND_INFO } from '@/lib/web-sites/templates';
import { cn } from '@/lib/utils';
import { AddSectionDialog, buildSuggestions } from './AddSectionDialog';
import { BlockFields } from './BlockEditor';
import { LayoutPicker } from './LayoutPicker';
import { BLOCK_ICONS, blockSummary } from './editor-shared';
import { MoveSectionDialog, type PageOption } from './MoveSectionDialog';
import { SectionMenu } from './SectionMenu';
import { SectionStyleFields } from './SectionStyleFields';

interface GuidedEditorProps {
  kind: WebSiteKind;
  document: SiteDocument;
  /** Página cuyas secciones se editan. */
  pageId: string;
  onDocumentChange: (updater: (previous: SiteDocument) => SiteDocument) => void;
  /** Sección abierta (vive en el editor para que sobreviva al cambio de pestaña). */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  readOnly: boolean;
  /** Opcional: con el tema del sitio, las muestras de fondo y las miniaturas de diseños se ven como quedarán. */
  theme?: WebSiteTheme;
}

type Transfer = { mode: 'move' | 'copy'; blockId: string };

/** Devuelve la versión anterior mientras el valor sea equivalente, para no volver a pintar todas las tarjetas en cada tecla. */
function useStable<T>(value: T, equal: (a: T, b: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (stable !== value && !equal(stable, value)) {
    setStable(value);
    return value;
  }
  return stable;
}

function samePages(a: PageOption[], b: PageOption[]): boolean {
  return a.length === b.length && a.every((page, index) => {
    const other = b[index];
    return other !== undefined && page.id === other.id && page.title === other.title && page.hidden === other.hidden && page.blockCount === other.blockCount && page.hasHero === other.hasHero && page.isHome === other.isHome;
  });
}

export function GuidedEditor({ kind, document, pageId, onDocumentChange, openId, onOpenChange, readOnly, theme }: GuidedEditorProps) {
  const confirm = useConfirm();
  const page = findPage(document, pageId) ?? homeOf(document);
  const currentPageId = page.id;
  const blocks = page.blocks;
  const total = blockCount(document);
  const atPageMax = blocks.length >= MAX_BLOCKS;
  const atSiteMax = total >= MAX_TOTAL_BLOCKS;
  const limitMessage = atPageMax
    ? `Esta página ya tiene ${MAX_BLOCKS} secciones, que es el máximo por página. Quita alguna o crea otra página para seguir.`
    : atSiteMax
      ? `Tu sitio ya tiene ${MAX_TOTAL_BLOCKS} secciones en total, que es el máximo. Quita alguna para poder agregar más.`
      : null;
  const hasHero = blocks.some((block) => block.type === 'hero');

  const [addAt, setAddAt] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const focusRequest = useRef<{ id: string; dir: -1 | 1 } | null>(null);
  const revealRequest = useRef<string | null>(null);

  const pageOptions = useStable(
    document.pages.map<PageOption>((item, index) => ({ id: item.id, title: item.title, isHome: index === 0, hidden: item.hidden, blockCount: item.blocks.length, hasHero: item.blocks.some((block) => block.type === 'hero') })),
    samePages
  );

  // Tras subir/bajar una sección el foco vuelve a su botón; tras agregar una, se lleva a la vista y se enfoca su primer campo.
  useEffect(() => {
    const request = focusRequest.current;
    if (request) {
      focusRequest.current = null;
      const up = window.document.getElementById(`sec-${request.id}-up`) as HTMLButtonElement | null;
      const down = window.document.getElementById(`sec-${request.id}-down`) as HTMLButtonElement | null;
      const first = request.dir === -1 ? up : down;
      const second = request.dir === -1 ? down : up;
      (first && !first.disabled ? first : second)?.focus();
    }
    const reveal = revealRequest.current;
    if (reveal) {
      revealRequest.current = null;
      const card = window.document.getElementById(`sec-${reveal}`);
      card?.scrollIntoView({ block: 'nearest' });
      card?.querySelector<HTMLElement>('input[type="text"], input:not([type]), textarea')?.focus({ preventScroll: true });
    }
  }, [blocks]);

  const updateBlocks = useCallback(
    (updater: (previous: WebSiteBlock[]) => WebSiteBlock[]) => onDocumentChange((previous) => setPageBlocks(previous, currentPageId, updater)),
    [onDocumentChange, currentPageId]
  );

  const addBlock = useCallback(
    (type: BlockType, position?: number, variant?: string) => {
      if (limitMessage) {
        toast.error(limitMessage);
        return;
      }
      if (type === 'hero' && hasHero) {
        toast.error('Esta página ya tiene una portada. Solo puede haber una por página.');
        return;
      }
      // Desde la biblioteca de diseños llega con el contenido de muestra (se ve el diseño al tiro); desde la guía, vacía.
      const block = variant !== undefined ? sampleBlock(type, variant) : createBlock(type);
      revealRequest.current = block.id;
      onDocumentChange((previous) => {
        if (blockCount(previous) >= MAX_TOTAL_BLOCKS) return previous;
        return setPageBlocks(previous, currentPageId, (list) => {
          if (list.length >= MAX_BLOCKS) return list;
          // La portada, si no se pidió otra posición, va arriba de todo.
          const wanted = position ?? (type === 'hero' ? 0 : list.length);
          const at = Math.max(0, Math.min(wanted, list.length));
          const next = [...list];
          next.splice(at, 0, block);
          return next;
        });
      });
      onOpenChange(block.id);
      setAddAt(null);
    },
    [limitMessage, hasHero, onDocumentChange, onOpenChange, currentPageId]
  );

  const changeBlock = useCallback((id: string, next: WebSiteBlock) => updateBlocks((previous) => previous.map((block) => (block.id === id ? next : block))), [updateBlocks]);

  const moveBlock = useCallback(
    (id: string, dir: -1 | 1) => {
      focusRequest.current = { id, dir };
      updateBlocks((previous) => {
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
    [updateBlocks]
  );

  const toggleHidden = useCallback((id: string) => updateBlocks((previous) => previous.map((block) => (block.id === id ? { ...block, hidden: !block.hidden } : block))), [updateBlocks]);

  const duplicateBlock = useCallback(
    (id: string) => {
      const source = blocks.find((block) => block.id === id);
      if (!source) return;
      if (limitMessage) {
        toast.error(limitMessage);
        return;
      }
      if (source.type === 'hero') {
        toast.error('Solo puede haber una portada por página.');
        return;
      }
      const copy = cloneBlock(source);
      revealRequest.current = copy.id;
      onDocumentChange((previous) => {
        if (blockCount(previous) >= MAX_TOTAL_BLOCKS) return previous;
        return setPageBlocks(previous, currentPageId, (list) => {
          const index = list.findIndex((block) => block.id === id);
          if (index < 0 || list.length >= MAX_BLOCKS) return list;
          const next = [...list];
          next.splice(index + 1, 0, copy);
          return next;
        });
      });
      onOpenChange(copy.id);
    },
    [blocks, limitMessage, onDocumentChange, onOpenChange, currentPageId]
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
      updateBlocks((previous) => previous.filter((item) => item.id !== block.id));
      if (openId === block.id) onOpenChange(null);
    },
    [confirm, updateBlocks, onOpenChange, openId]
  );

  const transferBlock = useCallback(
    (targetId: string) => {
      if (!transfer) return;
      const source = blocks.find((block) => block.id === transfer.blockId);
      const target = document.pages.find((item) => item.id === targetId);
      setTransfer(null);
      if (!source || !target) return;
      if (target.blocks.length >= MAX_BLOCKS) {
        toast.error(`La página «${target.title}» ya tiene ${MAX_BLOCKS} secciones, que es el máximo.`);
        return;
      }
      if (source.type === 'hero' && target.blocks.some((block) => block.type === 'hero')) {
        toast.error(`La página «${target.title}» ya tiene una portada. Solo puede haber una por página.`);
        return;
      }
      if (transfer.mode === 'copy' && atSiteMax) {
        toast.error(`Tu sitio ya tiene ${MAX_TOTAL_BLOCKS} secciones en total, que es el máximo.`);
        return;
      }
      const mode = transfer.mode;
      onDocumentChange((previous) => {
        const from = findPage(previous, currentPageId);
        const to = findPage(previous, targetId);
        const block = from?.blocks.find((item) => item.id === source.id);
        if (!from || !to || !block || to.blocks.length >= MAX_BLOCKS) return previous;
        if (block.type === 'hero' && to.blocks.some((item) => item.type === 'hero')) return previous;
        if (mode === 'copy' && blockCount(previous) >= MAX_TOTAL_BLOCKS) return previous;
        const incoming = mode === 'copy' ? cloneBlock(block) : block;
        return {
          ...previous,
          pages: previous.pages.map((item) => {
            if (item.id === to.id) return { ...item, blocks: [...item.blocks, incoming] };
            if (mode === 'move' && item.id === from.id) return { ...item, blocks: item.blocks.filter((entry) => entry.id !== block.id) };
            return item;
          }),
        };
      });
      if (mode === 'move' && openId === source.id) onOpenChange(null);
      toast.success(mode === 'move' ? `La sección se movió al final de «${target.title}».` : `Se copió la sección al final de «${target.title}».`);
    },
    [transfer, blocks, document.pages, atSiteMax, onDocumentChange, currentPageId, onOpenChange, openId]
  );

  const toggleOpen = useCallback((id: string) => onOpenChange(openId === id ? null : id), [onOpenChange, openId]);
  const requestTransfer = useCallback((mode: Transfer['mode'], blockId: string) => setTransfer({ mode, blockId }), []);
  const openAddDialog = useCallback((position: number) => setAddAt(position), []);

  const present = useMemo(() => new Set(allBlocks(document).map((block) => block.type)), [document]);
  const suggestions = useMemo(() => {
    const info = KIND_INFO[kind];
    const missing = info.mustHave.filter((need) => !present.has(need.type)).map((need) => ({ type: need.type, why: need.why }));
    return buildSuggestions(missing, present);
  }, [kind, present]);

  const whereLabel = (() => {
    if (addAt === null) return 'al final';
    if (addAt >= blocks.length) return `al final de «${page.title}»`;
    if (addAt === 0) return `al comienzo de «${page.title}»`;
    const before = blocks[addAt - 1];
    return before ? `después de «${BLOCK_INFO[before.type].label}»` : `en «${page.title}»`;
  })();

  const transferBlockInfo = transfer ? blocks.find((block) => block.id === transfer.blockId) : undefined;

  return (
    <div className="space-y-4">
      <KindGuide kind={kind} document={document} pageTitle={page.title} canAdd={!readOnly && !limitMessage} onAdd={(type) => addBlock(type)} hasHero={hasHero} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            Secciones de «{page.title}»{' '}
            <span className="font-normal text-muted-foreground">
              ({blocks.length} de {MAX_BLOCKS})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {total} de {MAX_TOTAL_BLOCKS} en todo el sitio
          </p>
        </div>
        <Button type="button" size="sm" disabled={readOnly || Boolean(limitMessage)} onClick={() => openAddDialog(blocks.length)}>
          <Plus aria-hidden="true" /> Agregar sección
        </Button>
      </div>
      {limitMessage ? (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          {limitMessage}
        </p>
      ) : null}

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card">
          <EmptyState
            title="Esta página todavía no tiene secciones"
            description={page.id === homeOf(document).id ? 'Empieza por una portada y una sección de contacto; después agrega lo demás.' : 'Agrega una portada o un texto para empezar, o copia secciones desde otra página.'}
            actionLabel={readOnly || limitMessage ? undefined : 'Agregar sección'}
            onAction={() => openAddDialog(0)}
          />
        </div>
      ) : (
        <>
          <ol>
            {blocks.map((block, index) => (
              <SectionCard
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                open={openId === block.id}
                readOnly={readOnly}
                canGrow={!limitMessage}
                hasOtherPages={pageOptions.length > 1}
                document={openId === block.id ? document : null}
                pageId={currentPageId}
                theme={theme}
                onToggleOpen={toggleOpen}
                onMove={moveBlock}
                onToggleHidden={toggleHidden}
                onDuplicate={duplicateBlock}
                onRemove={removeBlock}
                onChange={changeBlock}
                onTransfer={requestTransfer}
                onInsert={openAddDialog}
              />
            ))}
          </ol>
          {!readOnly ? (
            <Button type="button" variant="outline" className="w-full border-dashed" disabled={Boolean(limitMessage)} onClick={() => openAddDialog(blocks.length)}>
              <Plus aria-hidden="true" /> Agregar sección al final
            </Button>
          ) : null}
        </>
      )}

      <AddSectionDialog
        open={addAt !== null}
        onOpenChange={(next) => (next ? undefined : setAddAt(null))}
        onPick={(type, variant) => addBlock(type, addAt ?? undefined, variant)}
        whereLabel={whereLabel}
        heroBlocked={hasHero}
        suggestions={suggestions}
        theme={theme ?? DEFAULT_THEME}
        document={document}
      />
      <MoveSectionDialog
        open={transfer !== null}
        mode={transfer?.mode ?? 'move'}
        sectionLabel={transferBlockInfo ? BLOCK_INFO[transferBlockInfo.type].label : 'sección'}
        isHero={transferBlockInfo?.type === 'hero'}
        pages={pageOptions}
        currentPageId={currentPageId}
        maxPerPage={MAX_BLOCKS}
        siteFull={atSiteMax}
        onPick={transferBlock}
        onClose={() => setTransfer(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini-guía "qué debe tener un sitio de …" (cuenta las secciones de todo el sitio)
// ---------------------------------------------------------------------------

function KindGuide({ kind, document, pageTitle, canAdd, hasHero, onAdd }: { kind: WebSiteKind; document: SiteDocument; pageTitle: string; canAdd: boolean; hasHero: boolean; onAdd: (type: BlockType) => void }) {
  const info = KIND_INFO[kind];
  const blocks = allBlocks(document);
  const checks = info.mustHave.map((need) => {
    const ok = blocks.some((block) => !block.hidden && block.type === need.type);
    return {
      need,
      ok,
      // La sección existe pero está oculta: no hace falta agregarla, solo mostrarla.
      hiddenOnly: !ok && blocks.some((block) => block.hidden && block.type === need.type),
    };
  });
  const done = checks.filter((check) => check.ok).length;
  return (
    <details className="group rounded-lg border border-border bg-card shadow-card" open={done < checks.length}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Qué debe tener un sitio tipo “{info.label}”</span>
          <span className="block text-xs text-muted-foreground">
            {done} de {checks.length} listas en todo el sitio · {info.description}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-3">
        <p className="mb-2 text-xs text-muted-foreground">Ejemplos: {info.examples}</p>
        <ul className="space-y-2">
          {checks.map(({ need, ok, hiddenOnly }) => (
            <li key={`${need.type}-${need.label}`} className="flex items-start gap-2 text-sm">
              {ok ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={cn('font-medium', ok && 'text-muted-foreground line-through decoration-1')}>{need.label}</span>
                <span className="sr-only">{ok ? ' (lista)' : ' (falta)'}</span>
                {!ok ? <span className="block text-xs text-muted-foreground">{hiddenOnly ? 'Ya la tienes, pero está oculta: muéstrala con el botón del ojo.' : need.why}</span> : null}
              </span>
              {!ok && canAdd && !hiddenOnly && !(need.type === 'hero' && hasHero) ? (
                <Button type="button" size="xs" variant="outline" onClick={() => onAdd(need.type)} aria-label={`Agregar sección: ${need.label} (a la página ${pageTitle})`}>
                  <Plus aria-hidden="true" /> Agregar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Lo que agregues desde aquí se suma a la página «{pageTitle}».</p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Punto para insertar una sección entre dos tarjetas
// ---------------------------------------------------------------------------

function InsertPoint({ position, readOnly, canGrow, onInsert }: { position: number; readOnly: boolean; canGrow: boolean; onInsert: (position: number) => void }) {
  if (readOnly || !canGrow) return <div className="h-3" aria-hidden="true" />;
  return (
    <div className="group/insert relative flex h-6 items-center justify-center">
      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-border opacity-0 transition-opacity group-focus-within/insert:opacity-100 group-hover/insert:opacity-100" />
      <button
        type="button"
        aria-label={position === 0 ? 'Agregar sección al comienzo de la página' : `Agregar sección aquí (entre la sección ${position} y la ${position + 1})`}
        onClick={() => onInsert(position)}
        className="relative flex h-5 items-center gap-1 rounded-full border border-border bg-card px-1 text-xs text-muted-foreground opacity-50 shadow-card outline-none transition-all group-focus-within/insert:opacity-100 group-hover/insert:opacity-100 hover:border-ring hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-3" aria-hidden="true" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all group-focus-within/insert:max-w-40 group-focus-within/insert:pr-1 group-hover/insert:max-w-40 group-hover/insert:pr-1">Agregar sección aquí</span>
      </button>
    </div>
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
  canGrow: boolean;
  hasOtherPages: boolean;
  /** Solo la tarjeta abierta recibe el sitio (las demás no se vuelven a pintar en cada tecla). */
  document: SiteDocument | null;
  pageId: string;
  theme?: WebSiteTheme;
  onToggleOpen: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggleHidden: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (block: WebSiteBlock) => Promise<void>;
  onChange: (id: string, block: WebSiteBlock) => void;
  onTransfer: (mode: Transfer['mode'], blockId: string) => void;
  onInsert: (position: number) => void;
}

const SectionCard = memo(function SectionCard({ block, index, total, open, readOnly, canGrow, hasOtherPages, document, pageId, theme, onToggleOpen, onMove, onToggleHidden, onDuplicate, onRemove, onChange, onTransfer, onInsert }: SectionCardProps) {
  const info = BLOCK_INFO[block.type];
  const Icon = BLOCK_ICONS[info.icon];
  const name = `${info.label} (sección ${index + 1})`;
  const bodyId = `sec-${block.id}-body`;
  const duplicateReason = block.type === 'hero' ? 'Solo puede haber una portada por página' : !canGrow ? 'Se alcanzó el máximo de secciones' : null;
  return (
    <li>
      <InsertPoint position={index} readOnly={readOnly} canGrow={canGrow} onInsert={onInsert} />
      <div id={`sec-${block.id}`} className={cn('rounded-lg border bg-card shadow-card', open ? 'border-ring/60' : 'border-border', block.hidden && 'opacity-80')}>
        <div className="flex items-center gap-2 p-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
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
            <SectionMenu
              name={name}
              disabled={readOnly}
              canDuplicate={!duplicateReason}
              duplicateReason={duplicateReason}
              hasOtherPages={hasOtherPages}
              onDuplicate={() => onDuplicate(block.id)}
              onMoveToPage={() => onTransfer('move', block.id)}
              onCopyToPage={() => onTransfer('copy', block.id)}
              onRemove={() => void onRemove(block)}
            />
          </div>
        </div>
        {open && document ? (
          <div id={bodyId} className="space-y-4 border-t border-border p-4">
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
              <span>
                <span className="font-semibold text-foreground">Consejo: </span>
                {info.help}
              </span>
            </p>
            <LayoutPicker block={block} theme={theme ?? DEFAULT_THEME} document={document} disabled={readOnly} onChange={(next) => onChange(block.id, next)} />
            <BlockFields block={block} disabled={readOnly} document={document} pageId={pageId} onChange={(next) => onChange(block.id, next)} />
            <SectionStyleFields
              style={block.style}
              type={block.type}
              theme={theme}
              disabled={readOnly}
              onChange={(patch: Partial<BlockStyle>) => onChange(block.id, { ...block, style: { ...block.style, ...patch } })}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
});
