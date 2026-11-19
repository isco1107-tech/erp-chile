import { createRoot } from 'react-dom/client';
import { PageantSite } from '@/components/public/pageant/PageantSite';
import { CreativeSiteSections } from '@/components/web-sites/CreativeSiteSections';
import { formatCurrency } from '@/lib/chile/tax';
import { buildPageantView } from '@/lib/events/pageant-site';
import { FIXTURES } from './fixtures';

/**
 * Monta el micrositio EN el navegador (no solo su HTML): así corren los efectos
 * de verdad (ajuste de títulos, animaciones de entrada, selector candidata/sponsor)
 * y el verificador mide lo mismo que verá una persona.
 */
declare global {
  interface Window {
    mountPageant: (name: string) => void;
  }
}

window.mountPageant = (name: string) => {
  const site = FIXTURES[name];
  if (!site) throw new Error(`No existe el caso "${name}"`);
  const view = buildPageantView(site, new Date('2026-09-30T12:00:00Z'), 'https://ejemplo.cl', formatCurrency);
  const host = document.getElementById('root');
  if (!host) throw new Error('Falta #root');
  // Igual que `PageantSiteDocument`: las secciones del estudio visual van antes, después de la portada o al final.
  const placement = site.creative?.placement ?? 'after';
  const creative = <CreativeSiteSections design={site.creative} name={site.name} slug={site.slug} basePath={`/certamen/${site.slug}`} />;
  createRoot(host).render(
    <>
      {placement === 'before' && creative}
      <PageantSite site={site} view={view} afterHero={placement === 'afterHero' ? creative : null} />
      {placement === 'after' && creative}
    </>
  );
};
