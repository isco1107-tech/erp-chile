import { z } from 'zod';
import { blockImageUrls, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { canvasSchema } from '@/lib/web-sites/canvas';
import { creativeSiteSchema } from '@/lib/web-sites/creative';
import { MAX_FOOTER_LINKS, menuLinkSchema } from '@/lib/web-sites/site';
import { safeHref, safeImageSrc } from '@/lib/web-sites/urls';
import { compositionsFit, MAX_PAGEANT_COMPOSITIONS, pageantCompositionSchema } from './pageant-compositions';
import { insertBlockAt, PAGEANT_SECTIONS, pageantLayoutSchema, pageantOptionsSchema, pageantSectionsSchema, resolveLayout, type LayoutItem, type PageantSectionId, type ResolvedLayout } from './pageant-layout';

const footerLinkSchema = menuLinkSchema.superRefine(({ label, href }, ctx) => {
  if (!label && !href) return;
  if (!label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Escribe el texto del enlace del pie de página.' });
  if (!safeHref(href)) ctx.addIssue({ code: 'custom', path: ['href'], message: 'Escribe una dirección válida para el enlace del pie de página.' });
});

const pageantFooterSchema = z.object({
  title: z.string().trim().max(120).default(''),
  description: z.string().trim().max(300).default(''),
  copyright: z.string().trim().max(200).default(''),
  showMenu: z.boolean().default(true),
  showContact: z.boolean().default(true),
  links: z.array(footerLinkSchema).max(MAX_FOOTER_LINKS).default([]),
});
export type PageantFooter = z.infer<typeof pageantFooterSchema>;

export const PAGEANT_INSERTIONS = {
  before: 'Antes de la portada',
  afterHero: 'Después de la portada',
  resultados: 'Después de los resultados',
  certamen: 'Después de «El certamen»',
  ganadoras: 'Después de Ganadoras',
  camino: 'Después de «El camino»',
  postula: 'Después de la inscripción',
  candidatas: 'Después de Candidatas',
  votacion: 'Después de la votación',
  gala: 'Después de la gala',
  auspicios: 'Después de Auspicios',
  director: 'Después de Dirección',
  preguntas: 'Después de las preguntas frecuentes',
  beforeFooter: 'Antes del pie de página',
  after: 'Después del pie de página',
} as const;
const insertionSchema = z.enum(Object.keys(PAGEANT_INSERTIONS) as (keyof typeof PAGEANT_INSERTIONS)[]);
export type PageantInsertion = z.infer<typeof insertionSchema>;
export const PAGEANT_INSERTION_POINTS = insertionSchema.options;

export interface PageantBlockTarget {
  slot: PageantInsertion;
  beforeId?: string;
}

export const PAGEANT_REGIONS = {
  inicio: 'Portada',
  resultados: 'Resultados',
  certamen: 'El certamen',
  ganadoras: 'Ganadoras',
  camino: 'El camino',
  postula: 'Inscripción',
  candidatas: 'Candidatas',
  votacion: 'Votación',
  gala: 'La gala',
  auspicios: 'Auspicios',
  director: 'Dirección',
  preguntas: 'Preguntas frecuentes',
  footer: 'Pie de página',
} as const;
export const pageantRegionSchema = z.enum(Object.keys(PAGEANT_REGIONS) as (keyof typeof PAGEANT_REGIONS)[]);
export type PageantRegion = z.infer<typeof pageantRegionSchema>;
export const pageantItemKeySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,119}$/);
export const pageantLayerIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const PAGEANT_HERO_MOBILE_WIDTH = 600;
export const PAGEANT_HERO_TABLET_WIDTH = 1024;

export function pageantHeroImageIds(design: Pick<PageantSiteDesign, 'overlays' | 'relocated'>): ReadonlySet<string> {
  const coverId = design.relocated?.['inicio.cover-photo'];
  const layers = design.overlays?.inicio?.elements ?? [];
  return new Set(layers.filter((layer) => layer.kind === 'image' && layer.id !== coverId && safeImageSrc(layer.imageUrl)).map(({ id }) => id));
}

export function pageantNamedItem(prefix: string, name: string) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; ++i) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export const pageantSiteDesignSchema = creativeSiteSchema.safeExtend({
  footer: pageantFooterSchema.prefault({}),
  layout: pageantLayoutSchema,
  sections: pageantSectionsSchema,
  options: pageantOptionsSchema,
  blockPlacements: z.record(z.string().min(1).max(40), insertionSchema).optional(),
  overlays: z.partialRecord(pageantRegionSchema, canvasSchema).optional(),
  relocated: z.record(pageantItemKeySchema, pageantLayerIdSchema).optional(),
  compositions: z.array(pageantCompositionSchema).max(MAX_PAGEANT_COMPOSITIONS)
    .refine(compositionsFit, 'La biblioteca de composiciones supera el tamaño admitido.')
    .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, 'La biblioteca contiene composiciones repetidas.').optional(),
}).transform((design) => {
  const layerIds = new Set([
    ...design.blocks.flatMap((block) => block.style.canvas?.elements ?? []),
    ...Object.values(design.overlays ?? {}).flatMap((canvas) => canvas.elements),
  ].map(({ id }) => id));
  if (design.relocated) {
    design = { ...design, relocated: Object.fromEntries(Object.entries(design.relocated).filter(([, id]) => layerIds.has(id))) };
  }
  const placements = design.blockPlacements;
  if (!placements) return design;
  const blockPlacements = Object.fromEntries(
    design.blocks.flatMap(({ id }) => {
      const slot = Object.hasOwn(placements, id) ? placements[id] : undefined;
      return slot ? [[id, slot]] : [];
    }),
  );
  return { ...design, blockPlacements };
});

