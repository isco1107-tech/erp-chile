import {
  applyInlineText,
  designLayout,
  duplicateStudioBlock,
  insertStudioBlock,
  insertionIndex,
  isHidden,
  moveItem,
  moveItemTo,
  removeStudioBlock,
  toggleHidden,
  updateStudioBlock,
} from '@/lib/events/pageant-design-ops';
import { itemKey } from '@/lib/events/pageant-layout';
import { pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import { createBlock, MAX_BLOCKS } from '@/lib/web-sites/blocks';

const empty = () => pageantSiteDesignSchema.parse({});
const keys = (design: ReturnType<typeof empty>) => designLayout(design).map(itemKey);

describe('operaciones del editor visual sobre el diseño', () => {
  it('insertar un bloque lo pone donde se pidió, enciende el estudio y escribe el orden', () => {
    const block = createBlock('text');
    const result = insertStudioBlock(empty(), block, { after: 'section:inicio' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.enabled).toBe(true);
    expect(result.design.layout).toBeDefined();
    expect(keys(result.design).slice(0, 3)).toEqual(['section:inicio', `block:${block.id}`, 'section:resultados']);
    // «antes de» también funciona, y sin destino va al final.
    const before = insertStudioBlock(result.design, createBlock('quote'), { before: 'section:gala' });
    expect(before.ok && keys(before.design)[keys(before.design).indexOf('section:gala') - 1]).toMatch(/^block:/);
    const atEnd = insertStudioBlock(result.design, createBlock('cta'), {});
    expect(atEnd.ok && keys(atEnd.design).at(-1)).toMatch(/^block:/);
  });

  it('no deja pasar del máximo ni formularios a medida, y un contacto no lleva formulario', () => {
    let design = empty();
    for (let i = 0; i < MAX_BLOCKS; i++) {
      const result = insertStudioBlock(design, createBlock('text'), {});
      if (result.ok) design = result.design;
    }
    expect(insertStudioBlock(design, createBlock('text'), {})).toEqual({ ok: false, error: expect.stringContaining('máximo') });
    expect(insertStudioBlock(empty(), createBlock('form'), {}).ok).toBe(false);
    const contact = { ...createBlock('contact'), showForm: true } as ReturnType<typeof createBlock>;
    const withContact = insertStudioBlock(empty(), contact, {});
    expect(withContact.ok && withContact.design.blocks[0]).toMatchObject({ type: 'contact', showForm: false });
    expect(updateStudioBlock(withContact.ok ? withContact.design : empty(), contact).blocks[0]).toMatchObject({ showForm: false });
  });

  it('duplicar deja la copia justo debajo y eliminar la saca del orden', () => {
    const block = createBlock('text');
    const inserted = insertStudioBlock(empty(), block, { after: 'section:certamen' });
    if (!inserted.ok) throw new Error('no insertó');
    const copy = duplicateStudioBlock(inserted.design, block.id);
    if (!copy.ok || !copy.blockId) throw new Error('no duplicó');
    const k = keys(copy.design);
    expect(k.indexOf(`block:${copy.blockId}`)).toBe(k.indexOf(`block:${block.id}`) + 1);
    const removed = removeStudioBlock(copy.design, block.id);
    expect(keys(removed)).not.toContain(`block:${block.id}`);
    expect(removed.blocks.map((b) => b.id)).toEqual([copy.blockId]);
  });

  it('mover salta lo que no se ve y arrastrar lleva a la posición exacta', () => {
    const design = pageantSiteDesignSchema.parse({ layout: [{ kind: 'section', id: 'inicio' }, { kind: 'section', id: 'resultados' }, { kind: 'section', id: 'certamen' }] });
    // «resultados» no se ve (sin datos): subir «certamen» lo deja sobre la portada.
    const rendered = new Set(['section:inicio', 'section:certamen']);
    expect(keys(moveItem(design, 'section:certamen', -1, rendered)).slice(0, 3)).toEqual(['section:certamen', 'section:inicio', 'section:resultados']);
    expect(moveItem(design, 'footer', -1)).toBe(design);
    expect(keys(moveItemTo(design, 'section:inicio', 2)).slice(0, 3)).toEqual(['section:resultados', 'section:certamen', 'section:inicio']);
  });

  it('ocultar alterna en secciones propias y en bloques', () => {
    const hidden = toggleHidden(empty(), 'section:gala');
    expect(isHidden(hidden, 'section:gala')).toBe(true);
    expect(isHidden(toggleHidden(hidden, 'section:gala'), 'section:gala')).toBe(false);
    const block = createBlock('text');
    const inserted = insertStudioBlock(empty(), block, {});
    if (!inserted.ok) throw new Error('no insertó');
    expect(isHidden(toggleHidden(inserted.design, `block:${block.id}`), `block:${block.id}`)).toBe(true);
  });

  it('el texto editado en el lugar va a su sitio y se recorta a su largo', () => {
    const kicker = applyInlineText(empty(), 'section:candidatas', 'kicker', '  Nuestras   reinas ');
    expect(kicker.design.sections).toEqual({ candidatas: { kicker: 'Nuestras reinas' } });
    const long = applyInlineText(empty(), 'section:gala', 'title', 'x'.repeat(300));
    expect(long.design.sections?.gala?.title).toHaveLength(120);
    expect(applyInlineText(empty(), 'section:inicio', 'tagline', ' Hola ').tagline).toBe('Hola');
    expect(applyInlineText(empty(), 'section:certamen', 'description', 'Uno\r\n\r\nDos ').description).toBe('Uno\n\nDos');
    // En un bloque o en el pie no hay textos en el lugar: no cambia nada.
    expect(applyInlineText(empty(), 'footer', 'title', 'x').design.sections).toEqual({});
  });

  it('la posición de inserción usa la lista del panel', () => {
    const layout = designLayout(empty());
    expect(insertionIndex(layout, { after: 'section:inicio' })).toBe(1);
    expect(insertionIndex(layout, { before: 'section:inicio' })).toBe(0);
    expect(insertionIndex(layout, { after: 'footer' })).toBe(layout.length);
    expect(insertionIndex(layout, {})).toBe(layout.length);
  });
});
