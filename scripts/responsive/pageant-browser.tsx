import { createRoot } from 'react-dom/client';
import { PageantSite } from '@/components/public/pageant/PageantSite';
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
  createRoot(host).render(<PageantSite site={site} view={view} />);
};
