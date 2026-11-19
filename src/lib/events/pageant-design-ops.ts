import { MAX_BLOCKS, blockTexts, cloneBlock, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { isSampleText } from '@/lib/web-sites/templates';
import type { EditorKey, InlineField } from './pageant-editor-protocol';
import {
  editableLayout,
  indexOfKey,
  insertBlockAt,
  itemKey,
  moveKeyBy,
  moveKeyTo,
  parseItemKey,
  patchSectionSettings,
  removeKey,
  type LayoutItem,
  type PageantSectionId,
  type SectionSettings,
} from './pageant-layout';
import type { PageantSiteDesign } from './pageant-site-design';

/**
 * Lo que hace el editor visual con el diseño del micrositio, como funciones
 * puras: reciben el diseño y devuelven uno nuevo (nunca lo mutan), así el
 * historial guarda referencias y deshacer es exacto. Cualquier cambio de orden
 * deja escrito `layout` (un diseño anterior pasa a tener orden propio) y los
 * bloques del estudio en ese mismo orden (el estudio clásico los muestra así).
 */

export type DesignResult = { ok: true; design: PageantSiteDesign } | { ok: false; error: string };

/** El orden que se edita: el guardado o, en un diseño anterior, el equivalente. */
export function designLayout(design: PageantSiteDesign): LayoutItem[] {
  return design.layout ?? editableLayout({ blockIds: design.blocks.map((block) => block.id), placement: design.placement });
}

/** Escribe el orden y acomoda los bloques del estudio a ese mismo orden. */
export function withLayout(design: PageantSiteDesign, layout: LayoutItem[]): PageantSiteDesign {
  const position = new Map(layout.filter((item) => item.kind === 'block').map((item, index) => [item.id, index]));
  const blocks = [...design.blocks].sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  return { ...design, layout, blocks };
}

/** Posición para insertar entre dos elementos (`after` manda; sin ninguno, al final). */
export function insertionIndex(layout: LayoutItem[], at: { after?: EditorKey | null; before?: EditorKey | null }): number {
  if (at.after && at.after !== 'footer') {
    const index = indexOfKey(layout, at.after);
    if (index >= 0) return index + 1;
  }
  if (at.before && at.before !== 'footer') {
    const index = indexOfKey(layout, at.before);
    if (index >= 0) return index;
  }
  return layout.length;
}

/** Agrega un bloque del estudio en un punto y enciende el estudio (si estaba apagado, el bloque no se vería). */
export function insertStudioBlock(design: PageantSiteDesign, block: WebSiteBlock, at: { after?: EditorKey | null; before?: EditorKey | null }): DesignResult {
  if (design.blocks.length >= MAX_BLOCKS) return { ok: false, error: `Se alcanzó el máximo de ${MAX_BLOCKS} secciones del estudio.` };
  if (block.type === 'form') return { ok: false, error: 'Este micrositio usa su propio formulario de inscripción.' };
  const safe = block.type === 'contact' ? { ...block, showForm: false } : block;
  const layout = designLayout(design);
  const next = insertBlockAt(layout, insertionIndex(layout, at), safe.id);
  return { ok: true, design: withLayout({ ...design, enabled: true, blocks: [...design.blocks, safe] }, next) };
}

export function duplicateStudioBlock(design: PageantSiteDesign, blockId: string): DesignResult & { blockId?: string } {
  const original = design.blocks.find((block) => block.id === blockId);
  if (!original) return { ok: false, error: 'La sección ya no existe.' };
  const copy = cloneBlock(original);
  const result = insertStudioBlock(design, copy, { after: `block:${blockId}` });
  return result.ok ? { ...result, blockId: copy.id } : result;
}

export function removeStudioBlock(design: PageantSiteDesign, blockId: string): PageantSiteDesign {
  const layout = removeKey(designLayout(design), `block:${blockId}`);
  return withLayout({ ...design, blocks: design.blocks.filter((block) => block.id !== blockId) }, layout);
}

export function updateStudioBlock(design: PageantSiteDesign, block: WebSiteBlock): PageantSiteDesign {
  const safe = block.type === 'contact' ? { ...block, showForm: false } : block;
  return { ...design, blocks: design.blocks.map((entry) => (entry.id === block.id ? safe : entry)) };
}

/**
 * Sube o baja algo saltándose lo que no se ve. `rendered` = lo que el lienzo
 * está mostrando (si aún no avisó, todo cuenta como visible).
 */
export function moveItem(design: PageantSiteDesign, key: EditorKey, dir: -1 | 1, rendered?: ReadonlySet<string>): PageantSiteDesign {
  if (key === 'footer') return design;
  const layout = designLayout(design);
  const next = moveKeyBy(layout, key, dir, (item) => !rendered || rendered.size === 0 || rendered.has(itemKey(item)));
  return next === layout ? design : withLayout(design, next);
}

/** Lleva algo a una posición exacta (arrastrar y soltar en la lista). */
export function moveItemTo(design: PageantSiteDesign, key: EditorKey, index: number): PageantSiteDesign {
  if (key === 'footer') return design;
  return withLayout(design, moveKeyTo(designLayout(design), key, index));
}

/** Oculta o vuelve a mostrar (las secciones propias guardan su ajuste; los bloques su `hidden`). */
export function toggleHidden(design: PageantSiteDesign, key: EditorKey): PageantSiteDesign {
  const item = key === 'footer' ? null : parseItemKey(key);
  if (!item) return design;
  if (item.kind === 'block') return { ...design, blocks: design.blocks.map((block) => (block.id === item.id ? { ...block, hidden: !block.hidden } : block)) };
  const hidden = design.sections?.[item.id]?.hidden === true;
  return { ...design, sections: patchSectionSettings(design.sections, item.id, { hidden: !hidden }) };
}

export function isHidden(design: PageantSiteDesign, key: EditorKey): boolean {
  const item = key === 'footer' ? null : parseItemKey(key);
  if (!item) return false;
  if (item.kind === 'block') return design.blocks.find((block) => block.id === item.id)?.hidden === true;
  return design.sections?.[item.id]?.hidden === true;
}

export function patchSection(design: PageantSiteDesign, id: PageantSectionId, patch: Partial<SectionSettings>): PageantSiteDesign {
  return { ...design, sections: patchSectionSettings(design.sections, id, patch) };
}

/**
 * Texto editado en el lugar. La etiqueta y el título van a los ajustes de la
 * sección; la frase principal y «Sobre el certamen» son campos del certamen
 * (los devuelve aparte para que el formulario los guarde donde siempre).
 */
export function applyInlineText(design: PageantSiteDesign, key: EditorKey, field: InlineField, value: string): { design: PageantSiteDesign; tagline?: string; description?: string } {
  if (field === 'tagline') return { design, tagline: value.trim() };
  if (field === 'description') return { design, description: value.replace(/\r\n/g, '\n').trim() };
  const item = key === 'footer' ? null : parseItemKey(key);
  if (!item || item.kind !== 'section') return { design };
  const limit = field === 'kicker' ? 60 : field === 'title' ? 120 : 80;
  return { design: patchSection(design, item.id, { [field]: value.replace(/\s+/g, ' ').trim().slice(0, limit) }) };
}

/**
 * Textos de ejemplo que siguen en una sección del estudio (los que trae al
 * agregarla desde «Elige un diseño»). No bloquea guardar: el editor lo avisa
 * para que no se publique «Escribe aquí una frase…».
 */
export function sampleTextCount(block: WebSiteBlock): number {
  return blockTexts(block).filter(isSampleText).length;
}

/** Secciones visibles del estudio que todavía tienen texto de ejemplo. */
export function blocksWithSampleText(design: PageantSiteDesign): WebSiteBlock[] {
  if (!design.enabled) return [];
  return design.blocks.filter((block) => !block.hidden && sampleTextCount(block) > 0);
}
