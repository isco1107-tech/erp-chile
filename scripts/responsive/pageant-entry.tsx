import { renderToStaticMarkup } from 'react-dom/server';
import { PageantSite } from '@/components/public/pageant/PageantSite';
import { formatCurrency } from '@/lib/chile/tax';
import { buildPageantView } from '@/lib/events/pageant-site';
import { FIXTURES } from './fixtures';

/** HTML del micrositio para un caso de prueba, con la misma lógica de derivación que la página real. */
export function renderPageant(name: string): string {
  const site = FIXTURES[name];
  if (!site) throw new Error(`No existe el caso "${name}"`);
  const view = buildPageantView(site, new Date('2026-09-30T12:00:00Z'), 'https://ejemplo.cl', formatCurrency);
  return renderToStaticMarkup(<PageantSite site={site} view={view} />);
}

export const FIXTURE_NAMES = Object.keys(FIXTURES);
