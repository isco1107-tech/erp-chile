import { footerPartnersSchema, MAX_FOOTER_PARTNERS, normalizePartnerLink, parseFooterPartners, partnerLinkLabel } from '@/lib/events/pageant-partners';
import { projectPublicSiteSchema } from '@/modules/projects/schema';

const LOGO = 'https://x.public.blob.vercel-storage.com/pageant-partners/co1/logo.png';

describe('enlace de un logo del pie', () => {
  it('una cuenta suelta lleva a su Instagram', () => {
    expect(normalizePartnerLink('@municipalidad.temuco')).toBe('https://www.instagram.com/municipalidad.temuco/');
    expect(normalizePartnerLink('cuenta_municipal')).toBe('https://www.instagram.com/cuenta_municipal/');
    expect(normalizePartnerLink('  @cuenta  ')).toBe('https://www.instagram.com/cuenta/');
  });

  it('acepta direcciones web y las deja en https', () => {
    expect(normalizePartnerLink('instagram.com/cuenta')).toBe('https://instagram.com/cuenta');
    expect(normalizePartnerLink('www.temuco.cl')).toBe('https://www.temuco.cl/');
    expect(normalizePartnerLink('http://www.temuco.cl/agenda')).toBe('https://www.temuco.cl/agenda');
    expect(normalizePartnerLink('https://www.instagram.com/cuenta/')).toBe('https://www.instagram.com/cuenta/');
  });

  it('vacío = sin enlace; lo que no es una dirección https se rechaza', () => {
    expect(normalizePartnerLink('')).toBeNull();
    expect(normalizePartnerLink(null)).toBeNull();
    for (const bad of ['javascript:alert(1)', 'data:text/html,hola', 'ftp://sitio.cl', 'https://usuario:clave@sitio.cl', 'hola mundo.cl', '@.cuenta', 'https://localhost']) {
      expect(normalizePartnerLink(bad)).toBeUndefined();
    }
  });

  it('el panel muestra a dónde lleva', () => {
    expect(partnerLinkLabel('https://www.instagram.com/cuenta/')).toBe('@cuenta');
    expect(partnerLinkLabel('https://www.temuco.cl/')).toBe('temuco.cl');
    expect(partnerLinkLabel(null)).toBeNull();
  });
});

describe('logos del pie al guardar y al leer', () => {
  it('normaliza el enlace al guardar y exige nombre', () => {
    const ok = footerPartnersSchema.parse({ title: '', items: [{ id: 'a', name: 'Municipalidad', logoUrl: LOGO, href: '@cuenta' }] });
    expect(ok).toEqual({ title: null, items: [{ id: 'a', name: 'Municipalidad', logoUrl: LOGO, href: 'https://www.instagram.com/cuenta/' }] });
    expect(footerPartnersSchema.safeParse({ items: [{ id: 'a', name: '  ', logoUrl: LOGO }] }).success).toBe(false);
    const bad = footerPartnersSchema.safeParse({ items: [{ id: 'a', name: 'X', logoUrl: LOGO, href: 'javascript:alert(1)' }] });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toContain('Instagram');
  });

  it(`no admite más de ${MAX_FOOTER_PARTNERS} logos`, () => {
    const items = Array.from({ length: MAX_FOOTER_PARTNERS + 1 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, logoUrl: LOGO }));
    expect(footerPartnersSchema.safeParse({ items }).success).toBe(false);
  });

  it('al leer descarta solo lo inválido', () => {
    const parsed = parseFooterPartners({ title: 'Organizan', items: [{ id: 'a', name: 'Muni', logoUrl: LOGO, href: 'javascript:x' }, { id: 'b', name: 'CR', logoUrl: LOGO, href: null }, 'basura'] });
    expect(parsed).toEqual({ title: 'Organizan', items: [{ id: 'b', name: 'CR', logoUrl: LOGO, href: null }] });
    expect(parseFooterPartners(null)).toEqual({ title: null, items: [] });
    expect(parseFooterPartners([1, 2])).toEqual({ title: null, items: [] });
  });

  it('el formulario del sitio lo guarda vacío por defecto', () => {
    const base = { publicSiteEnabled: false, showCandidatesPublic: true, showSponsorsPublic: true, showVoteRankingPublic: false, showResultsPublic: false, sponsorLeadFormEnabled: false };
    expect(projectPublicSiteSchema.parse(base).footerPartners).toEqual({ title: null, items: [] });
  });
});
