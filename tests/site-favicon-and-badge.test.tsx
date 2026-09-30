/**
 * - Logo de la pestaña (favicon) por sitio: se valida, y solo cuando existe reemplaza al de la plataforma.
 * - Botón "Hecho con Aether": lleva SIEMPRE a la landing de la plataforma (URL absoluta, porque en el dominio propio de un
 *   cliente una ruta relativa sería el sitio del propio cliente) y abre en otra pestaña.
 */

jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://aetherp.online' }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import AetherBadge from '@/components/shared/AetherBadge';
import { pageantSiteMetadata } from '@/components/public/pageant/PageantSiteDocument';
import { webSiteMetadata } from '@/components/web-sites/WebSiteDocument';
import { FIXTURES } from '../scripts/responsive/fixtures';
import { projectPublicSiteSchema } from '@/modules/projects/schema';
import type { PublicWebSite } from '@/modules/web-sites/services/web-sites.service';

const FAVICON = 'https://x.public.blob.vercel-storage.com/pageant-favicons/co_1/pr_1-1.png';

describe('favicon del micrositio de certamen', () => {
  it('sin logo propio no se toca `icons` (el navegador usa el de la plataforma)', () => {
    expect(pageantSiteMetadata({ ...FIXTURES.normal!, faviconUrl: null }).icons).toBeUndefined();
  });

  it('con logo propio reemplaza al de la plataforma', () => {
    const meta = pageantSiteMetadata({ ...FIXTURES.normal!, faviconUrl: FAVICON });
    expect(meta.icons).toEqual({ icon: FAVICON, shortcut: FAVICON, apple: FAVICON });
  });

  it('el esquema acepta una URL, normaliza vacío a null y rechaza texto que no es URL', () => {
    const base = { publicSiteEnabled: false, showCandidatesPublic: true, showSponsorsPublic: true, showVoteRankingPublic: false, showResultsPublic: false, sponsorLeadFormEnabled: true };
    expect(projectPublicSiteSchema.parse({ ...base, faviconUrl: FAVICON }).faviconUrl).toBe(FAVICON);
    expect(projectPublicSiteSchema.parse({ ...base, faviconUrl: '' }).faviconUrl).toBeNull();
    expect(projectPublicSiteSchema.parse(base).faviconUrl).toBeNull();
    expect(projectPublicSiteSchema.safeParse({ ...base, faviconUrl: 'no-es-url' }).success).toBe(false);
  });
});

describe('favicon de un sitio web', () => {
  const site = { title: 'Mi sitio', description: null, indexable: true, ogImageUrl: null } as unknown as PublicWebSite;

  it('sin logo propio no se toca `icons`; con logo lo reemplaza', () => {
    expect(webSiteMetadata({ ...site, faviconUrl: null }, 'https://mi.cl').icons).toBeUndefined();
    expect(webSiteMetadata({ ...site, faviconUrl: FAVICON }, 'https://mi.cl').icons).toEqual({ icon: FAVICON, shortcut: FAVICON, apple: FAVICON });
  });
});

describe('botón "Hecho con Aether"', () => {
  const html = () => renderToStaticMarkup(<AetherBadge />);

  it('lleva a la landing de la plataforma con URL absoluta', () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = 'https://aetherp.online';
    try {
      expect(html()).toContain('href="https://aetherp.online/"');
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  });

  it('abre en otra pestaña sin darle acceso a la ventana original', () => {
    const markup = html();
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener"');
  });

  it('ya no lleva a la política de privacidad', () => {
    expect(html()).not.toContain('/aether/privacidad');
  });
});
