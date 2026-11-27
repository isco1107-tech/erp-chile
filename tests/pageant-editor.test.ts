import { toCanvasDraft, type SiteEditorState } from '@/components/projects/site-editor/site-draft';
import { blocksWithSampleText, insertStudioBlock, sampleTextCount } from '@/lib/events/pageant-design-ops';
import { applyDraftToSite, pageantEditorDraftSchema } from '@/lib/events/pageant-editor-draft';
import { editorMessage, PAGEANT_EDITOR_CHANNEL, parseToCanvas, parseToEditor } from '@/lib/events/pageant-editor-protocol';
import { pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import { createBlock } from '@/lib/web-sites/blocks';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import { layoutsOf } from '@/lib/web-sites/variants';
import { baseSite } from '../scripts/responsive/fixtures';

const draft = (patch: Record<string, unknown> = {}) => pageantEditorDraftSchema.parse({ design: pageantSiteDesignSchema.parse({}), ...patch });

describe('mensajes entre el editor visual y su lienzo', () => {
  it('acepta solo mensajes del canal, con elementos que existen', () => {
    expect(parseToEditor(editorMessage({ type: 'select', key: 'section:candidatas' }))).toEqual({ channel: PAGEANT_EDITOR_CHANNEL, type: 'select', key: 'section:candidatas' });
    expect(parseToEditor(editorMessage({ type: 'select', key: 'footer' }))?.type).toBe('select');
    expect(parseToEditor(editorMessage({ type: 'select', key: 'block:b1' }))?.type).toBe('select');
    // Sin canal, con otro canal o con un elemento inventado: se descarta.
    expect(parseToEditor({ type: 'select', key: 'section:candidatas' })).toBeNull();
    expect(parseToEditor({ channel: 'otro', type: 'select', key: 'section:candidatas' })).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'select', key: 'section:inventada' }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'borrarTodo' }))).toBeNull();
    expect(parseToEditor('texto suelto')).toBeNull();
  });

  it('limita lo que el lienzo puede pedir: campos, acciones y tamaños conocidos', () => {
    expect(parseToEditor(editorMessage({ type: 'editText', key: 'section:certamen', field: 'title', value: 'Nuestra historia' }))?.type).toBe('editText');
    expect(parseToEditor(editorMessage({ type: 'editText', key: 'section:certamen', field: 'publicSlug', value: 'x' }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'editText', key: 'section:certamen', field: 'title', value: 'x'.repeat(8001) }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'action', key: 'block:b1', action: 'delete' }))?.type).toBe('action');
    expect(parseToEditor(editorMessage({ type: 'action', key: 'block:b1', action: 'publicar' }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'notice', text: 'x'.repeat(201) }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'rendered', keys: Array.from({ length: 201 }, () => 'section:inicio') }))).toBeNull();
    expect(parseToEditor(editorMessage({ type: 'insert', after: 'section:inicio', before: null }))?.type).toBe('insert');
  });

  it('el lienzo solo recibe el estado y a dónde desplazarse', () => {
    const state = editorMessage({ type: 'state', draft: {}, audience: 'sponsor', mode: 'edit', selected: null });
    expect(parseToCanvas(state)?.type).toBe('state');
    expect(parseToCanvas({ ...state, mode: 'publicar' })).toBeNull();
    expect(parseToCanvas(editorMessage({ type: 'scrollTo', key: 'section:gala' }))?.type).toBe('scrollTo');
    expect(parseToCanvas(editorMessage({ type: 'scrollTo', key: 'javascript:alert(1)' }))).toBeNull();
  });
});

