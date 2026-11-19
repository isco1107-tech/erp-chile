jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://aetherp.online' }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import { PageantSiteDocument } from '@/components/public/pageant/PageantSiteDocument';
import { parsePageantSiteDesign } from '@/lib/events/pageant-site-design';
import { projectPublicSiteSchema } from '@/modules/projects/schema';
import { baseSite } from '../scripts/responsive/fixtures';

const input = {
  publicSiteEnabled: false, showCandidatesPublic: true, showSponsorsPublic: true,
  showVoteRankingPublic: false, showResultsPublic: false, sponsorLeadFormEnabled: true,
};

function renderFooter(creative?: ReturnType<typeof parsePageantSiteDesign>) {
  const html = renderToStaticMarkup(<PageantSiteDocument site={baseSite({ creative })} />);
  return html.match(/<footer class="pgs-footer">[\s\S]*?<\/footer>/)?.[0] ?? '';
}

it('mantiene el pie automático en diseños guardados antes de la edición del pie', () => {
  const html = renderFooter(parsePageantSiteDesign({ enabled: true }));
  expect(html).toContain('Miss Universo Temuco');
  expect(html).toContain('href="mailto:contacto@missuniversotemuco.cl"');
  expect(html).toContain('href="/politica-privacidad"');
});

it('guarda y muestra el pie personalizado aunque las secciones del estudio estén apagadas', () => {
  const saved = projectPublicSiteSchema.parse({ ...input, publicSiteDesign: { footer: {
    title: 'Gala del Sur', description: 'Organiza la fundación', copyright: '© Fundación 2026',
    showMenu: false, showContact: false,
    links: [{ id: 'bases', label: 'Ver bases', href: 'www.example.cl/bases', newTab: true }],
  } } });
  const html = renderFooter(parsePageantSiteDesign(JSON.parse(JSON.stringify(saved.publicSiteDesign))));
  expect(html).toContain('Gala del Sur');
  expect(html).toContain('Organiza la fundación');
  expect(html).toContain('© Fundación 2026');
  expect(html).toContain('href="https://www.example.cl/bases" target="_blank" rel="noopener noreferrer"');
  expect(html).toContain('href="/politica-privacidad"');
  expect(html).not.toContain('href="#gala"');
  expect(html).not.toContain('instagram.com');
  expect(html).not.toContain('mailto:');
});

it('rechaza un enlace con un esquema inválido al guardar', () => {
  const result = projectPublicSiteSchema.safeParse({ ...input, publicSiteDesign: { footer: {
    links: [{ id: 'invalid', label: 'Enlace', href: 'javascript:alert(1)' }],
  } } });
  expect(result.success).toBe(false);
});
