'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Eye, Laptop, Loader2, LocateFixed, Monitor, MousePointer2, PanelLeft, Redo2, Smartphone, Tablet, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { AddSectionDialog, buildSuggestions } from '@/components/web-sites/AddSectionDialog';
import { EditorAssetsContext, type EditorAsset } from '@/components/web-sites/editor-shared';
import { canRedo, canUndo, emptyHistory, recordChange, redoStep, undoStep, type HistoryState } from '@/components/web-sites/editor-history';
import {
  applyInlineText,
  blocksWithSampleText,
  designLayout,
  duplicateStudioBlock,
  insertStudioBlock,
  moveItem,
  moveItemTo,
  removeStudioBlock,
  toggleHidden,
  updateStudioBlock,
} from '@/lib/events/pageant-design-ops';
import type { EditorAction, EditorKey, ToEditorMessage } from '@/lib/events/pageant-editor-protocol';
import { parseItemKey } from '@/lib/events/pageant-layout';
import type { PageantSiteDesign } from '@/lib/events/pageant-site-design';
import { blockImageUrls, createBlock, type BlockType, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { documentFromBlocks } from '@/lib/web-sites/site';
import { cn } from '@/lib/utils';
import type { FooterPartnersDraft } from '../FooterPartnersEditor';
import { EditorStage, STAGE_DEVICES, type StageDeviceId, type StageZoom } from './EditorStage';
import { BlockPanel, DesignPanel, EmptySelection, FooterPanel, SectionPanel, type PanelApi, type UploadPurpose } from './PropertiesPanel';
import { itemLabel, StructurePanel } from './StructurePanel';
import { toCanvasDraft, type SiteEditorState, type SiteFormValues } from './site-draft';

type Tab = 'estructura' | 'seccion' | 'diseno';

const DEVICE_ICONS: Record<StageDeviceId, typeof Monitor> = { desktop: Monitor, notebook: Laptop, tablet: Tablet, phone: Smartphone };
const ZOOMS: Array<{ value: StageZoom; label: string }> = [
  { value: 'fit', label: 'Ajustar' },
  { value: 1, label: '100 %' },
  { value: 0.75, label: '75 %' },
  { value: 0.5, label: '50 %' },
];

export interface VisualEditorProject {
  id: string;
  name: string;
  publicSlug: string | null;
  publicSiteEnabled: boolean;
  publicUrl: string | null;
}

/**
 * Editor visual del micrositio, a pantalla completa: el sitio real en grande
 * (lienzo en iframe al ancho del dispositivo) y, al lado, la estructura, las
 * opciones de lo seleccionado y el diseño. Se agrega lo que sea donde sea
 * («+ Agregar sección aquí»), se mueve arrastrando y los textos se escriben
 * sobre la página con doble clic, como en un procesador de texto.
 *
 * Edita el MISMO borrador que el formulario clásico (`SiteEditorState`) y se
 * guarda con la misma acción. Lleva su propio historial (deshacer/rehacer).
 */
export function PageantVisualEditor({
  project,
  state,
  onChange,
  onSave,
  saving,
  dirty,
  canWrite,
  upload,
  onClose,
}: {
  project: VisualEditorProject;
  state: SiteEditorState;
  onChange: (next: SiteEditorState) => void;
  onSave: () => Promise<boolean>;
  saving: boolean;
  dirty: boolean;
  canWrite: boolean;
  upload: (file: File, purpose: UploadPurpose | 'studio') => Promise<string | null>;
  onClose: () => void;
}) {
  const readOnly = !canWrite;
  const confirm = useConfirm();
  // El último borrador, para los manejadores (las acciones encadenadas no leen uno viejo).
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const historyRef = useRef<HistoryState<SiteEditorState>>(emptyHistory());
  const [flags, setFlags] = useState({ undo: false, redo: false });
  const [selected, setSelected] = useState<EditorKey | null>(null);
  const [tab, setTab] = useState<Tab>('estructura');
  const [device, setDevice] = useState<StageDeviceId>('desktop');
  const [zoom, setZoom] = useState<StageZoom>('fit');
  const [audience, setAudience] = useState<'candidata' | 'sponsor'>('candidata');
  const [mode, setMode] = useState<'edit' | 'test'>('edit');
  const [rendered, setRendered] = useState<Set<string>>(() => new Set());
  const renderedRef = useRef(rendered);
  useLayoutEffect(() => {
    renderedRef.current = rendered;
  }, [rendered]);
  const [scrollTo, setScrollTo] = useState<{ key: EditorKey; seq: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [insertAt, setInsertAt] = useState<{ after: EditorKey | null; before: EditorKey | null } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [uploaded, setUploaded] = useState<EditorAsset[]>([]);
  const design = state.values.publicSiteDesign;

  // Mientras el editor está abierto, la página del panel no se desplaza por detrás.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const syncFlags = useCallback(() => {
    const next = { undo: canUndo(historyRef.current), redo: canRedo(historyRef.current) };
    setFlags((previous) => (previous.undo === next.undo && previous.redo === next.redo ? previous : next));
  }, []);

  // ── Cambios con historial ──────────────────────────────────────────────────
  const update = useCallback(
    (fn: (current: SiteEditorState) => SiteEditorState, boundary = false) => {
      if (readOnly) return;
      const previous = stateRef.current;
      const next = fn(previous);
      if (next === previous) return;
      historyRef.current = recordChange(historyRef.current, previous, Date.now(), { boundary });
      stateRef.current = next;
      onChange(next);
      syncFlags();
    },
    [onChange, readOnly, syncFlags]
  );
  const changeDesign = useCallback(
    (fn: (current: PageantSiteDesign) => PageantSiteDesign, boundary = true) =>
      update((current) => {
        const nextDesign = fn(current.values.publicSiteDesign);
        return nextDesign === current.values.publicSiteDesign ? current : { ...current, values: { ...current.values, publicSiteDesign: nextDesign } };
      }, boundary),
    [update]
  );
  const changeValues = useCallback((patch: Partial<SiteFormValues>, boundary = false) => update((current) => ({ ...current, values: { ...current.values, ...patch } }), boundary), [update]);
  const changePartners = useCallback((partners: FooterPartnersDraft) => update((current) => ({ ...current, partners })), [update]);
  const changeHighlights = useCallback((highlightsText: string) => update((current) => ({ ...current, highlightsText })), [update]);

  const undo = useCallback(() => {
    const step = undoStep(historyRef.current, stateRef.current);
    if (!step) return;
    historyRef.current = step.history;
    stateRef.current = step.value;
    onChange(step.value);
    syncFlags();
  }, [onChange, syncFlags]);
  const redo = useCallback(() => {
    const step = redoStep(historyRef.current, stateRef.current);
    if (!step) return;
    historyRef.current = step.history;
    stateRef.current = step.value;
    onChange(step.value);
    syncFlags();
  }, [onChange, syncFlags]);

  // Guardar avisa (sin impedirlo) si quedó texto de ejemplo en una sección del estudio.
  const save = useCallback(async () => {
    if (readOnly) return;
    const ok = await onSave();
    if (!ok) return;
    const pending = blocksWithSampleText(stateRef.current.values.publicSiteDesign).length;
    if (pending > 0) toast.warning(`${pending === 1 ? 'Una sección del estudio todavía tiene' : `${pending} secciones del estudio todavía tienen`} texto de ejemplo: búscalas en «Estructura».`);
  }, [onSave, readOnly]);

  const select = useCallback((key: EditorKey | null, reveal = false) => {
    setSelected(key);
    if (key) {
      setTab('seccion');
      setPanelOpen(true);
      if (reveal) setScrollTo((previous) => ({ key, seq: (previous?.seq ?? 0) + 1 }));
    }
  }, []);

  // Una sección del estudio que ya no existe (se eliminó o se deshizo) deja de estar seleccionada.
  useEffect(() => {
    if (selected?.startsWith('block:') && !design.blocks.some((block) => `block:${block.id}` === selected)) setSelected(null);
  }, [design.blocks, selected]);

  const runAction = useCallback(
    async (key: EditorKey, action: EditorAction) => {
      const item = key === 'footer' ? null : parseItemKey(key);
      if (!item || readOnly) return;
      if (action === 'up' || action === 'down') {
        changeDesign((current) => moveItem(current, key, action === 'up' ? -1 : 1, renderedRef.current));
        return;
      }
      if (action === 'hide') {
        changeDesign((current) => toggleHidden(current, key));
        return;
      }
      if (item.kind !== 'block') return;
      if (action === 'duplicate') {
        const result = duplicateStudioBlock(stateRef.current.values.publicSiteDesign, item.id);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        changeDesign(() => result.design);
        if (result.blockId) select(`block:${result.blockId}`, true);
        return;
      }
      const label = itemLabel(stateRef.current.values.publicSiteDesign, item);
      const ok = await confirm({ title: `¿Eliminar «${label}»?`, description: 'Se quita del sitio con todo su contenido. Puedes deshacerlo con Ctrl + Z mientras no cierres el editor.', confirmLabel: 'Eliminar', destructive: true });
      if (!ok) return;
      changeDesign((current) => removeStudioBlock(current, item.id));
      setSelected(null);
    },
    [changeDesign, confirm, readOnly, select]
  );

  const onCanvas = useCallback(
    (message: ToEditorMessage) => {
      switch (message.type) {
        case 'select':
          select(message.key);
          break;
        case 'insert':
          if (!readOnly) setInsertAt({ after: message.after, before: message.before });
          break;
        case 'action':
          void runAction(message.key, message.action);
          break;
        case 'editText': {
          const result = applyInlineText(stateRef.current.values.publicSiteDesign, message.key, message.field, message.value);
          update(
            (current) => ({
              ...current,
              values: {
                ...current.values,
                publicSiteDesign: result.design,
                ...(result.tagline !== undefined ? { publicTagline: result.tagline } : {}),
                ...(result.description !== undefined ? { publicDescription: result.description } : {}),
              },
            }),
            true
          );
          break;
        }
        case 'notice':
          toast.info(message.text);
          break;
        case 'shortcut':
          if (message.shortcut === 'undo') undo();
          else if (message.shortcut === 'redo') redo();
          else if (message.shortcut === 'save') void save();
          else setSelected(null);
          break;
        case 'rendered':
          setRendered(new Set(message.keys));
          break;
        case 'ready':
          break;
      }
    },
    [readOnly, redo, runAction, save, select, undo, update]
  );

  // Atajos con el foco en el panel (dentro del lienzo los reenvía el propio lienzo).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      } else if (!typing && mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (!typing && mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, save, undo]);

  // ── Insertar desde el diálogo de secciones ────────────────────────────────
  const studioDocument = useMemo(() => documentFromBlocks(design.blocks, design.theme), [design.blocks, design.theme]);
  const pickSection = useCallback(
    (type: BlockType, variant?: string) => {
      const at = insertAt ?? { after: null, before: null };
      const block: WebSiteBlock = variant !== undefined ? sampleBlock(type, variant) : createBlock(type);
      const result = insertStudioBlock(stateRef.current.values.publicSiteDesign, block, at);
      setInsertAt(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      changeDesign(() => result.design);
      select(`block:${block.id}`, true);
    },
    [changeDesign, insertAt, select]
  );
  const whereLabel = useMemo(() => {
    if (!insertAt) return 'en el sitio';
    const name = (key: EditorKey | null) => {
      if (!key || key === 'footer') return null;
      const item = parseItemKey(key);
      return item ? itemLabel(design, item) : null;
    };
    const after = name(insertAt.after);
    const before = name(insertAt.before);
    return after ? `después de «${after}»` : before ? `antes de «${before}»` : 'al final del sitio, antes del pie';
  }, [design, insertAt]);

  // ── Imágenes del estudio (mismo almacenamiento y carpeta que el estudio clásico) ──
  const assetsContext = useMemo(() => {
    const urls = [...new Set([state.values.coverImageUrl, state.values.directorPhotoUrl, state.values.faviconUrl, ...design.blocks.flatMap(blockImageUrls)])].filter(Boolean);
    const assets: EditorAsset[] = [
      ...urls.map((url, i) => ({ id: `existing-${i}`, url, fileName: `Imagen ${i + 1}`, mimeType: 'image/webp', sizeBytes: 0, alt: '' })),
      ...uploaded.filter((asset) => !urls.includes(asset.url)),
    ];
    return {
      siteId: project.id,
      assets,
      readOnly,
      addAsset: (asset: EditorAsset) => setUploaded((previous) => [...previous, asset]),
      uploadAsset: async (file: File, alt = '') => {
        const url = await upload(file, 'studio');
        if (!url) return { ok: false as const, error: 'No se pudo subir la imagen' };
        return { ok: true as const, asset: { id: crypto.randomUUID(), url, fileName: file.name, mimeType: file.type, sizeBytes: file.size, alt } };
      },
    };
  }, [design.blocks, project.id, readOnly, state.values.coverImageUrl, state.values.directorPhotoUrl, state.values.faviconUrl, upload, uploaded]);

  const api: PanelApi = {
    state,
    readOnly,
    projectId: project.id,
    projectName: project.name,
    changeDesign,
    changeValues,
    changePartners,
    changeHighlights,
    upload: (file, purpose) => upload(file, purpose),
    reloadCanvas: () => setReloadKey((n) => n + 1),
  };

  const stageState = useMemo(() => ({ draft: toCanvasDraft(state), audience, mode, selected }), [state, audience, mode, selected]);
  const deviceInfo = STAGE_DEVICES.find((entry) => entry.id === device) ?? STAGE_DEVICES[0];
  const selectedItem = selected && selected !== 'footer' ? parseItemKey(selected) : null;
  const selectedBlock = selectedItem?.kind === 'block' ? design.blocks.find((block) => block.id === selectedItem.id) : undefined;

  let panel;
  if (tab === 'estructura') {
    panel = (
      <StructurePanel
        design={design}
        rendered={rendered}
        selected={selected}
        readOnly={readOnly}
        onSelect={(key) => select(key, true)}
        onMove={(key, dir) => changeDesign((current) => moveItem(current, key, dir, renderedRef.current))}
        onMoveTo={(key, index) => changeDesign((current) => moveItemTo(current, key, index))}
        onToggleHidden={(key) => changeDesign((current) => toggleHidden(current, key))}
        onDuplicate={(blockId) => void runAction(`block:${blockId}`, 'duplicate')}
        onRemove={(blockId) => void runAction(`block:${blockId}`, 'delete')}
        onInsert={(at) => setInsertAt(at)}
      />
    );
  } else if (tab === 'diseno') {
    panel = <DesignPanel api={api} />;
  } else if (selected === 'footer') {
    panel = <FooterPanel api={api} />;
  } else if (selectedItem?.kind === 'section') {
    panel = <SectionPanel id={selectedItem.id} api={api} rendered={rendered.size > 0 ? rendered.has(selected!) : null} />;
  } else if (selectedBlock) {
    panel = <BlockPanel block={selectedBlock} api={api} onChange={(block, boundary) => changeDesign((current) => updateStudioBlock(current, block), boundary ?? false)} />;
  } else {
    panel = <EmptySelection onUndoHint />;
  }

  const sectionCount = designLayout(design).length;

  return (
    <EditorAssetsContext.Provider value={assetsContext}>
      <div className="fixed inset-0 z-[45] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={`Editor visual del sitio de ${project.name}`}>
        {/* ── Barra superior ─────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 shadow-card lg:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <X aria-hidden="true" />
              Cerrar
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="lg:hidden" aria-label={panelOpen ? 'Ocultar el panel' : 'Mostrar el panel'} aria-pressed={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
              <PanelLeft aria-hidden="true" />
            </Button>
            <div className="hidden min-w-0 max-w-[15rem] pl-1 md:block">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Editor visual</p>
              <p className="truncate text-sm font-semibold" title={project.name}>
                {project.name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
            <Segmented label="Dispositivo">
              {STAGE_DEVICES.map((entry) => {
                const Icon = DEVICE_ICONS[entry.id];
                return (
                  <SegmentButton key={entry.id} active={device === entry.id} onClick={() => setDevice(entry.id)} title={`${entry.label} (${entry.width} px)`} label={entry.label}>
                    <Icon className="size-4" aria-hidden="true" />
                  </SegmentButton>
                );
              })}
            </Segmented>
            <select
                aria-label="Zoom de la vista previa"
                title="Zoom de la vista previa"
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                value={String(zoom)}
                onChange={(event) => setZoom(event.target.value === 'fit' ? 'fit' : (Number(event.target.value) as StageZoom))}
              >
                {ZOOMS.map((entry) => (
                  <option key={String(entry.value)} value={String(entry.value)}>
                    {entry.label}
                  </option>
                ))}
            </select>
            <Segmented label="Vista del sitio">
              <SegmentButton active={audience === 'candidata'} onClick={() => setAudience('candidata')} title="Lo que ve una postulante">
                Candidata
              </SegmentButton>
              <SegmentButton active={audience === 'sponsor'} onClick={() => setAudience('sponsor')} title="Lo que ve una marca">
                Sponsor
              </SegmentButton>
            </Segmented>
            <Segmented label="Modo">
              <SegmentButton active={mode === 'edit'} onClick={() => setMode('edit')} title="Clic para seleccionar y doble clic para escribir">
                <MousePointer2 className="size-4" aria-hidden="true" />
                Editar
              </SegmentButton>
              <SegmentButton active={mode === 'test'} onClick={() => setMode('test')} title="Recorrer el sitio como un visitante">
                <Eye className="size-4" aria-hidden="true" />
                Probar
              </SegmentButton>
            </Segmented>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="icon-sm" disabled={!flags.undo || readOnly} title="Deshacer (Ctrl + Z)" aria-label="Deshacer" onClick={undo}>
              <Undo2 aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" disabled={!flags.redo || readOnly} title="Rehacer (Ctrl + Shift + Z)" aria-label="Rehacer" onClick={redo}>
              <Redo2 aria-hidden="true" />
            </Button>
            <span aria-live="polite" className={cn('hidden whitespace-nowrap px-1 text-xs font-medium xl:inline', dirty ? 'text-warning' : 'text-muted-foreground')}>
              {saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}
            </span>
            {project.publicSiteEnabled && project.publicUrl && (
              <a
                href={project.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver el sitio publicado (lo guardado)"
                className="hidden h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="hidden 2xl:inline">Ver publicado</span>
                <span className="sr-only 2xl:hidden">Ver publicado</span>
              </a>
            )}
            {canWrite && (
              <Button type="button" size="sm" className="whitespace-nowrap" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {state.values.publicSiteEnabled ? 'Guardar y publicar' : 'Guardar'}
              </Button>
            )}
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          {/* ── Panel ──────────────────────────────────────────────────────── */}
          <aside className={cn('absolute inset-y-0 left-0 z-10 w-[24rem] max-w-[92vw] flex-col border-r border-border bg-card shadow-lg lg:static lg:flex lg:shadow-none', panelOpen ? 'flex' : 'hidden')} aria-label="Panel del editor">
            <div className="flex border-b border-border" role="tablist" aria-label="Partes del editor">
              {(
                [
                  ['estructura', `Estructura (${sectionCount})`],
                  ['seccion', 'Sección'],
                  ['diseno', 'Diseño'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn('flex-1 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors', tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'seccion' && selected && (
                <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <button type="button" className="inline-flex items-center gap-1 rounded hover:text-foreground" onClick={() => setTab('estructura')}>
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                    Estructura
                  </button>
                  <button type="button" className="inline-flex items-center gap-1 rounded hover:text-foreground" onClick={() => setScrollTo((previous) => ({ key: selected, seq: (previous?.seq ?? 0) + 1 }))}>
                    <LocateFixed className="size-3.5" aria-hidden="true" />
                    Ir a la sección
                  </button>
                </div>
              )}
              {panel}
            </div>
          </aside>

          {/* ── Lienzo ─────────────────────────────────────────────────────── */}
          <EditorStage
            src={`/preview/certamen/${project.id}/editor`}
            width={deviceInfo.width}
            zoom={zoom}
            state={stageState}
            onMessage={onCanvas}
            scrollTo={scrollTo}
            reloadKey={reloadKey}
            phoneFrame={device === 'phone'}
          />
        </div>
      </div>

      <AddSectionDialog
        open={insertAt !== null}
        onOpenChange={(open) => !open && setInsertAt(null)}
        onPick={pickSection}
        whereLabel={whereLabel}
        heroBlocked={design.blocks.some((block) => block.type === 'hero')}
        suggestions={buildSuggestions([], new Set(design.blocks.map((block) => block.type)))}
        theme={design.theme}
        document={studioDocument}
        unavailable={{ form: 'Este micrositio usa su propio formulario de inscripción: los formularios a medida son de los sitios web.' }}
      />
    </EditorAssetsContext.Provider>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
      {children}
    </div>
  );
}

function SegmentButton({ active, onClick, title, label, children }: { active: boolean; onClick: () => void; title: string; label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors', active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  );
}
