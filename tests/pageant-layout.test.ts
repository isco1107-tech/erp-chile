import {
  PAGEANT_SECTIONS,
  editableLayout,
  insertBlockAt,
  itemKey,
  moveKeyBy,
  moveKeyTo,
  overrideOr,
  parseItemKey,
  patchSectionSettings,
  removeKey,
  resolveLayout,
  sectionSettings,
  sectionToneClasses,
  tonesFor,
  type LayoutItem,
} from '@/lib/events/pageant-layout';
import { parsePageantSiteDesign, pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';

const sections = (...ids: Array<(typeof PAGEANT_SECTIONS)[number]>): LayoutItem[] => ids.map((id) => ({ kind: 'section', id }));
const keys = (items: LayoutItem[]) => items.map(itemKey);

describe('orden del micrositio: diseños de antes del orden libre se ven igual', () => {
  it('sin bloques ni orden guardado, las secciones van en su orden de fábrica', () => {
    const resolved = resolveLayout({ blockIds: [] });
    expect(resolved.items.map((i) => i.id)).toEqual([...PAGEANT_SECTIONS]);
    expect(resolved.leading).toEqual([]);
    expect(resolved.trailing).toEqual([]);
  });

  it('«después de la portada» pone el estudio justo tras la portada', () => {
    const resolved = resolveLayout({ blockIds: ['a', 'b'], placement: 'afterHero' });
    expect(keys(resolved.items).slice(0, 4)).toEqual(['section:inicio', 'block:a', 'block:b', 'section:resultados']);
  });

  it('«antes» y «al final» quedan fuera del sitio, como siempre', () => {
    expect(resolveLayout({ blockIds: ['a'], placement: 'before' }).leading).toEqual(['a']);
    expect(resolveLayout({ blockIds: ['a'], placement: 'after' }).trailing).toEqual(['a']);
    expect(resolveLayout({ blockIds: ['a'] }).trailing).toEqual(['a']);
  });

  it('con el estudio apagado no sale ningún bloque', () => {
    const resolved = resolveLayout({ blockIds: ['a'], placement: 'afterHero', enabled: false });
    expect(resolved.items.some((i) => i.kind === 'block')).toBe(false);
    expect(resolveLayout({ blockIds: ['a'], layout: [{ kind: 'block', id: 'a' }], enabled: false }).items.some((i) => i.kind === 'block')).toBe(false);
  });

  it('el editor convierte «antes» al comienzo y «al final» antes del pie', () => {
    expect(keys(editableLayout({ blockIds: ['a'], placement: 'before' }))[0]).toBe('block:a');
    expect(keys(editableLayout({ blockIds: ['a'], placement: 'after' })).at(-1)).toBe('block:a');
  });
});

describe('orden libre guardado', () => {
  it('respeta el orden, descarta bloques que ya no existen y suma las secciones que falten en su lugar', () => {
    const layout: LayoutItem[] = [{ kind: 'block', id: 'x' }, ...sections('candidatas', 'inicio'), { kind: 'block', id: 'gone' }, ...sections('certamen')];
    const resolved = resolveLayout({ layout, blockIds: ['x', 'nuevo'] });
    const k = keys(resolved.items);
    expect(k.slice(0, 2)).toEqual(['block:x', 'section:candidatas']);
    expect(k).not.toContain('block:gone');
    // Lo guardado mantiene su orden relativo.
    expect(k.indexOf('section:candidatas')).toBeLessThan(k.indexOf('section:inicio'));
    expect(k.indexOf('section:inicio')).toBeLessThan(k.indexOf('section:certamen'));
    // Una que faltaba va tras la anterior de fábrica que sí está: «votación» tras «candidatas», «resultados» tras «inicio».
    expect(k.indexOf('section:votacion')).toBe(k.indexOf('section:candidatas') + 1);
    expect(k.indexOf('section:resultados')).toBe(k.indexOf('section:inicio') + 1);
    // Todas las secciones propias están, una vez cada una.
    for (const id of PAGEANT_SECTIONS) expect(k.filter((key) => key === `section:${id}`)).toHaveLength(1);
    // El bloque nuevo que no estaba en el orden va al final.
    expect(k.at(-1)).toBe('block:nuevo');
  });

  it('la lectura tolerante limpia repetidos y basura sin perder el diseño', () => {
    const design = parsePageantSiteDesign({
      enabled: true,
      blocks: [],
      layout: [{ kind: 'section', id: 'gala' }, { kind: 'section', id: 'gala' }, { kind: 'otro' }, 'x', { kind: 'section', id: 'inventada' }],
      sections: { gala: { title: 'Gran final', tone: 'neon', spacing: 'airy', hidden: 'si' }, otra: { title: 'x' } },
      options: { numbers: false, ribbon: 'no' },
    });
    expect(design?.layout).toEqual([{ kind: 'section', id: 'gala' }]);
    expect(design?.sections).toEqual({ gala: { title: 'Gran final', spacing: 'airy' } });
    expect(design?.options).toMatchObject({ numbers: false, ribbon: true });
  });

  it('un diseño guardado antes no trae orden ni ajustes', () => {
    const design = pageantSiteDesignSchema.parse({ enabled: true, placement: 'afterHero', blocks: [] });
    expect(design.layout).toBeUndefined();
    expect(design.sections).toEqual({});
    expect(design.options).toEqual({ numbers: true, ribbon: true, whatsappFloat: true, countdown: true, pills: true });
  });
});

describe('operaciones del editor', () => {
  const base = sections('inicio', 'resultados', 'certamen', 'gala');

  it('inserta un bloque donde se pide y sin duplicarlo', () => {
    const once = insertBlockAt(base, 1, 'b');
    expect(keys(once)).toEqual(['section:inicio', 'block:b', 'section:resultados', 'section:certamen', 'section:gala']);
    expect(keys(insertBlockAt(once, 4, 'b')).filter((k) => k === 'block:b')).toHaveLength(1);
    expect(keys(insertBlockAt(base, 99, 'z')).at(-1)).toBe('block:z');
    expect(keys(insertBlockAt(base, -3, 'z'))[0]).toBe('block:z');
  });

  it('subir y bajar se saltan lo que no se ve', () => {
    const hidden = new Set(['section:resultados']);
    const moved = moveKeyBy(base, 'section:certamen', -1, (item) => !hidden.has(itemKey(item)));
    expect(keys(moved)).toEqual(['section:certamen', 'section:inicio', 'section:resultados', 'section:gala']);
    // En el borde no pasa nada.
    expect(moveKeyBy(base, 'section:gala', 1)).toBe(base);
    expect(moveKeyBy(base, 'section:nada' as never, 1)).toBe(base);
  });

  it('arrastrar lleva a la posición exacta y quitar saca solo ese elemento', () => {
    expect(keys(moveKeyTo(base, 'section:inicio', 3))).toEqual(['section:resultados', 'section:certamen', 'section:gala', 'section:inicio']);
    expect(keys(removeKey(base, 'section:certamen'))).toEqual(['section:inicio', 'section:resultados', 'section:gala']);
  });

  it('las claves van y vuelven, y una clave rara no se acepta', () => {
    expect(parseItemKey('section:gala')).toEqual({ kind: 'section', id: 'gala' });
    expect(parseItemKey('block:abc')).toEqual({ kind: 'block', id: 'abc' });
    expect(parseItemKey('section:hack')).toBeNull();
    expect(parseItemKey('otra:cosa')).toBeNull();
    expect(parseItemKey(`block:${'x'.repeat(41)}`)).toBeNull();
  });
});

describe('ajustes por sección', () => {
  it('un fondo de otra familia no se aplica: el texto está pensado para su fondo', () => {
    expect(tonesFor('certamen')).toEqual(['paper', 'soft']);
    expect(tonesFor('candidatas')).toEqual(['night', 'deep']);
    expect(tonesFor('inicio')).toEqual([]);
    expect(sectionSettings({ certamen: { tone: 'night' } }, 'certamen').tone).toBe('paper');
    expect(sectionSettings({ certamen: { tone: 'soft' } }, 'certamen').tone).toBe('soft');
    expect(sectionSettings({}, 'votacion').tone).toBe('deep');
  });

  it('texto propio: ausente = automático, vacío = sin texto', () => {
    expect(overrideOr(undefined, 'Auto')).toBe('Auto');
    expect(overrideOr(null, 'Auto')).toBe('Auto');
    expect(overrideOr('', 'Auto')).toBe('');
    expect(overrideOr('Propio', 'Auto')).toBe('Propio');
  });

  it('las clases de fondo y espaciado salen de listas cerradas', () => {
    expect(sectionToneClasses('deep', 'compact')).toBe('is-night is-deep is-compact');
    expect(sectionToneClasses('soft', 'auto')).toBe('is-paper is-soft');
    expect(sectionToneClasses(null, 'airy')).toBe('is-airy');
  });

  it('volver todo a automático saca la sección del registro', () => {
    const one = patchSectionSettings({}, 'gala', { title: 'Gran final', tone: 'soft' });
    expect(one).toEqual({ gala: { title: 'Gran final', tone: 'soft' } });
    const back = patchSectionSettings(one, 'gala', { title: undefined, tone: 'auto' });
    expect(back).toEqual({});
    expect(patchSectionSettings({}, 'gala', { hidden: false })).toEqual({});
  });
});
