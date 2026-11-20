'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, ClipboardPaste, Eye, Layers, Magnet, LayoutPanelTop, Monitor, Move, PanelRight, Redo2, Smartphone, Tablet, Undo2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddSectionDialog } from '@/components/web-sites/AddSectionDialog';
import { BlockFields } from '@/components/web-sites/BlockEditor';
import { CanvasEditor } from '@/components/web-sites/CanvasEditor';
import { LayoutPicker } from '@/components/web-sites/LayoutPicker';
import { SectionStyleFields } from '@/components/web-sites/SectionStyleFields';
import { SiteDesignAssistant } from '@/components/web-sites/SiteDesignAssistant';
import { ThemePanel } from '@/components/web-sites/ThemePanel';
import { EditorAssetsContext, blockSummary, uploadCreativeAsset, type EditorAsset } from '@/components/web-sites/editor-shared';
import { canRedo, canUndo, emptyHistory, recordChange, redoStep, undoStep } from '@/components/web-sites/editor-history';
import { PAGEANT_INSERTIONS, PAGEANT_INSERTION_POINTS, PAGEANT_REGIONS, pageantBlockPlacement, pageantDesignForDisplay, pageantDesignImageUrls, pageantItemKeySchema, pageantRegionSchema, placePageantBlock, type PageantBlockTarget, type PageantInsertion, type PageantSiteDesign } from '@/lib/events/pageant-site-design';
import { compositionsFit, createPageantComposition, MAX_PAGEANT_COMPOSITIONS, pageantCompositions, placePageantComposition, type PageantComposition } from '@/lib/events/pageant-compositions';
import { PAGEANT_LAYER_LABELS, pageantStudioShortcut, type PageantCanvasPoint, type PageantCanvasRef, type PageantLayerCommand, type PageantLayerKind, type PageantStudioCommand, type PageantStudioState, type PageantPreviewContent, type PreviewToStudio } from '@/lib/events/pageant-studio';
import { alignLayers, copyLayers, deleteLayers, distributeLayers, duplicateLayers, moveLayers, pasteLayers } from '@/lib/events/pageant-layer-operations';
import { PAGEANT_NATIVE_TEXT, isPageantNativeTextField, type PageantNativeText } from '@/lib/events/pageant-native-text';
import { BLOCK_INFO, MAX_BLOCKS, cloneBlock, createBlock, type BlockType, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { CANVAS_MAX_ELEMENTS, canvasElementSchema, canvasSchema, constrainPosition, type CanvasDevice, type CanvasElement, type SiteCanvas } from '@/lib/web-sites/canvas';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { documentFromBlocks, homeOf } from '@/lib/web-sites/site';
import { PageantStudioFrame, sendToPageantPreview, type PageantZoom } from './PageantStudioFrame';
import { PageantFooterFields } from './PageantFooterFields';
import { PageantSelectionTools } from './PageantSelectionTools';
import { PageantCompositionDialog } from './PageantCompositionDialog';

const EMPTY_CANVAS = canvasSchema.parse({});
const FIT_CANVAS = { ...EMPTY_CANVAS, enabled: true, fitContent: true };
type InsertTool = NonNullable<PageantStudioState['inserting']>;
const DEVICES = [{ id: 'desktop', label: 'Escritorio', Icon: Monitor }, { id: 'tablet', label: 'Tablet', Icon: Tablet }, { id: 'mobile', label: 'Celular', Icon: Smartphone }] as const;
const LAYER_KINDS = Object.keys(PAGEANT_LAYER_LABELS) as PageantLayerKind[];
const SELECT_STYLE = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm';

type Selection = PageantCanvasRef & { layerIds: string[] };
type StudioSnapshot = { design: PageantSiteDesign; nativeText: PageantNativeText };
type StudioImage = EditorAsset & { ratio?: number };
type Panel = 'sections' | 'properties' | 'theme';

interface Props {
  projectId: string;
  design: PageantSiteDesign;
  content: PageantPreviewContent;
  nativeText: PageantNativeText;
  onNativeTextChange: (value: PageantNativeText) => void;
  images: string[];
  galaDate: string | null;
  venueName: string | null;
  canWrite: boolean;
  saving: boolean;
  publishOnSave: boolean;
  onChange: (design: PageantSiteDesign) => void;
  onSave: () => Promise<void>;
}

function sectionName(block: WebSiteBlock) {
  return block.style.canvas?.replaceContent ? 'Lienzo libre' : BLOCK_INFO[block.type].label;
}

const editTime = () => Date.now();

function createLayer(kind: PageantLayerKind, point?: PageantCanvasPoint, onNativeSection = false, onDarkSection = false) {
  const position = constrainPosition({
    x: point?.x ?? 10, y: point?.y ?? 15,
    width: kind === 'button' ? 32 : 40,
    height: onNativeSection && point ? (kind === 'text' || kind === 'button' ? 55 : 115) / point.canvasHeight * 100 : kind === 'text' || kind === 'button' ? 18 : 36,
  });
  return canvasElementSchema.parse({
    id: crypto.randomUUID(), kind, name: PAGEANT_LAYER_LABELS[kind], desktop: position,
    ...(point ? { [point.device]: position } : {}),
    text: kind === 'text' ? 'Escribe aquí' : kind === 'button' ? 'Más información' : '',
    transparent: kind === 'text' || kind === 'image',
    background: kind === 'shape' ? '#dbeafe' : '#1d4ed8',
    color: kind === 'button' || onDarkSection ? '#ffffff' : '#111827',
    fontWeight: kind === 'text' ? '500' : '700',
    radius: kind === 'button' ? 8 : 0,
  });
}

export function PageantVisualStudio(props: Props) {
  const { canWrite } = props;
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><LayoutPanelTop size={20} aria-hidden="true" /></span>
        <div>
          <h2 className="text-base font-semibold">Editor de capas y composiciones</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Edita sobre la página y revisa los cambios en vivo en escritorio, tablet y celular.</p>
        </div>
      </div>
      <Button type="button" onClick={() => setOpen(true)}>{canWrite ? 'Abrir editor de capas' : 'Ver capas y composiciones'}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent showClose={false} className="flex h-dvh max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-popover p-0">
            <StudioEditor {...props} close={() => setOpen(false)} />
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function StudioEditor({ projectId, design, content, nativeText, onNativeTextChange, images, galaDate, venueName, canWrite, saving, publishOnSave, onChange, onSave, close }: Props & { close: () => void }) {
  const [history, setHistory] = useState(emptyHistory<StudioSnapshot>);
  const lastEdit = useRef<string | undefined>(undefined);
  const [selection, setSelection] = useState<Selection>();
  const [panel, setPanel] = useState<Panel>('sections');
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [preview, setPreview] = useState(!canWrite);
  const [device, setDevice] = useState<CanvasDevice>('desktop');
  const [canvasDevice, setCanvasDevice] = useState<CanvasDevice>();
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState<PageantZoom>('fit');
  const [inserting, setInserting] = useState<PageantStudioState['inserting']>();
  const [movingContent, setMovingContent] = useState(false);
  const [image, setImage] = useState<StudioImage>();
  const [composition, setComposition] = useState<PageantComposition>();
  const [compositionDialog, setCompositionDialog] = useState<'browse' | 'save'>();
  const [uploading, setUploading] = useState(false);
  const uploadBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);
  const [target, setTarget] = useState<PageantBlockTarget>();
  const [book, setBook] = useState<PageantBlockTarget>();
  const [uploaded, setUploaded] = useState<EditorAsset[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const edit = canWrite && !preview;
  const disabled = saving || uploading || !edit;
  const showPanel = edit && panelOpen;
  const selected = design.blocks.find((block) => block.id === selection?.id);
  const selectedRegion = selection?.region;
  const selectedOverlay = selectedRegion ? design.overlays?.[selectedRegion] : undefined;
  const selectedCanvas = selectedRegion ? selectedOverlay : selected?.style.canvas;
  const layerIds = selection?.layerIds.filter((id) => selectedCanvas?.elements.some((layer) => layer.id === id)) ?? [];
  const layerId = layerIds.at(-1);
  const activeDevice = canvasDevice ?? device;
  const doc = useMemo(() => documentFromBlocks(design.blocks, design.theme), [design.blocks, design.theme]);
  const displayDesign = useMemo(() => pageantDesignForDisplay(design), [design]);
  const builtInCompositions = useMemo(() => pageantCompositions(design.theme.accent, galaDate, venueName), [design.theme.accent, galaDate, venueName]);
  const pageId = homeOf(doc).id;
  const frameState: PageantStudioState = {
    design: displayDesign, content, nativeText, editing: edit, selection, layerId, layerIds, canPaste: clipboard.length > 0, inserting: disabled ? undefined : inserting, movingContent: !disabled && movingContent, snap,
  };
  const urls = [...new Set([...images, ...pageantDesignImageUrls(design)])].filter(Boolean);
  const assets: EditorAsset[] = [
    ...urls.filter((url) => !uploaded.some((asset) => asset.url === url)).map((url, index) => ({ id: `existing-${index}`, url, fileName: `Imagen ${index + 1}`, mimeType: 'image/webp', sizeBytes: 0, alt: '' })),
    ...uploaded,
  ];

  function remember(source: string, boundary: boolean) {
    const at = editTime();
    const separate = boundary || lastEdit.current !== source;
    lastEdit.current = source;
    setHistory((previous) => recordChange(previous, { design, nativeText }, at, { boundary: separate }));
  }

  function change(next: PageantSiteDesign, boundary = false) {
    if (disabled || next === design) return;
    remember('design', boundary);
    onChange(next);
  }

  function selectLayers(ref: PageantCanvasRef, ids: string[], viewedDevice?: CanvasDevice) {
    setTarget(undefined);
    const canvas = ref.region ? { region: ref.region } : { id: ref.id };
    setSelection({ ...canvas, layerIds: ids });
    setCanvasDevice(viewedDevice);
    setPanel('properties');
  }

  function select(ref: PageantCanvasRef, id?: string, viewedDevice?: CanvasDevice, additive = false) {
    const same = selection && selection.id === ref.id && selection.region === ref.region;
    if (additive && id && same) {
      selectLayers(ref, layerIds.includes(id) ? layerIds.filter((item) => item !== id) : [...layerIds, id], viewedDevice);
    } else {
      selectLayers(ref, id ? [id] : [], viewedDevice);
    }
  }

  function updateBlock(block: WebSiteBlock, boundary = false) {
    change({ ...design, blocks: design.blocks.map((item) => item.id === block.id ? block : item) }, boundary);
  }

  function moveBlock(block: WebSiteBlock, destination: PageantBlockTarget) {
    change(placePageantBlock(design, block, destination), true);
    select({ id: block.id });
  }

  function nudgeBlock(direction: -1 | 1) {
    if (!selected) return;
    const slot = pageantBlockPlacement(design, selected.id);
    const group = design.blocks.filter(({ id }) => pageantBlockPlacement(design, id) === slot);
    const index = group.indexOf(selected);
    if (index + direction < 0 || index + direction >= group.length) return;
    moveBlock(selected, { slot, beforeId: group[direction === -1 ? index - 1 : index + 2]?.id });
  }

  function addBlock(block: WebSiteBlock, destination: PageantBlockTarget, ids: string[] = []) {
    if (design.blocks.length >= MAX_BLOCKS) return toast.error(`Puedes agregar hasta ${MAX_BLOCKS} secciones.`);
    change(placePageantBlock({ ...design, enabled: true }, block, destination), true);
    selectLayers({ id: block.id }, ids);
    setInserting(undefined);
  }

  function addLayer(kind: InsertTool, destination: PageantBlockTarget) {
    if (kind === 'composition') {
      if (composition) addComposition(composition, destination);
      return;
    }
    const base = { ...EMPTY_CANVAS, enabled: true, replaceContent: true, height: 320, mobileHeight: 320 };
    if (kind === 'move') {
      if (!selection || !selectedCanvas || design.blocks.length >= MAX_BLOCKS) return;
      const layers = selectedCanvas.elements.filter((layer) => !layer.locked && layerIds.includes(layer.id));
      if (!layers.length) return;
      const block = createBlock('text');
      const remaining = deleteLayers(selectedCanvas, layerIds);
      const next = withCanvas({ ...design, enabled: true }, selection, remaining);
      const canvas = { ...base, elements: layers };
      change(placePageantBlock(next, { ...block, style: { ...block.style, spacing: 'none', width: 'wide', canvas } }, destination), true);
      selectLayers({ id: block.id }, layers.map(({ id }) => id));
      setInserting(undefined);
      return;
    }
    const layers = kind === 'paste' ? pasteLayers(base, clipboard, { device: activeDevice, offset: 0 })?.canvas.elements
      : kind === 'upload' ? image && [imageLayer(image)] : [createLayer(kind)];
    if (!layers?.length) return;
    const block = createBlock('text');
    addBlock({
      ...block, style: { ...block.style, spacing: 'none', width: 'wide',
        canvas: { ...base, elements: layers },
      },
    }, destination, layers.map(({ id }) => id));
  }

  function readCanvas(ref: PageantCanvasRef) {
    return ref.region ? design.overlays?.[ref.region] : design.blocks.find(({ id }) => id === ref.id)?.style.canvas;
  }

  function addComposition(item: PageantComposition, destination: PageantBlockTarget) {
    const block = createBlock('text');
    const base = { ...EMPTY_CANVAS, enabled: true, replaceContent: true, height: item.height, mobileHeight: item.mobileHeight };
    const result = placePageantComposition(base, item, device);
    if (result) addBlock({
      ...block,
      style: { ...block.style, spacing: 'none', width: 'wide', canvas: result.canvas },
    }, destination, result.ids);
  }

  function chooseComposition(item: PageantComposition) {
    if (disabled) return;
    setCompositionDialog(undefined);
    setMovingContent(false);
    if (target) {
      addComposition(item, target);
    } else {
      setComposition(item);
      setInserting('composition');
    }
  }

  function saveComposition(name: string) {
    const library = design.compositions ?? [];
    if (disabled || !selectedCanvas || library.length >= MAX_PAGEANT_COMPOSITIONS) return;
    const item = createPageantComposition(name, selectedCanvas, layerIds);
    if (!item) {
      toast.error('No se pudo guardar la selección como composición.');
      return;
    }
    const compositions = [...library, item];
    if (!compositionsFit(compositions)) {
      toast.error('La biblioteca está llena. Elimina una composición para guardar otra.');
      return;
    }
    change({ ...design, compositions }, true);
    setCompositionDialog(undefined);
    toast.success('Composición agregada a la biblioteca. Guarda el sitio para conservarla.');
  }

  function withCanvas(source: PageantSiteDesign, ref: PageantCanvasRef, canvas: SiteCanvas) {
    if (ref.region) {
      const overlays = { ...source.overlays };
      if (canvas.elements.length) overlays[ref.region] = canvas;
      else delete overlays[ref.region];
      return { ...source, overlays };
    }
    const blocks = source.blocks.map((block) => block.id === ref.id ? { ...block, style: { ...block.style, canvas } } : block);
    return { ...source, blocks };
  }

  function updateCanvas(ref: PageantCanvasRef, canvas: SiteCanvas, boundary = false, activate = false) {
    if (readCanvas(ref) !== canvas) change(withCanvas({ ...design, enabled: design.enabled || activate }, ref, canvas), boundary);
  }

  function editLayer(ref: PageantCanvasRef, layerId: string, patch: Partial<CanvasElement>, boundary = false) {
    const canvas = readCanvas(ref);
    if (!canvas?.elements.some((layer) => layer.id === layerId)) return;
    updateCanvas(ref, { ...canvas, elements: canvas.elements.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) }, boundary);
  }

  function appendLayer(ref: PageantCanvasRef, layer: CanvasElement, point: PageantCanvasPoint, key?: string) {
    const canvas = readCanvas(ref) ?? FIT_CANVAS;
    if (!ref.region && !design.blocks.some(({ id }) => id === ref.id)) return;
    if (canvas.elements.length >= CANVAS_MAX_ELEMENTS) {
      toast.error(`Un lienzo admite hasta ${CANVAS_MAX_ELEMENTS} capas.`);
      return;
    }
    let next = withCanvas({ ...design, enabled: true }, ref, { ...canvas, enabled: true, elements: [...canvas.elements, layer] });
    if (key) next = { ...next, relocated: { ...design.relocated, [key]: layer.id } };
    change(next, true);
    select(ref, layer.id, point.device);
    setInserting(undefined);
    setMovingContent(false);
  }

  function imageLayer(asset: StudioImage, point?: PageantCanvasPoint) {
    const element = createLayer('image', point, Boolean(point));
    const boardRatio = point?.canvasWidth ? point.canvasWidth / point.canvasHeight : 2;
    const width = asset.ratio ? Math.min(40, 60 * asset.ratio / boardRatio) : element.desktop.width;
    const height = asset.ratio ? width * boardRatio / asset.ratio : element.desktop.height;
    const position = constrainPosition({ ...element.desktop, x: point?.x ?? element.desktop.x, y: point?.y ?? element.desktop.y, width, height });
    return { ...element, desktop: position, ...(point && { [point.device]: position }), name: asset.fileName.slice(0, 80) || 'Imagen', imageUrl: asset.url, alt: asset.alt };
  }

  function place(kind: InsertTool, ref: PageantCanvasRef, point: PageantCanvasPoint) {
    if (kind === 'paste') return pasteAt(ref, point);
    if (kind === 'composition') {
      if (!composition) return;
      const result = placePageantComposition(readCanvas(ref) ?? FIT_CANVAS, composition, point.device, point);
      if (!result) {
        toast.error(`La composición necesita ${composition.elements.length} capas libres. Elige otra sección o usa un punto entre secciones.`);
        return;
      }
      updateCanvas(ref, result.canvas, true, true);
      selectLayers(ref, result.ids, point.device);
      setInserting(undefined);
      return;
    }
    if (kind === 'move') {
      if (selection) transfer({ type: 'transfer', from: selection, to: ref, layerIds, device: point.device, point });
      setInserting(undefined);
      return;
    }
    if (kind === 'upload') {
      if (image) appendLayer(ref, imageLayer(image, point), point);
      return;
    }
    const dark = Boolean(ref.region && !['certamen', 'gala', 'preguntas'].includes(ref.region));
    appendLayer(ref, createLayer(kind, point, Boolean(ref.region), dark), point);
  }

  async function uploadImage(file: File, point?: PageantCanvasRef & PageantCanvasPoint) {
    if (disabled || uploadBusy.current) return;
    uploadBusy.current = true;
    setUploading(true);
    try {
      const result = await uploadCreativeAsset('event', projectId, file);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file).catch(() => undefined) : undefined;
      const asset = { ...result.asset, ratio: bitmap && bitmap.width / bitmap.height };
      bitmap?.close();
      setUploaded((previous) => [...previous, asset]);
      if (point) appendLayer(point, imageLayer(asset, point), point);
      else {
        setImage(asset);
        setInserting('upload');
        setMovingContent(false);
      }
    } finally {
      uploadBusy.current = false;
      setUploading(false);
    }
  }

  function relocate(message: Extract<PreviewToStudio, { type: 'relocate' }>) {
    const key = pageantItemKeySchema.safeParse(message.key);
    const geometry = message.content.desktop;
    if (!key.success || !geometry) return;
    const position = constrainPosition(geometry);
    const element = canvasElementSchema.safeParse({
      ...message.content, id: crypto.randomUUID(), desktop: position, [message.device]: position,
    });
    if (element.success) appendLayer(message, element.data, message, key.data);
  }

  function transfer(message: Extract<PreviewToStudio, { type: 'transfer' }>) {
    const origin = readCanvas(message.from);
    const destination = readCanvas(message.to) ?? FIT_CANVAS;
    if (!origin || (!message.to.region && !design.blocks.some(({ id }) => id === message.to.id))) return;
    const items = origin.elements.filter((layer) => !layer.locked && message.layerIds.includes(layer.id));
    const result = pasteLayers({ ...destination, elements: [] }, items, { device: message.device, point: message.point });
    if (!result) return;
    const sameCanvas = message.from.id === message.to.id && message.from.region === message.to.region;
    const remaining = deleteLayers(origin, items.map(({ id }) => id));
    const base = sameCanvas ? remaining : destination;
    if (base.elements.length + items.length > CANVAS_MAX_ELEMENTS) {
      toast.error(`Un lienzo admite hasta ${CANVAS_MAX_ELEMENTS} capas.`);
      return;
    }
    const ids = items.map(({ id }) => id);
    const layers = result.canvas.elements.map((layer, index) => ({ ...layer, id: ids[index] }));
    const without = sameCanvas ? design : withCanvas(design, message.from, remaining);
    const next = withCanvas(without, message.to, { ...base, enabled: true, elements: [...base.elements, ...layers] });
    change({ ...next, enabled: true }, true);
    selectLayers(message.to, ids, message.device);
  }

  function changeDevice(next: CanvasDevice) {
    setDevice(next);
    setCanvasDevice(undefined);
  }

  function pasteAt(ref: PageantCanvasRef, point?: PageantCanvasPoint) {
    if (!clipboard.length) return;
    const viewedDevice = point?.device ?? activeDevice;
    const result = pasteLayers(readCanvas(ref) ?? FIT_CANVAS, clipboard, { device: viewedDevice, point });
    if (!result) return toast.error(`Un lienzo admite hasta ${CANVAS_MAX_ELEMENTS} capas. Elige otra sección para pegar.`);
    updateCanvas(ref, result.canvas, true, true);
    selectLayers(ref, result.ids, viewedDevice);
    setInserting(undefined);
  }

  function layerCommand(command: PageantLayerCommand) {
    if (disabled) return;
    if (command === 'paste') {
      if (!clipboard.length) return;
      if (selection && (selected || selectedRegion)) pasteAt(selection);
      else setInserting('paste');
      return;
    }
    if (!selection || !selectedCanvas || !layerIds.length) return;
    if (command === 'copy' || command === 'cut') {
      const ids = command === 'cut'
        ? selectedCanvas.elements.filter((layer) => layerIds.includes(layer.id) && !layer.locked).map(({ id }) => id) : layerIds;
      if (!ids.length) return;
      setClipboard(copyLayers(selectedCanvas, ids));
      if (command === 'copy') return;
    }
    if (command === 'delete' || command === 'cut') {
      const next = deleteLayers(selectedCanvas, layerIds);
      updateCanvas(selection, next, true);
      selectLayers(selection, layerIds.filter((id) => next.elements.some((layer) => layer.id === id)), activeDevice);
    } else if (command === 'duplicate') {
      const result = duplicateLayers(selectedCanvas, layerIds, activeDevice);
      if (!result) return toast.error(`Un lienzo admite hasta ${CANVAS_MAX_ELEMENTS} capas.`);
      updateCanvas(selection, result.canvas, true);
      selectLayers(selection, result.ids, activeDevice);
    }
  }

  function runCommand(command: PageantStudioCommand) {
    if (command === 'save') {
      if (canWrite && !saving && !uploadBusy.current) void onSave();
      return;
    }
    if (command === 'undo' || command === 'redo') stepHistory(command);
    else layerCommand(command);
  }

  function keyboardCommand(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input:not([type=checkbox]),textarea,select'));
    const command = pageantStudioShortcut(event, typing);
    if (!command || (command !== 'save' && !edit)) return;
    if (command === 'paste') return;
    if (['copy','cut','duplicate','delete'].includes(command) && !layerIds.length) return;
    if ((command === 'cut' || command === 'copy') && window.getSelection()?.toString()) return;
    event.preventDefault();
    runCommand(command);
  }

  function receive(message: PreviewToStudio) {
    if (message.type === 'close') {
      if (uploadBusy.current) return;
      if (inserting) setInserting(undefined);
      else if (movingContent) setMovingContent(false);
      else close();
      return;
    }
    if (message.type === 'command') {
      runCommand(message.command);
      return;
    }
    if (disabled) return;
    switch (message.type) {
      case 'insert':
        if (inserting) addLayer(inserting, message.target);
        else { setTarget(message.target); setPanel('sections'); setPanelOpen(true); }
        break;
      case 'select':
        select(message, message.layerId, message.device, message.additive);
        break;
      case 'move': {
        const block = design.blocks.find(({ id }) => id === message.id);
        if (block) moveBlock(block, message.target);
        break;
      }
      case 'place':
        if (inserting) place(inserting, message, message);
        break;
      case 'relocate':
        if (movingContent) relocate(message);
        break;
      case 'transfer':
        transfer(message);
        break;
      case 'imageDrop':
      case 'imagePaste':
        if (message.file instanceof File) void uploadImage(message.file, message.type === 'imageDrop' ? message : undefined);
        break;
      case 'position':
        editLayer(message, message.layerId, { [message.device]: message.position }, true);
        break;
      case 'translate': {
        const canvas = readCanvas(message);
        if (canvas) updateCanvas(message, moveLayers(canvas, message.layerIds, message.device, message.dx, message.dy), true);
        break;
      }
      case 'nativeText':
        if (isPageantNativeTextField(message.field) && typeof message.value === 'string' && message.value.length <= PAGEANT_NATIVE_TEXT[message.field].max && nativeText[message.field] !== message.value) {
          remember(message.field, false);
          onNativeTextChange({ ...nativeText, [message.field]: message.value });
        }
        break;
      case 'text':
        editLayer(message, message.layerId, message.value);
        break;
    }
  }

  function stepHistory(direction: 'undo' | 'redo') {
    const snapshot = { design, nativeText };
    const step = direction === 'undo' ? undoStep(history, snapshot) : redoStep(history, snapshot);
    if (disabled || !step) return;
    setHistory(step.history);
    lastEdit.current = undefined;
    if (step.value.design !== design) onChange(step.value.design);
    onNativeTextChange(step.value.nativeText);
  }

  function pickSection(type: BlockType, variant?: string) {
    if (!book || disabled) return;
    const block = variant === undefined ? createBlock(type) : sampleBlock(type, variant);
    addBlock(block.type === 'contact' ? { ...block, showForm: false } : block, book);
    setBook(undefined);
  }

  const canvasControls = selection && {
    id: layerId ?? null,
    ids: layerIds,
    onChange: (id: string | null) => select(selection, id ?? undefined, activeDevice),
    onToggle: (id: string) => select(selection, id, activeDevice, true),
    onSelectAll: (all: boolean) => selectLayers(selection, all ? selectedCanvas?.elements.map(({ id }) => id) ?? [] : [], activeDevice),
    onInsert: (kind: PageantLayerKind) => { setInserting(kind); setMovingContent(false); },
    device: activeDevice,
    onDeviceChange: changeDevice,
    tools: selectedCanvas && <>
      <PageantSelectionTools count={layerIds.length}
      movable={selectedCanvas.elements.filter((layer) => !layer.locked && layerIds.includes(layer.id)).length}
      canPaste={Boolean(clipboard.length)} disabled={disabled} onCommand={layerCommand} onPasteAt={() => { setInserting('paste'); setMovingContent(false); }}
      onAlign={(alignment) => updateCanvas(selection, alignLayers(selectedCanvas, layerIds, activeDevice, alignment), true)}
      onDistribute={(axis) => updateCanvas(selection, distributeLayers(selectedCanvas, layerIds, activeDevice, axis), true)}
      />
      {selectedCanvas.elements.some((layer) => !layer.locked && layerIds.includes(layer.id)) && <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { setInserting('move'); setMovingContent(false); }}>
          <Move aria-hidden="true" /> Mover a otro lugar
        </Button>
        {layerIds.length === 1 && Object.values(design.relocated ?? {}).includes(layerIds[0]) &&
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => layerCommand('delete')}>Restaurar elemento original</Button>}
      </div>}
      {layerIds.length > 0 && <Button type="button" size="sm" variant="outline" disabled={disabled}
        onClick={() => { setInserting(undefined); setMovingContent(false); setCompositionDialog('save'); }}>
        <BookmarkPlus aria-hidden="true" /> Guardar como composición
      </Button>}
    </>,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={keyboardCommand} onPaste={(event) => {
      if (disabled || (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input,textarea,select')))) return;
      const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        void uploadImage(file);
      } else if (clipboard.length) {
        event.preventDefault();
        layerCommand('paste');
      }
    }}>
      <DialogHeader className="m-0 flex-row flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-3 py-2 sm:px-4">
        <div>
          <DialogTitle>Editor del certamen</DialogTitle>
          <DialogDescription className="sr-only">Coloca contenido en la vista en vivo y ajusta la composición en distintas pantallas.</DialogDescription>
        </div>
        <div className="flex flex-wrap gap-1 sm:gap-2">
          {canWrite && <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => { setPreview(!preview); setInserting(undefined); setMovingContent(false); }}><Eye aria-hidden="true" />{preview ? 'Volver a editar' : 'Vista previa'}</Button>}
          {canWrite && <Button type="button" size="sm" disabled={saving || uploading} onClick={() => void onSave()}>{saving ? 'Guardando…' : publishOnSave ? 'Guardar y publicar' : 'Guardar'}</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={close}>Cerrar</Button>
        </div>
      </DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border px-3 py-2 sm:px-4">
        <div className="order-1 flex shrink-0 items-center gap-1" role="group" aria-label="Dispositivo de la vista previa">
          {DEVICES.map(({ id, label, Icon }) => <Button key={id} type="button" size="sm" variant={device === id ? 'secondary' : 'ghost'} aria-pressed={device === id} aria-label={label} onClick={() => changeDevice(id)}><Icon aria-hidden="true" /><span className="hidden md:inline">{label}</span></Button>)}
          <select aria-label="Zoom del sitio" value={zoom} onChange={(event) => setZoom(event.target.value as PageantZoom)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            <option value="fit">Ajustar</option>
            <option value="75">75 %</option>
            <option value="100">100 %</option>
            <option value="125">125 %</option>
            <option value="150">150 %</option>
          </select>
        </div>
        {edit && <>
          <div className="order-3 flex min-w-0 items-center gap-1 overflow-x-auto lg:order-2" role="group" aria-label="Insertar elementos">
            <Button type="button" size="sm" variant={movingContent ? 'secondary' : 'outline'} aria-pressed={movingContent} disabled={disabled}
              onClick={() => { setMovingContent(!movingContent); setInserting(undefined); setTarget(undefined); }}>
              <Move aria-hidden="true" /> Mover contenido
            </Button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void uploadImage(file);
            }} />
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" /> {uploading ? 'Subiendo…' : 'Subir imagen'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => {
              setTarget(undefined); setInserting(undefined); setMovingContent(false); setCompositionDialog('browse');
            }}>
              <Layers aria-hidden="true" /> Composiciones
            </Button>
            {LAYER_KINDS.map((kind) => <Button key={kind} type="button" size="sm" variant={inserting === kind ? 'secondary' : 'ghost'} disabled={disabled} aria-pressed={inserting === kind}
              onClick={() => { setInserting(inserting === kind ? undefined : kind); setMovingContent(false); setTarget(undefined); }}>+ {PAGEANT_LAYER_LABELS[kind]}</Button>)}
            {clipboard.length > 0 && <Button type="button" variant={inserting === 'paste' ? 'secondary' : 'ghost'} size="sm" disabled={disabled}
              aria-pressed={inserting === 'paste'} onClick={() => { setInserting(inserting === 'paste' ? undefined : 'paste'); setMovingContent(false); setTarget(undefined); }}>
              <ClipboardPaste aria-hidden="true" /> Colocar copia
            </Button>}
            <Button type="button" variant="outline" size="sm" disabled={disabled || design.blocks.length >= MAX_BLOCKS} onClick={() => {
              const slot = selected ? pageantBlockPlacement(design, selected.id) : 'afterHero';
              setBook(target ?? { slot });
              setInserting(undefined);
              setMovingContent(false);
            }}>+ Sección</Button>
          </div>
          <div className="order-2 flex shrink-0 gap-1 lg:order-3" role="group" aria-label="Herramientas de diseño">
            <Button type="button" variant={snap ? 'secondary' : 'ghost'} size="icon-sm" aria-pressed={snap} aria-label="Guías de alineación" title="Ajustar a bordes y centros (Alt para mover libremente)" onClick={() => setSnap(!snap)}><Magnet aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-pressed={showPanel} aria-label="Panel de propiedades" title={showPanel ? 'Ocultar panel' : 'Mostrar panel'} onClick={() => setPanelOpen(!panelOpen)}><PanelRight aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" title="Deshacer" aria-label="Deshacer" disabled={disabled || !canUndo(history)} onClick={() => stepHistory('undo')}><Undo2 aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon-sm" title="Rehacer" aria-label="Rehacer" disabled={disabled || !canRedo(history)} onClick={() => stepHistory('redo')}><Redo2 aria-hidden="true" /></Button>
          </div>
        </>}
      </div>
      {edit && (inserting || movingContent) && <div role="status" className="flex items-center justify-between gap-2 border-b border-border bg-muted px-4 py-1 text-xs">
        <span>{movingContent ? 'Arrastra un texto o una foto con contorno azul. Un clic la convierte en una capa editable en su lugar.' : inserting === 'paste' ? 'Haz clic donde quieras pegar las capas o elige un punto de inserción entre secciones.' : inserting === 'move' ? 'Desplázate por la página y haz clic para mover la selección a su nuevo lugar.' : inserting === 'composition' ? `Haz clic en la página o entre secciones para colocar «${composition?.name}».` : 'Haz clic sobre la página para colocar el elemento o elige un punto de inserción entre secciones.'}</span>
        <Button type="button" size="xs" variant="ghost" onClick={() => { setInserting(undefined); setMovingContent(false); }}>Cancelar</Button>
      </div>}
      <div className={`grid min-h-0 flex-1 ${showPanel ? 'grid-rows-[minmax(0,1fr)_minmax(8rem,28%)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_23rem]' : 'grid-cols-1'}`}>
        <PageantStudioFrame projectId={projectId} frame={frame} device={device} state={frameState} onMessage={receive} saving={saving || uploading} zoom={zoom} />
        {showPanel && <aside aria-label="Ajustes del editor" className="flex min-h-0 min-w-0 flex-col border-t border-border lg:border-t-0 lg:border-l">
          <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border p-2">
            <PanelRight className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {([{ id: 'sections', label: 'Secciones' }, { id: 'properties', label: 'Propiedades' }, { id: 'theme', label: 'Diseño' }] as const).map(({ id, label }) => (
              <Button key={id} type="button" size="sm" variant={panel === id ? 'secondary' : 'ghost'} aria-pressed={panel === id} onClick={() => { setPanel(id); setTarget(undefined); }}>{label}</Button>
            ))}
          </div>
          <EditorAssetsContext.Provider value={{ siteId: projectId, assets, readOnly: disabled, addAsset: (asset) => setUploaded((previous) => [...previous, asset]), uploadAsset: (file, alt) => uploadCreativeAsset('event', projectId, file, alt) }}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4" tabIndex={0}>
              {panel === 'sections' && <>
                {target && (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <h3 className="text-sm font-semibold">Insertar aquí</h3>
                    <p className="text-xs text-muted-foreground">{PAGEANT_INSERTIONS[target.slot]}</p>
                    <div className="flex flex-wrap gap-1">
                      {LAYER_KINDS.map((kind) => <Button key={kind} size="xs" variant="outline" disabled={disabled || design.blocks.length >= MAX_BLOCKS} onClick={() => addLayer(kind, target)}>{PAGEANT_LAYER_LABELS[kind]}</Button>)}
                      <Button size="xs" variant="outline" disabled={disabled || design.blocks.length >= MAX_BLOCKS} onClick={() => setBook(target)}>Biblioteca de secciones</Button>
                      <Button size="xs" variant="outline" disabled={disabled || design.blocks.length >= MAX_BLOCKS} onClick={() => setCompositionDialog('browse')}>Composiciones</Button>
                      <Button size="xs" variant="ghost" onClick={() => setTarget(undefined)}>Cancelar</Button>
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.enabled} disabled={disabled} onChange={(event) => change({ ...design, enabled: event.target.checked }, true)} /> Mostrar las secciones y capas personalizadas</label>
                {!design.blocks.length && !Object.keys(design.overlays ?? {}).length && <p className="text-sm text-muted-foreground">Elige un elemento en la barra superior y haz clic sobre la página para colocarlo.</p>}
                {pageantRegionSchema.options.map((region) => {
                  const canvas = design.overlays?.[region];
                  if (!canvas?.elements.length) return null;
                  return <button type="button" key={region} className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => { select({ region }); sendToPageantPreview(frame.current, { type: 'scroll', region }); }}>
                    <span className="block font-medium">{PAGEANT_REGIONS[region]}</span>
                    <span className="text-xs text-muted-foreground">{canvas.elements.length} {canvas.elements.length === 1 ? 'capa superpuesta' : 'capas superpuestas'}</span>
                  </button>;
                })}
                {PAGEANT_INSERTION_POINTS.map((slot) => {
                  const blocks = design.blocks.filter(({ id }) => pageantBlockPlacement(design, id) === slot);
                  if (!blocks.length) return null;
                  return <div key={slot} className="space-y-1.5">
                    <h3 className="text-xs font-medium text-muted-foreground">{PAGEANT_INSERTIONS[slot]}</h3>
                    {blocks.map((block) => <button type="button" key={block.id}
                      className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => { select({ id: block.id }); sendToPageantPreview(frame.current, { type: 'scroll', id: block.id }); }}>
                      <span className="block font-medium">{sectionName(block)}{block.hidden ? ' · Oculta' : ''}</span>
                      <span className="block truncate text-xs text-muted-foreground">{blockSummary(block)}</span>
                    </button>)}
                  </div>;
                })}
              </>}
              {panel === 'properties' && (selectedRegion && selectedOverlay ? (
                <div key={selectedRegion} className="space-y-4">
                  <h3 className="text-sm font-semibold">Capas sobre {PAGEANT_REGIONS[selectedRegion]}</h3>
                  <CanvasEditor value={selectedOverlay} disabled={disabled} document={doc} pageId={pageId} fitSection
                    liveSelection={canvasControls}
                    onChange={(canvas) => updateCanvas({ region: selectedRegion }, canvas)}
                  />
                </div>
              ) : selected ? (
                <div key={selected.id} className="space-y-4">
                  <h3 className="text-sm font-semibold">{sectionName(selected)}</h3>
                  <label className="block space-y-1 text-xs font-medium"><span>Ubicación</span>
                    <select className={SELECT_STYLE} disabled={disabled} value={pageantBlockPlacement(design, selected.id)} onChange={(event) => moveBlock(selected, { slot: event.target.value as PageantInsertion })}>
                      {PAGEANT_INSERTION_POINTS.map((slot) => <option key={slot} value={slot}>{PAGEANT_INSERTIONS[slot]}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="icon-sm" variant="outline" aria-label="Subir sección en esta ubicación" title="Subir sección" disabled={disabled} onClick={() => nudgeBlock(-1)}><ArrowUp aria-hidden="true" /></Button>
                    <Button type="button" size="icon-sm" variant="outline" aria-label="Bajar sección en esta ubicación" title="Bajar sección" disabled={disabled} onClick={() => nudgeBlock(1)}><ArrowDown aria-hidden="true" /></Button>
                    <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => updateBlock({ ...selected, hidden: !selected.hidden }, true)}>{selected.hidden ? 'Mostrar' : 'Ocultar'}</Button>
                    <Button type="button" size="xs" variant="outline" disabled={disabled || design.blocks.length >= MAX_BLOCKS || selected.type === 'hero'} onClick={() => addBlock(cloneBlock(selected), { slot: pageantBlockPlacement(design, selected.id) })}>Duplicar</Button>
                    <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => {
                      const blockPlacements = { ...design.blockPlacements };
                      delete blockPlacements[selected.id];
                      change({ ...design, blockPlacements, blocks: design.blocks.filter(({ id }) => id !== selected.id) }, true);
                      setSelection(undefined);
                      setPanel('sections');
                    }}>Eliminar</Button>
                  </div>
                  {!(selected.style.canvas?.enabled && selected.style.canvas.replaceContent) && <>
                    <LayoutPicker block={selected} theme={design.theme} document={doc} disabled={disabled} onChange={(block) => updateBlock(block)} />
                    <BlockFields block={selected} disabled={disabled} onChange={(block) => updateBlock(block.type === 'contact' ? { ...block, showForm: false } : block)} document={doc} pageId={pageId} />
                  </>}
                  <CanvasEditor value={selected.style.canvas} disabled={disabled} document={doc} pageId={pageId}
                    liveSelection={canvasControls}
                    onChange={(canvas) => updateBlock({ ...selected, style: { ...selected.style, canvas } })}
                  />
                  <SectionStyleFields style={selected.style} type={selected.type} theme={design.theme} disabled={disabled}
                    onChange={(patch) => updateBlock({ ...selected, style: { ...selected.style, ...patch } })}
                  />
                </div>
              ) : <p className="text-sm text-muted-foreground">Selecciona una sección o una capa en el lienzo para editarla.</p>)}
              {panel === 'theme' && <>
                <PageantFooterFields value={design.footer} disabled={disabled} onChange={(footer) => change({ ...design, footer })} />
                <ThemePanel theme={design.theme} disabled={disabled} onChange={(patch) => change({ ...design, theme: { ...design.theme, ...patch } })} />
                <SiteDesignAssistant disabled={disabled} context={{ target: 'event-studio', resourceId: projectId, current: { blocks: design.blocks, theme: design.theme } }}
                  onApply={(proposal) => { if ('blocks' in proposal.design) change({ ...design, ...proposal.design, enabled: true }, true); }} />
              </>}
            </div>
          </EditorAssetsContext.Provider>
        </aside>}
      </div>
      {book && <AddSectionDialog open onOpenChange={(opened) => { if (!opened) setBook(undefined); }} onPick={pickSection}
        whereLabel={PAGEANT_INSERTIONS[book.slot]} heroBlocked={design.blocks.some(({ type }) => type === 'hero')} suggestions={[]}
        theme={design.theme} document={doc} unavailable={{ form: 'El certamen usa sus propios formularios de inscripción y auspicio.' }}
      />}
      {compositionDialog && <PageantCompositionDialog mode={compositionDialog} builtIn={builtInCompositions}
        saved={design.compositions ?? []} selectionCount={layerIds.length}
        suggestedName={layerIds.length === 1 ? selectedCanvas?.elements.find(({ id }) => id === layerId)?.name.slice(0, 64) ?? '' : ''}
        destination={target && PAGEANT_INSERTIONS[target.slot]} onInsert={chooseComposition} onSave={saveComposition}
        onDelete={(id) => change({ ...design, compositions: design.compositions?.filter((item) => item.id !== id) }, true)}
        close={() => setCompositionDialog(undefined)} />}
    </div>
  );
}
