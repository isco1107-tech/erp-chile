import { canRedo, canUndo, emptyHistory, HISTORY_GROUP_MS, HISTORY_LIMIT, recordChange, redoStep, structureSignature, undoStep } from '@/components/web-sites/editor-history';
import { addPageFromTemplate, countLinksTo, defaultButtonTarget, fillEmptyButtons } from '@/components/web-sites/pages-logic';
import { PAGE_TEMPLATES } from '@/lib/web-sites/page-templates';
import { addPage, documentFromBlocks, MAX_PAGES, pageLink, type SiteDocument } from '@/lib/web-sites/site';
import { templateBlocks } from '@/lib/web-sites/templates';

/** Lógica pura del editor de sitios: historial de deshacer/rehacer y páginas nuevas desde plantilla. */

describe('historial de deshacer y rehacer', () => {
  it('junta las escrituras seguidas en un solo paso y separa las pausas', () => {
    let history = emptyHistory<string>();
    history = recordChange(history, 'a', 1000);
    history = recordChange(history, 'ab', 1000 + HISTORY_GROUP_MS - 1);
    expect(history.past).toEqual(['a']);
    history = recordChange(history, 'abc', 1000 + HISTORY_GROUP_MS * 3);
    expect(history.past).toEqual(['a', 'abc']);
  });

  it('una acción estructural siempre abre un paso propio', () => {
    let history = recordChange(emptyHistory<string>(), 'a', 1000);
    history = recordChange(history, 'b', 1100, { boundary: true });
    expect(history.past).toEqual(['a', 'b']);
  });

  it('deshace, rehace y un cambio nuevo borra lo que se podía rehacer', () => {
    let history = recordChange(emptyHistory<string>(), 'uno', 1000);
    history = recordChange(history, 'dos', 5000);
    const undone = undoStep(history, 'tres');
    expect(undone?.value).toBe('dos');
    expect(canRedo(undone!.history)).toBe(true);
    const redone = redoStep(undone!.history, 'dos');
    expect(redone?.value).toBe('tres');
    expect(canUndo(redone!.history)).toBe(true);
    // Tras deshacer, el siguiente cambio no se une al anterior aunque llegue enseguida.
    const after = recordChange(undone!.history, 'dos', 5001);
    expect(after.future).toEqual([]);
    expect(after.past.length).toBe(undone!.history.past.length + 1);
    expect(undoStep(emptyHistory<string>(), 'x')).toBeNull();
    expect(redoStep(emptyHistory<string>(), 'x')).toBeNull();
  });

  it('recuerda como máximo 60 pasos', () => {
    let history = emptyHistory<number>();
    for (let n = 0; n < HISTORY_LIMIT + 20; n += 1) history = recordChange(history, n, 1000 + n * 10_000);
    expect(history.past.length).toBe(HISTORY_LIMIT);
    expect(history.past[history.past.length - 1]).toBe(HISTORY_LIMIT + 19);
  });

  it('la firma de estructura cambia al agregar una página, no al escribir', () => {
    const doc = documentFromBlocks(templateBlocks([{ type: 'hero', title: 'Hola' }]));
    const typed: SiteDocument = { ...doc, pages: doc.pages.map((page) => ({ ...page, title: 'Otro nombre' })) };
    expect(structureSignature(typed)).toBe(structureSignature(doc));
    expect(structureSignature(addPage(doc, { title: 'Servicios' }).doc)).not.toBe(structureSignature(doc));
  });
});

describe('páginas nuevas desde una plantilla', () => {
  const template = (id: string) => PAGE_TEMPLATES.find((item) => item.id === id)!;

  it('enlaza los botones sin destino a la sección de contacto del sitio', () => {
    const home = documentFromBlocks(templateBlocks([{ type: 'hero', title: 'Hola' }, { type: 'contact', heading: 'Contacto', showForm: true }]));
    const added = addPageFromTemplate(home, template('services'), 'Servicios')!;
    const contactPage = home.pages[0]!;
    expect(added.target).toMatch(new RegExp(`^page:${contactPage.id}#`));
    expect(added.linkedButtons).toBeGreaterThan(0);
    expect(added.unlinkedButtons).toBe(0);
    const cta = added.page.blocks.find((block) => block.type === 'cta');
    expect(cta && cta.type === 'cta' ? cta.buttonHref : '').toBe(added.target);
    expect(added.doc.pages).toHaveLength(2);
  });

  it('usa el WhatsApp del sitio si no hay contacto, y avisa si no hay nada', () => {
    const bare = documentFromBlocks(templateBlocks([{ type: 'hero', title: 'Hola' }]));
    const without = addPageFromTemplate(bare, template('services'), 'Servicios')!;
    expect(without.target).toBe('');
    expect(without.unlinkedButtons).toBeGreaterThan(0);

    const withWhatsapp: SiteDocument = { ...bare, whatsapp: { ...bare.whatsapp, enabled: true, number: '+56 9 1234 5678' } };
    expect(defaultButtonTarget(withWhatsapp)).toBe('https://wa.me/56912345678');
    const linked = addPageFromTemplate(withWhatsapp, template('pricing'), 'Precios')!;
    expect(linked.unlinkedButtons).toBe(0);
  });

  it('no pasa del máximo de páginas', () => {
    let doc = documentFromBlocks([]);
    while (doc.pages.length < MAX_PAGES) doc = addPage(doc, { title: `Página ${doc.pages.length}` }).doc;
    expect(addPageFromTemplate(doc, template('blank'), 'Otra')).toBeNull();
  });

  it('solo rellena botones que tienen texto y no tienen enlace', () => {
    const blocks = templateBlocks([
      { type: 'cta', title: 'Hola', buttonLabel: 'Escríbenos', buttonHref: '' },
      { type: 'cta', title: 'Chao', buttonLabel: 'Ver', buttonHref: 'https://miweb.cl' },
      { type: 'cta', title: 'Sin texto', buttonLabel: '', buttonHref: '' },
    ]);
    const result = fillEmptyButtons(blocks, '#contacto');
    expect(result.filled).toBe(1);
    expect(result.pending).toBe(0);
    expect(fillEmptyButtons(blocks, '').pending).toBe(1);
  });

  it('cuenta los enlaces que llevan a una página, separando los que el sitio limpia solo', () => {
    const base = addPage(documentFromBlocks(templateBlocks([{ type: 'cta', title: 'Hola', buttonLabel: 'Ir', buttonHref: '' }])), { title: 'Servicios' });
    const target = base.page.id;
    const doc: SiteDocument = {
      ...base.doc,
      pages: base.doc.pages.map((page, index) => (index === 0 ? { ...page, blocks: page.blocks.map((block) => (block.type === 'cta' ? { ...block, buttonHref: pageLink(target) } : block)) } : page)),
      header: { ...base.doc.header, menu: [{ id: 'm1', label: 'Servicios', href: pageLink(target), newTab: false, children: [] }] },
    };
    expect(countLinksTo(doc, target)).toEqual({ cleaned: 1, manual: 1 });
  });
});