export function pageantRelocatedCss(design?: Pick<PageantSiteDesign, 'enabled' | 'relocated'>) {
  if (!design?.enabled) return '';
  return Object.entries(design.relocated ?? {})
    .map(([key, id]) => `body:has([data-pageant-layer="${id}"]) [data-pageant-item="${key}"]{visibility:hidden!important}`)
    .join('\n');
}
export type PageantSiteDesign = z.infer<typeof pageantSiteDesignSchema>;

export function parsePageantSiteDesign(value: unknown): PageantSiteDesign | undefined {
  const parsed = pageantSiteDesignSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function pageantDesignForDisplay(design: PageantSiteDesign) {
  const display = { ...design };
  delete display.compositions;
  return display;
}

type LayoutDesign = Pick<PageantSiteDesign, 'placement' | 'blockPlacements' | 'layout'>;

export function pageantSlotAfter(section: PageantSectionId): PageantInsertion {
  return section === 'inicio' ? 'afterHero' : section;
}

export function pageantBlockPlacement(design: LayoutDesign, id: string): PageantInsertion {
  if (design.layout) {
    let slot: PageantInsertion = 'before';
    for (const item of design.layout) {
      if (item.kind === 'section') slot = pageantSlotAfter(item.id);
      else if (item.id === id) return slot;
    }
    return 'beforeFooter';
  }
  return design.blockPlacements && Object.hasOwn(design.blockPlacements, id) ? design.blockPlacements[id] : design.placement;
}

export function placePageantBlock(design: PageantSiteDesign, block: WebSiteBlock, { slot, beforeId }: PageantBlockTarget): PageantSiteDesign {
  if (beforeId === block.id) return design;
  const blocks = design.blocks.filter(({ id }) => id !== block.id);
  const index = blocks.findIndex(({ id }) => id === beforeId && pageantBlockPlacement(design, id) === slot);
  blocks.splice(index < 0 ? blocks.length : index, 0, block);
  if (design.layout) {
    const items = resolvePageantDesignLayout(design, true).items.filter((item) => item.kind !== 'block' || item.id !== block.id);
    const before = items.findIndex((item) => item.kind === 'block' && item.id === beforeId);
    const section = items.findIndex((item) => item.kind === 'section' && pageantSlotAfter(item.id) === slot);
    let at = before >= 0 ? before : slot === 'before' ? 0 : section >= 0 ? section + 1 : items.length;
    while (!beforeId && section >= 0 && items[at]?.kind === 'block') at += 1;
    return { ...design, blocks, layout: insertBlockAt(items, at, block.id) };
  }
  return { ...design, blocks, blockPlacements: { ...design.blockPlacements, [block.id]: slot } };
}

export function resolvePageantDesignLayout(design?: LayoutDesign & Pick<PageantSiteDesign, 'blocks' | 'enabled'>, enabled = design?.enabled): ResolvedLayout {
  const ids = design?.blocks.map(({ id }) => id) ?? [];
  if (!design || design.layout || !design.blockPlacements || enabled === false) {
    return resolveLayout({ layout: design?.layout, blockIds: ids, placement: design?.placement, enabled });
  }
  const groups = new Map<PageantInsertion, string[]>();
  for (const id of ids) {
    const slot = pageantBlockPlacement(design, id);
    const group = groups.get(slot) ?? [];
    group.push(id);
    groups.set(slot, group);
  }
  const blocks = (slot: PageantInsertion): LayoutItem[] => (groups.get(slot) ?? []).map((id) => ({ kind: 'block', id }));
  const items: LayoutItem[] = PAGEANT_SECTIONS.flatMap((id) => [{ kind: 'section', id }, ...blocks(pageantSlotAfter(id))]);
  return { items: [...items, ...blocks('beforeFooter')], leading: groups.get('before') ?? [], trailing: groups.get('after') ?? [] };
}

export function pageantDesignImageUrls(design?: Pick<PageantSiteDesign, 'blocks' | 'overlays' | 'compositions'>): string[] {
  if (!design) return [];
  return [
    ...design.blocks.flatMap(blockImageUrls),
    ...Object.values(design.overlays ?? {}).flatMap((canvas) =>
      canvas.elements.filter((layer) => layer.kind === 'image').map((layer) => layer.imageUrl)
    ),
    ...(design.compositions ?? []).flatMap(({ elements }) => elements.filter((layer) => layer.kind === 'image').map((layer) => layer.imageUrl)),
  ];
}
