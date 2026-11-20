import { z } from 'zod';
import {
  CANVAS_DEVICES, canvasPosition, canvasSchema, constrainPosition,
  type CanvasDevice, type CanvasElement, type SiteCanvas,
} from '@/lib/web-sites/canvas';
import { constrainLayerDelta, layerBounds, pasteLayers } from './pageant-layer-operations';
import { galaDateParts } from './pageant-site';

export const MAX_PAGEANT_COMPOSITIONS = 16;
export const MAX_PAGEANT_COMPOSITION_BYTES = 150_000;
const compositionBody = z.object({ elements: canvasSchema.shape.elements, height: canvasSchema.shape.height, mobileHeight: canvasSchema.shape.mobileHeight });
export const pageantCompositionSchema = compositionBody.extend({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(64),
}).refine(({ elements }) => elements.length > 0 && new Set(elements.map(({ id }) => id)).size === elements.length, 'La composición debe tener capas distintas.');
export type PageantComposition = z.infer<typeof pageantCompositionSchema>;

export function compositionsFit(items: PageantComposition[]) {
  return new TextEncoder().encode(JSON.stringify(items)).byteLength <= MAX_PAGEANT_COMPOSITION_BYTES;
}

export function pageantCompositions(accent: string, galaDate?: string | null, venueName?: string | null): PageantComposition[] {
  const ink = '#231931';
  const plum = '#543458';
  const paper = '#fbf3e7';
  const gold = { background: ink, border: { color: accent, width: 1 } };
  const darkCard = { ...gold, kind: 'shape', transparent: false, gradient: { color: plum, angle: 140 }, radius: 18 };
  const title = { font: 'cormorant', fontSize: 54, tabletFontSize: 46, mobileFontSize: 30, color: '#ffffff' };
  const copy = { fontSize: 22, tabletFontSize: 18, mobileFontSize: 18, color: '#f4e8df', fontWeight: '500' };
  const date = galaDate ? galaDateParts(galaDate) : undefined;
  const where = [date && `${date.time} h`, venueName].filter(Boolean).join(' · ') || 'Pronto anunciaremos los detalles.';

  return [
    pageantCompositionSchema.parse({
      id: 'aviso', name: 'Anuncio destacado', height: 220, mobileHeight: 188,
      elements: [
        { ...darkCard, id: 'panel', name: 'Fondo', desktop: { x: 10, y: 9, width: 80, height: 82 }, mobile: { x: 4, y: 8, width: 92, height: 84 } },
        { ...title, id: 'title', name: 'Titular', text: 'Un anuncio especial', align: 'center', desktop: { x: 16, y: 24, width: 68, height: 30 }, mobile: { x: 9, y: 21, width: 82, height: 32 } },
        { ...copy, id: 'detail', name: 'Detalle', text: 'Comparte aquí la novedad del certamen.', align: 'center', desktop: { x: 16, y: 57, width: 68, height: 19 }, mobile: { x: 9, y: 57, width: 82, height: 19 } },
      ],
    }),
    pageantCompositionSchema.parse({
      id: 'gala', name: 'Fecha y lugar', height: 246, mobileHeight: where.length > 60 ? 288 : 208,
      elements: [
        { id: 'panel', name: 'Fondo', kind: 'shape', background: paper, transparent: false, border: { color: accent, width: 1 }, radius: 12, desktop: { x: 8, y: 8, width: 84, height: 84 }, mobile: { x: 3, y: 7, width: 94, height: 86 } },
        { id: 'label', name: 'Etiqueta', text: 'LA GALA', fontSize: 21, mobileFontSize: 18, letterSpacing: 0.14, color: ink, desktop: { x: 16, y: 18, width: 68, height: 14 }, mobile: { x: 11, y: 17, width: 78, height: 14 } },
        { ...title, id: 'date', name: 'Fecha', text: date ? `${date.weekday} ${date.short}` : 'Fecha por anunciar', color: ink,
          desktop: { x: 16, y: 33, width: 68, height: 31 }, mobile: { x: 11, y: 30, width: 78, height: 29 } },
        { ...copy, id: 'venue', name: 'Hora y lugar', text: where, color: ink,
          desktop: { x: 16, y: 63, width: 68, height: 20 }, mobile: { x: 11, y: 60, width: 78, height: 27 } },
      ],
    }),
    pageantCompositionSchema.parse({
      id: 'cta', name: 'Invitación con botón', height: 270, mobileHeight: 238,
      elements: [
        { ...darkCard, id: 'panel', name: 'Fondo', desktop: { x: 9, y: 8, width: 82, height: 84 }, mobile: { x: 3, y: 6, width: 94, height: 88 } },
        { ...title, id: 'title', name: 'Invitación', text: 'Sé parte del certamen', align: 'center', desktop: { x: 15, y: 20, width: 70, height: 25 }, mobile: { x: 8, y: 16, width: 84, height: 30 } },
        { ...copy, id: 'detail', name: 'Detalle', text: 'Descubre cómo participar en esta edición.', align: 'center', desktop: { x: 15, y: 46, width: 70, height: 15 }, mobile: { x: 8, y: 45, width: 84, height: 17 } },
        { id: 'button', name: 'Botón', kind: 'button', text: 'Ver inscripción', href: '#postula', color: ink, background: paper, transparent: false, align: 'center', fontSize: 20, mobileFontSize: 18, radius: 32,
          desktop: { x: 34, y: 66, width: 32, height: 18 }, mobile: { x: 21, y: 68, width: 58, height: 17 } },
      ],
    }),
    pageantCompositionSchema.parse({
      id: 'sponsor', name: 'Marca aliada', height: 236, mobileHeight: 236,
      elements: [
        { id: 'panel', name: 'Fondo', kind: 'shape', background: paper, transparent: false, border: { color: accent, width: 1 }, radius: 16, desktop: { x: 10, y: 9, width: 80, height: 82 }, mobile: { x: 3, y: 7, width: 94, height: 86 } },
        { id: 'logo', name: 'Logo', kind: 'image', background: '#efe4d6', transparent: false, imageFrame: { fit: 'contain' }, radius: 12, desktop: { x: 15, y: 21, width: 20, height: 58 }, mobile: { x: 32, y: 13, width: 36, height: 31 } },
        { ...title, id: 'title', name: 'Marca', text: 'Marca aliada', color: ink, align: 'center', desktop: { x: 40, y: 26, width: 44, height: 27 }, mobile: { x: 8, y: 45, width: 84, height: 22 } },
        { ...copy, id: 'detail', name: 'Mensaje', text: 'Gracias por acompañarnos.', color: ink, align: 'center', desktop: { x: 40, y: 55, width: 44, height: 18 }, mobile: { x: 8, y: 69, width: 84, height: 15 } },
      ],
    }),
  ];
}

