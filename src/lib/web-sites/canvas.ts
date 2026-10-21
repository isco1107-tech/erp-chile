import { z } from 'zod';
import type { CSSProperties } from 'react';

export const CANVAS_MAX_ELEMENTS = 40;
export const CANVAS_MOTIONS = ['none', 'fade', 'rise', 'zoom', 'float'] as const;
export const CANVAS_DEVICES = ['desktop', 'tablet', 'mobile'] as const;
export type CanvasDevice = (typeof CANVAS_DEVICES)[number];
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const number = (min: number, max: number, initial: number) => z.number().finite().min(min).max(max).default(initial);
export const canvasPositionSchema = z.object({
  x: number(0, 100, 10), y: number(0, 100, 10),
  width: number(2, 100, 35), height: number(2, 100, 20),
}).refine((p) => p.x + p.width <= 100.01 && p.y + p.height <= 100.01, 'El elemento debe quedar dentro del lienzo');
export const canvasElementSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['text', 'image', 'button', 'shape']).default('text'),
  name: z.string().trim().max(80).default('Elemento'),
  text: z.string().max(2000).default(''),
  imageUrl: z.string().trim().max(500).default(''),
  alt: z.string().trim().max(160).default(''),
  href: z.string().trim().max(500).default(''),
  desktop: canvasPositionSchema.prefault({}),
  tablet: canvasPositionSchema.optional(), mobile: canvasPositionSchema.optional(),
  color: color.default('#111827'), background: color.default('#ffffff'),
  transparent: z.boolean().default(true),
  mobileFontSize: z.number().finite().min(10).max(160).optional(), tabletFontSize: z.number().finite().min(10).max(160).optional(),
  fontSize: number(10, 160, 32), fontWeight: z.enum(['400', '500', '600', '700', '800', '900']).default('700'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  radius: number(0, 100, 0), rotation: number(-180, 180, 0), opacity: number(0, 100, 100),
  shadow: z.enum(['none', 'soft', 'strong']).default('none'),
  motion: z.enum(CANVAS_MOTIONS).default('none'), duration: number(200, 10000, 800), delay: number(0, 5000, 0),
  hidden: z.boolean().default(false), mobileHidden: z.boolean().default(false), locked: z.boolean().default(false),
});
export const canvasSchema = z.object({
  enabled: z.boolean().default(false),
  /** Un lienzo puede reemplazar el contenido de la sección o acompañarlo. */
  replaceContent: z.boolean().default(false),
  height: number(160, 1600, 560), mobileHeight: number(160, 1600, 640),
  elements: z.array(canvasElementSchema).max(CANVAS_MAX_ELEMENTS).default([]),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.elements.forEach((el, i) => {
    if (ids.has(el.id)) ctx.addIssue({ code: 'custom', path: ['elements', i, 'id'], message: 'Capa repetida' });
    ids.add(el.id);
  });
});
export type SiteCanvas = z.infer<typeof canvasSchema>;
export type CanvasElement = z.infer<typeof canvasElementSchema>;
export type CanvasPosition = z.infer<typeof canvasPositionSchema>;

export function canvasPosition(element: CanvasElement, device: CanvasDevice): CanvasPosition {
  return element[device] ?? element.desktop;
}
/** Usado tanto por el arrastre como por las flechas y los campos numéricos. */
export function constrainPosition(position: CanvasPosition): CanvasPosition {
  const width = Math.max(2, Math.min(100, position.width));
  const height = Math.max(2, Math.min(100, position.height));
  return { width, height, x: Math.max(0, Math.min(100 - width, position.x)), y: Math.max(0, Math.min(100 - height, position.y)) };
}
export function canvasFontSize(element: CanvasElement, device: CanvasDevice): number {
  if (device === 'mobile') return element.mobileFontSize ?? Math.max(16, Math.round(element.fontSize * 0.65));
  if (device === 'tablet') return element.tabletFontSize ?? Math.max(16, Math.round(element.fontSize * 0.8));
  return element.fontSize;
}
export function canvasElementStyle(element: CanvasElement): CSSProperties {
  return {
    color: element.color, backgroundColor: element.transparent ? 'transparent' : element.background,
    fontWeight: element.fontWeight, textAlign: element.align, borderRadius: element.radius,
    transform: `rotate(${element.rotation}deg)`, opacity: element.opacity / 100,
    boxShadow: element.shadow === 'soft' ? '0 12px 35px #00000020' : element.shadow === 'strong' ? '0 18px 50px #00000045' : undefined,
  };
}
