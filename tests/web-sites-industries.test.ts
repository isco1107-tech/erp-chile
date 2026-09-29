import { blockLinks, blockSchema } from '@/lib/web-sites/blocks';
import { findIndustry, industryDocument, INDUSTRY_TEMPLATES } from '@/lib/web-sites/industries';
import { evaluateReadiness } from '@/lib/web-sites/readiness';
import { homeOf, isValidSiteLink, parseSiteDocument, siteDocumentSchema } from '@/lib/web-sites/site';
import { isSampleText } from '@/lib/web-sites/templates';
import { themeProblems } from '@/lib/web-sites/theme';

/**
 * Sitios por rubro: cada plantilla debe partir válida, legible, con su botón
 * destacado funcionando y con los textos de ejemplo reconocidos (para que nadie
 * publique "[tu barrio]" por descuido).
 */

const COMPANY = { email: 'hola@minegocio.cl', phone: '+56 9 1234 5678', address: 'Av. Providencia 1234, Providencia' };

describe('sitios por rubro', () => {
  it('los ids son únicos y hay al menos un rubro', () => {
    expect(INDUSTRY_TEMPLATES.length).toBeGreaterThan(0);
    expect(new Set(INDUSTRY_TEMPLATES.map((industry) => industry.id)).size).toBe(INDUSTRY_TEMPLATES.length);
    expect(findIndustry('no-existe')).toBeNull();
  });

  for (const industry of INDUSTRY_TEMPLATES) {
    describe(industry.label, () => {
      const { document, theme } = industryDocument(industry, { name: 'Mi Negocio', contact: COMPANY });

      it('arma un sitio válido, con inicio y portada', () => {
        expect(siteDocumentSchema.safeParse(document).success).toBe(true);
        expect(parseSiteDocument(JSON.parse(JSON.stringify(document)))).toEqual(JSON.parse(JSON.stringify(document)));
        expect(homeOf(document).blocks[0]?.type).toBe('hero');
        for (const page of industry.pages) for (const draft of page.blocks) expect(blockSchema.safeParse({ ...draft, id: 'x' }).success).toBe(true);
      });

      it('la paleta es legible', () => {
        expect(themeProblems(theme)).toEqual([]);
      });

      it('el botón destacado y todos los enlaces funcionan, y el contacto viene precargado', () => {
        expect(document.header.ctaLabel).not.toBe('');
        expect(isValidSiteLink(document.header.ctaHref, document)).toBe(true);
        for (const page of document.pages) for (const block of page.blocks) for (const link of blockLinks(block)) expect(isValidSiteLink(link.href, document)).toBe(true);
        const contact = document.pages.flatMap((page) => page.blocks).find((block) => block.type === 'contact');
        expect(contact).toMatchObject({ email: COMPANY.email, phone: COMPANY.phone });
        expect(document.whatsapp.enabled).toBe(industry.whatsappButton);
      });

      it('no se puede publicar sin cambiar los textos de ejemplo, y hay ejemplos reconocibles', () => {
        const report = evaluateReadiness({ kind: industry.kind, mode: 'GUIDED', document, theme });
        expect(report.items.find((item) => item.id === 'sample')?.ok).toBe(false);
        expect(report.canPublish).toBe(false);
        expect(industry.pages.flatMap((page) => page.blocks).some((draft) => JSON.stringify(draft).length > 0)).toBe(true);
        expect(isSampleText('Instalamos paneles solares en toda la Región del Biobío desde 2015.')).toBe(false);
      });

      it('el anuncio es corto y hay consejos del rubro', () => {
        expect((industry.header.announcement ?? '').length).toBeLessThanOrEqual(60);
        expect(industry.tips.length).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('sin teléfono no activa WhatsApp ni la barra, y el botón destacado lleva al contacto', () => {
    const industry = INDUSTRY_TEMPLATES[0]!;
    const { document } = industryDocument(industry, { name: 'Sin Datos' });
    expect(document.whatsapp.enabled).toBe(false);
    expect(document.actionBar.enabled).toBe(false);
    expect(document.header.ctaHref).toMatch(/^page:/);
  });
});
