import type { PageantBlockTarget, PageantRegion, PageantSiteDesign } from './pageant-site-design';
import type { CanvasDevice, CanvasElement, CanvasPosition } from '@/lib/web-sites/canvas';
import type { PageantEditorDraft } from './pageant-editor-draft';
import type { PageantNativeText, PageantNativeTextField } from './pageant-native-text';

export const PAGEANT_STUDIO_CHANNEL = 'pageant-studio';

export const PAGEANT_LAYER_LABELS = { text: 'Texto', image: 'Imagen', button: 'Botón', shape: 'Forma' } as const;
export const PAGEANT_INSERT_TOOL_LABELS = { ...PAGEANT_LAYER_LABELS, paste: 'Pegar capas', upload: 'Imagen', move: 'Mover aquí', composition: 'Composición' } as const;
export type PageantLayerKind = CanvasElement['kind'];
export type PageantCanvasRef = { id: string; region?: never } | { region: PageantRegion; id?: never };
export type PageantLayerCommand = 'copy' | 'cut' | 'paste' | 'duplicate' | 'delete';
export type PageantStudioCommand = 'save' | 'undo' | 'redo' | PageantLayerCommand;

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

export function pageantStudioShortcut(event: ShortcutEvent, typing: boolean): PageantStudioCommand | undefined {
  if (event.altKey) return;
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && key === 's' && !event.shiftKey) return 'save';
  if (typing) return;
  if (!modifier) return key === 'delete' || key === 'backspace' ? 'delete' : undefined;
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (event.shiftKey) return;
  const commands: Record<string, PageantStudioCommand | undefined> = { y: 'redo', c: 'copy', x: 'cut', v: 'paste', d: 'duplicate' };
  return commands[key];
}

export interface PageantCanvasPoint {
  device: CanvasDevice;
  x: number;
  y: number;
  canvasHeight: number;
  canvasWidth?: number;
}

export type PageantPreviewContent = Omit<PageantEditorDraft, 'design'>;

export interface PageantStudioState {
  design: PageantSiteDesign;
  content: PageantPreviewContent;
  nativeText: PageantNativeText;
  canPaste: boolean;
  movingContent: boolean;
  editing: boolean;
  selection?: PageantCanvasRef;
  layerId?: string;
  layerIds?: string[];
  inserting?: keyof typeof PAGEANT_INSERT_TOOL_LABELS;
  snap: boolean;
}

export type StudioToPreview =
  | { type: 'state'; state: PageantStudioState }
  | ({ type: 'scroll' } & PageantCanvasRef);

export type PreviewToStudio =
  | { type: 'ready' }
  | { type: 'close' }
  | { type: 'insert'; target: PageantBlockTarget }
  | { type: 'command'; command: PageantStudioCommand }
  | { type: 'nativeText'; field: PageantNativeTextField; value: string }
  | ({ type: 'select'; layerId?: string; device?: CanvasDevice; additive?: boolean } & PageantCanvasRef)
  | { type: 'move'; id: string; target: PageantBlockTarget }
  | ({ type: 'place' } & PageantCanvasRef & PageantCanvasPoint)
  | ({ type: 'imageDrop'; file: File } & PageantCanvasRef & PageantCanvasPoint)
  | { type: 'imagePaste'; file: File }
  | ({ type: 'relocate'; key: string; content: Partial<CanvasElement> } & PageantCanvasRef & PageantCanvasPoint)
  | { type: 'transfer'; from: PageantCanvasRef; to: PageantCanvasRef; layerIds: string[]; device: CanvasDevice; point: { x: number; y: number } }
  | ({ type: 'position'; layerId: string; device: CanvasDevice; position: CanvasPosition } & PageantCanvasRef)
  | ({ type: 'translate'; layerIds: string[]; device: CanvasDevice; dx: number; dy: number } & PageantCanvasRef)
  | ({ type: 'text'; layerId: string; value: Pick<CanvasElement, 'text' | 'richText'> } & PageantCanvasRef);

/** Alinea bordes y centros sin desplazar un objeto fuera del lienzo. */
export function snapPageantCanvas(position: CanvasPosition, others: CanvasPosition[], toleranceX: number, toleranceY: number) {
  function axis(start: number, size: number, edges: number[], tolerance: number) {
    let result: { guide: number; offset: number } | undefined;
    for (const guide of edges) {
      for (const edge of [start, start + size / 2, start + size]) {
        const offset = guide - edge;
        if (Math.abs(offset) > tolerance || (result && Math.abs(result.offset) <= Math.abs(offset))) continue;
        if (start + offset >= -0.0001 && start + offset + size <= 100.0001) result = { offset, guide };
      }
    }
    return result;
  }
  const x = axis(position.x, position.width, [0, 50, 100, ...others.flatMap((p) => [p.x, p.x + p.width / 2, p.x + p.width])], toleranceX);
  const y = axis(position.y, position.height, [0, 50, 100, ...others.flatMap((p) => [p.y, p.y + p.height / 2, p.y + p.height])], toleranceY);
  return {
    position: { ...position, x: Math.max(0, Math.min(100 - position.width, position.x + (x?.offset ?? 0))), y: Math.max(0, Math.min(100 - position.height, position.y + (y?.offset ?? 0))) },
    guideX: x?.guide,
    guideY: y?.guide,
  };
}