export function createPageantComposition(name: string, canvas: SiteCanvas, ids: readonly string[]) {
  const include = new Set(ids);
  const elements = canvas.elements.filter((layer) => include.has(layer.id));
  if (!elements.length) return undefined;
  const positions = CANVAS_DEVICES.map((device) => {
    const frame = layerBounds(elements.map((layer) => canvasPosition(layer, device)))!;
    // Mantiene el ancho relativo y aprovecha la altura de una sección independiente.
    const heightScale = Math.min(1.5, 72 / frame.height);
    return {
      device, frame, heightScale,
      x: (100 - frame.width) / 2,
      y: (100 - frame.height * heightScale) / 2,
    };
  });
  const layers = elements.map((layer) => {
    const copy = { ...layer, locked: false, hidden: false };
    for (const { device, frame, heightScale, x, y } of positions) {
      const original = canvasPosition(layer, device);
      copy[device] = constrainPosition({
        ...original, x: x + original.x - frame.x,
        y: y + (original.y - frame.y) * heightScale, height: Math.max(2, original.height * heightScale),
      });
    }
    return copy;
  });
  const result = pageantCompositionSchema.safeParse({ id: crypto.randomUUID(), name, elements: layers, height: canvas.height, mobileHeight: canvas.mobileHeight });
  return result.success ? result.data : undefined;
}

export function placePageantComposition(
  canvas: SiteCanvas, composition: PageantComposition, device: CanvasDevice,
  point?: { x: number; y: number; canvasHeight: number },
) {
  if (!point) return pasteLayers(canvas, composition.elements, { offset: 0 });
  if (!composition.elements.length) return undefined;
  const height = device === 'mobile' ? composition.mobileHeight : composition.height;
  const scale = Math.min(1, height / Math.max(1, point.canvasHeight));
  const layers: CanvasElement[] = composition.elements.map((layer) => ({ ...layer }));
  for (const view of CANVAS_DEVICES) {
    const positions = layers.map((layer) => canvasPosition(layer, view));
    const origin = layerBounds(positions)!;
    const scaled = positions.map((position) => ({
      ...position, y: origin.y + (position.y - origin.y) * scale, height: Math.max(2, position.height * scale),
    }));
    const bounds = layerBounds(scaled)!;
    const delta = constrainLayerDelta(bounds, point.x - bounds.x, point.y - bounds.y);
    layers.forEach((layer, index) => {
      const position = scaled[index];
      layer[view] = constrainPosition({ ...position, x: position.x + delta.dx, y: position.y + delta.dy });
    });
  }
  return pasteLayers(canvas, layers, { offset: 0 });
}
