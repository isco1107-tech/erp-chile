jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://example.cl' }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import { PageantNativeTextEditor } from '@/components/projects/PageantNativeTextEditor';
import { PageantPage } from '@/components/public/pageant/PageantPage';
import { formatCurrency } from '@/lib/chile/tax';
import { isPageantNativeTextField, pageantNativeTextOf } from '@/lib/events/pageant-native-text';
import { buildPageantView } from '@/lib/events/pageant-site';
import { baseSite } from '../scripts/responsive/fixtures';

const values = {
  publicTagline: '', publicDescription: '', directorName: '', directorRole: '', directorBio: '', sponsorExclusivityNote: '',
};

it('envía al estudio solo los campos de texto editables', () => {
  expect(pageantNativeTextOf({ ...values, publicTagline: '  Noche de gala  ', ...{ internalNotes: 'nota privada' } }))
    .toEqual({ ...values, publicTagline: '  Noche de gala  ' });
  expect(isPageantNativeTextField('publicTagline')).toBe(true);
  expect(isPageantNativeTextField('publicSlug')).toBe(false);
  expect(isPageantNativeTextField('__proto__')).toBe(false);
});

it('permite iniciar un texto vacío en el editor y conserva el contenido automático y las reglas de visibilidad en el sitio', () => {
  const site = baseSite({ tagline: null, description: null, director: null });
  const view = buildPageantView(site, new Date('2026-06-10'), 'https://example.cl', formatCurrency);
  const publicPage = renderToStaticMarkup(<PageantPage site={site} view={view} />);
  expect(publicPage).not.toContain('data-native-text');
  expect(publicPage).not.toContain('id="director"');

  const editing = renderToStaticMarkup(<PageantPage site={site} view={view} layerEditor={{
    onSelect: () => undefined,
    renderInsertion: () => null,
    renderNativeText: (field, children) => (
      <PageantNativeTextEditor field={field} value={values[field]} onChange={() => undefined}>{children}</PageantNativeTextEditor>
    ),
  }} />);
  for (const field of ['publicTagline', 'publicDescription', 'directorName', 'directorRole', 'directorBio']) {
    expect(editing).toContain(`data-native-text="${field}"`);
  }
  const heroLead = publicPage.match(/class="pgs-tagline pgs-rise"[^>]*>([^<]+)<\/p>/)?.[1];
  expect(heroLead).toBeTruthy();
  expect(editing).toContain(heroLead);
});

it('la frase de candidatas no altera el texto automático de auspicios', () => {
  const site = baseSite({ tagline: 'Frase de candidatas', candidateSide: false, registration: null, candidates: [], voting: null });
  const view = buildPageantView(site, new Date('2026-06-10'), 'https://example.cl', formatCurrency);
  const fields: string[] = [];
  const sponsor = renderToStaticMarkup(<PageantPage site={site} view={view} layerEditor={{
    onSelect: () => undefined, renderInsertion: () => null,
    renderNativeText: (field, children) => { fields.push(field); return children; },
  }} />);
  expect(fields).toContain('sponsorExclusivityNote');
  expect(fields).not.toContain('publicTagline');
  expect(sponsor).toContain('Asocia tu marca');
  expect(sponsor).not.toContain('Frase de candidatas');
});