describe('borrador del editor sobre los datos reales', () => {
  it('lo que falta o viene mal vuelve a su valor vacío', () => {
    const parsed = pageantEditorDraftSchema.parse({ tagline: 42, accent: 'neon', director: 'x', toggles: null, partners: { items: 'no' } });
    expect(parsed.tagline).toBe('');
    expect(parsed.accent).toBe('gold');
    expect(parsed.director.name).toBe('');
    expect(parsed.toggles).toEqual({ candidates: true, sponsors: true, ranking: false, results: false, sponsorLead: false });
    expect(parsed.partners.items).toEqual([]);
  });

  it('solo muestra imágenes https y respeta los interruptores de cada sección', () => {
    const site = applyDraftToSite(
      baseSite(),
      draft({
        coverImageUrl: 'http://inseguro.cl/portada.jpg',
        director: { name: '', title: 'Directora', role: '', bio: '', photoUrl: '', highlights: '' },
        toggles: { candidates: false, sponsors: false, ranking: false, results: false, sponsorLead: false },
      })
    );
    expect(site.coverImageUrl).toBeNull();
    expect(site.candidates).toEqual([]);
    expect(site.sponsorsByTier).toEqual([]);
    expect(site.voteRanking).toBeNull();
    expect(site.results).toBeNull();
    expect(site.sponsorLeadForm).toBe(false);
    // Sin nombre no hay sección de dirección (igual que en el sitio publicado).
    expect(site.director).toBeNull();
  });

  it('con resultados apagados nadie aparece como finalista ni ganadora', () => {
    const site = applyDraftToSite(baseSite(), draft({ toggles: { candidates: true, sponsors: true, ranking: true, results: false, sponsorLead: true } }));
    expect(site.candidates.length).toBeGreaterThan(0);
    expect(site.candidates.some((candidate) => candidate.isFinalist || candidate.isWinner)).toBe(false);
    expect(site.voteRanking).not.toBeNull();
  });

  it('textos, trayectoria y logos del pie salen del borrador, limpios', () => {
    const site = applyDraftToSite(
      baseSite(),
      draft({
        tagline: '  Nueva frase  ',
        description: '',
        coverImageUrl: 'https://cdn.ejemplo.cl/portada.jpg',
        director: { name: ' Ana ', title: 'Directora', role: '', bio: '', photoUrl: 'https://cdn.ejemplo.cl/ana.jpg', highlights: 'Uno\n\n Uno \nDos' },
        partners: {
          title: 'Organizan',
          items: [
            { id: 'a', name: 'Municipalidad', logoUrl: 'https://cdn.ejemplo.cl/muni.png', href: '@munitemuco' },
            { id: 'b', name: 'Sin logo seguro', logoUrl: 'http://cdn.ejemplo.cl/x.png', href: '' },
          ],
        },
      })
    );
    expect(site.tagline).toBe('Nueva frase');
    expect(site.description).toBeNull();
    expect(site.coverImageUrl).toBe('https://cdn.ejemplo.cl/portada.jpg');
    expect(site.director).toMatchObject({ name: 'Ana', highlights: ['Uno', 'Dos'], photoUrl: 'https://cdn.ejemplo.cl/ana.jpg' });
    expect(site.footerPartners.title).toBe('Organizan');
    expect(site.footerPartners.items).toHaveLength(1);
    expect(site.footerPartners.items[0]?.href).toMatch(/^https:\/\/(www\.)?instagram\.com\/munitemuco/);
  });

  it('un diseño anterior (sin orden guardado) se ve ya como una sola lista editable', () => {
    const site = applyDraftToSite(baseSite(), draft({ design: pageantSiteDesignSchema.parse({ enabled: true, placement: 'before', blocks: [createBlock('text')] }) }));
    const layout = site.creative?.layout ?? [];
    expect(layout[0]?.kind).toBe('block');
    expect(layout.some((item) => item.kind === 'section' && item.id === 'inicio')).toBe(true);
    // Un diseño inválido no borra el que ya tenía el certamen.
    const kept = applyDraftToSite(baseSite({ creative: pageantSiteDesignSchema.parse({ enabled: true, blocks: [createBlock('quote')] }) }), draft({ design: 'no es un diseño' }));
    expect(kept.creative?.blocks).toHaveLength(1);
  });

  it('el formulario y el editor mandan al lienzo el mismo borrador', () => {
    const values = {
      publicSiteDesign: pageantSiteDesignSchema.parse({}),
      publicSlug: 'mi-certamen',
      publicSiteEnabled: true,
      publicTagline: 'Frase',
      publicDescription: 'Sobre',
      coverImageUrl: '',
      publicTypography: {},
      publicPalette: null,
      publicAccent: 'rose' as const,
      instagramHandle: '@cuenta',
      publicContactEmail: 'hola@ejemplo.cl',
      publicWhatsapp: '+56 9 1111 2222',
      showCandidatesPublic: false,
      showSponsorsPublic: true,
      showVoteRankingPublic: true,
      showResultsPublic: false,
      sponsorLeadFormEnabled: true,
      directorName: 'Ana',
      directorTitle: 'Directora' as const,
      directorRole: '',
      directorBio: '',
      directorPhotoUrl: '',
      faviconUrl: '',
      sponsorExclusivityNote: '',
    };
    const state: SiteEditorState = { values, partners: { title: '', items: [] }, highlightsText: 'Uno\nDos' };
    const canvasDraft = toCanvasDraft(state);
    expect(pageantEditorDraftSchema.parse(canvasDraft)).toMatchObject({
      tagline: 'Frase',
      accent: 'rose',
      toggles: { candidates: false, sponsors: true, ranking: true, results: false, sponsorLead: true },
      director: { name: 'Ana', title: 'Directora', highlights: 'Uno\nDos' },
    });
  });
});

describe('texto de ejemplo en las secciones del estudio', () => {
  it('se reconoce el contenido de muestra y no el escrito por la persona', () => {
    const sample = sampleBlock('quote', layoutsOf('quote')[0]!.value);
    expect(sampleTextCount(sample)).toBeGreaterThan(0);
    expect(sampleTextCount(createBlock('quote'))).toBe(0);
  });

  it('solo cuentan las secciones visibles con el estudio encendido', () => {
    const sample = sampleBlock('quote', layoutsOf('quote')[0]!.value);
    const inserted = insertStudioBlock(pageantSiteDesignSchema.parse({}), sample, {});
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(blocksWithSampleText(inserted.design)).toHaveLength(1);
    expect(blocksWithSampleText({ ...inserted.design, blocks: inserted.design.blocks.map((block) => ({ ...block, hidden: true })) })).toHaveLength(0);
    expect(blocksWithSampleText({ ...inserted.design, enabled: false })).toHaveLength(0);
  });
});
