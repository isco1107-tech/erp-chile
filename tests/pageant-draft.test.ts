import {
  makePageantDraft, pageantDraftBase, pageantDraftFields, pageantDraftSaved,
  pageantDraftScope, readPageantDraft,
} from '@/lib/events/pageant-draft';
import { canvasSchema } from '@/lib/web-sites/canvas';

const base = pageantDraftBase({
  publicSiteDesign: null, publicTagline: 'Primavera', publicDescription: null,
  directorName: null, directorRole: null, directorBio: null, sponsorExclusivityNote: null,
});

describe('Borrador del editor del certamen en el navegador', () => {
  test('las claves aíslan por empresa, persona y proyecto, incluso con separadores', () => {
    const keys = [['cc', 'u', 'p'], ['cc', 'u', 'p:hijo'], ['cc', 'u:p', 'hijo'], ['cc', 'u2', 'p'], ['oo', 'u', 'p']];
    const scopes = keys.map(([company, user, project]) => pageantDraftScope(company, user, project));
    for (const a of scopes) for (const b of scopes) if (a !== b) expect(a.startsWith(b)).toBe(false);
    expect(new Set(scopes).size).toBe(keys.length);
  });

  test('persiste solo los campos públicos editados, sin la configuración del formulario', () => {
    const current = { ...base, publicTagline: 'Gala', publicSiteEnabled: true, publicContactEmail: 'privado@example.test' };
    const record = makePageantDraft(base, current, 123);
    expect(record).toEqual({ time: 123, before: { publicTagline: 'Primavera' }, after: { publicTagline: 'Gala' } });
    expect(readPageantDraft(JSON.stringify(record))).toEqual(record);
    expect(makePageantDraft(base, { ...current, publicTagline: base.publicTagline }, 124)).toBeNull();
  });

  test('reconoce cambios guardados y cambios ajenos, y distingue los conflictos por campo', () => {
    const record = makePageantDraft(base, { ...base, publicTagline: 'Gala', directorRole: 'Dirección artística' }, 123)!;
    expect(pageantDraftFields(record, { ...base, directorBio: 'Se actualizó en otra sesión' })).toEqual({ recoverable: ['publicTagline', 'directorRole'], conflicts: [] });
    expect(pageantDraftFields(record, { ...base, publicTagline: 'Gala', directorRole: 'Productor' })).toEqual({ recoverable: [], conflicts: ['directorRole'] });
    expect(pageantDraftSaved(record, { ...base, publicTagline: 'Gala', directorRole: 'Dirección artística' })).toBe(true);
  });

  test('conserva capas, formato y enlaces a medio escribir; tolera claves reordenadas por jsonb', () => {
    const overlay = canvasSchema.parse({ enabled: true, elements: [{ id: 't', text: 'Gala', richText: [{ text: 'Gala', bold: true }] }] });
    const design = { ...base.publicSiteDesign, overlays: { inicio: overlay }, footer: {
      ...base.publicSiteDesign.footer, links: [{ id: 'nuevo', label: 'Inscripción', href: '', newTab: false }],
    } };
    const record = makePageantDraft(base, { ...base, publicSiteDesign: design }, 123)!;
    const decoded = readPageantDraft(JSON.stringify(record));
    expect(decoded?.after.publicSiteDesign?.overlays?.inicio?.elements[0].richText).toEqual([{ text: 'Gala', bold: true }]);
    expect(decoded?.after.publicSiteDesign?.footer.links[0].label).toBe('Inscripción');
    const reordered = Object.fromEntries(Object.entries(design).reverse()) as typeof design;
    expect(pageantDraftSaved(decoded!, { ...base, publicSiteDesign: reordered })).toBe(true);
  });

  test('descarta datos inválidos y jamás restaura claves desconocidas del almacenamiento', () => {
    expect(readPageantDraft('{')).toBeNull();
    expect(readPageantDraft(JSON.stringify({ time: 123, before: {}, after: { directorRole: 5 } }))).toBeNull();
    expect(readPageantDraft(JSON.stringify({ time: 123, before: { publicSiteDesign: base.publicSiteDesign }, after: { publicSiteDesign: { blocks: 42 } } }))).toBeNull();
    const record = readPageantDraft(JSON.stringify({ time: 123, before: { publicTagline: 'A' }, after: { publicTagline: 'B', publicSiteEnabled: true } }));
    expect(record?.after).toEqual({ publicTagline: 'B' });
  });
});
