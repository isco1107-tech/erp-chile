import { PAGEANT_HERO_MOBILE_WIDTH, PAGEANT_HERO_TABLET_WIDTH, pageantItemKeySchema, pageantRegionSchema } from '@/lib/events/pageant-site-design';
import type { PageantCanvasRef } from '@/lib/events/pageant-studio';
import { CANVAS_TEXT_LIMIT, type CanvasDevice, type CanvasElement } from '@/lib/web-sites/canvas';

export function pageantCanvasDevice(board: HTMLElement): CanvasDevice {
  if (board.closest('.pgs-hero')) {
    if (window.matchMedia(`(max-width: ${PAGEANT_HERO_MOBILE_WIDTH}px)`).matches) return 'mobile';
    return window.matchMedia(`(max-width: ${PAGEANT_HERO_TABLET_WIDTH}px)`).matches ? 'tablet' : 'desktop';
  }
  return board.clientWidth <= 600 ? 'mobile' : board.clientWidth <= 900 ? 'tablet' : 'desktop';
}

export function pageantBoard(element: Element | null) {
  const block = element?.closest<HTMLElement>('[data-block-id]');
  const id = block?.dataset.blockId;
  const section = element?.closest<HTMLElement>('.pgs-hero, .pgs-section, .pgs-footer');
  const region = pageantRegionSchema.safeParse(section?.matches('.pgs-footer') ? 'footer' : section?.id);
  const target: PageantCanvasRef | undefined = id ? { id } : region.success ? { region: region.data } : undefined;
  const board = id ? block?.querySelector<HTMLElement>('.ws-canvas') ?? block : section;
  if (!target || !board) return;
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  return { target, rect, device: pageantCanvasDevice(board) };
}

export function pageantDrop(element: Element | null, x: number, y: number) {
  const board = pageantBoard(element);
  if (!board) return;
  const { rect, device, target } = board;
  return {
    ...target, device, canvasWidth: rect.width, canvasHeight: rect.height,
    x: (x - rect.left) / rect.width * 100, y: (y - rect.top) / rect.height * 100,
  };
}

function asHex(color: string) {
  const rgba = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!rgba || Number(rgba[4]) === 0) return undefined;
  return '#' + rgba.slice(1, 4).map((component) => Number(component).toString(16).padStart(2, '0')).join('');
}

export function readPageantItem(node: HTMLElement) {
  const key = pageantItemKeySchema.safeParse(node.dataset.pageantItem);
  if (!key.success) return;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  if (!rect.width || !rect.height || style.visibility !== 'visible') return;
  if (node instanceof HTMLImageElement) {
    if (!node.getAttribute('src')) return;
    return { key: key.data, rect, content: { kind: 'image', imageUrl: node.getAttribute('src')!, alt: node.alt.slice(0, 160), name: node.alt.slice(0, 80) || 'Fotografía', transparent: true } as const };
  }

  const text = node.innerText.replace(/\r\n/g, '\n').trim().slice(0, CANVAS_TEXT_LIMIT);
  if (!text || node.querySelector('input,textarea') || node.querySelectorAll('a').length > 1) return;
  const link = node.closest('a') ?? (node.childNodes.length === 1 ? node.querySelector('a') : null);
  const fontWeight = String(Math.min(900, Math.max(400, Math.round((Number(style.fontWeight) || 400) / 100) * 100))) as CanvasElement['fontWeight'];
  const align = style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : 'left';
  const formatted = style.fontStyle === 'italic';
  const headingLevel = /^H[1-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : key.data === 'inicio.title' ? 1 : undefined;
  const content: Partial<CanvasElement> = {
    kind: 'text', name: text.split('\n')[0].slice(0, 80), text, transparent: true, fontWeight, align,
    color: asHex(style.color) ?? asHex(style.webkitTextStrokeColor) ?? '#c89748',
    font: /serif/i.test(style.fontFamily.replace(/sans-serif/g, '')) ? 'cormorant' : undefined,
    fontSize: Math.min(160, Math.max(11, Number.parseFloat(style.fontSize) || 20)),
    headingLevel,
    richText: formatted ? [{ text, italic: true }] : undefined,
    href: link?.getAttribute('href')?.slice(0, 500) ?? '',
  };
  return { key: key.data, rect, content };
}
