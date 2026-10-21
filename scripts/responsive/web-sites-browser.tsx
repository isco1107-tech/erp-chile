import { createRoot } from 'react-dom/client';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { WEB_SITE_FIXTURES } from './web-sites-fixtures';

/** Monta un sitio de pruebas EN el navegador, para que corran los componentes interactivos reales (carrusel, pestañas, cinta, comparador). */
declare global {
  interface Window {
    mountWebSite: (name: string) => void;
    webSiteFixtures: () => string[];
  }
}

window.webSiteFixtures = () => Object.keys(WEB_SITE_FIXTURES);

window.mountWebSite = (name: string) => {
  const fixture = WEB_SITE_FIXTURES[name];
  if (!fixture) throw new Error(`No existe el caso "${name}"`);
  const host = document.getElementById('root');
  if (!host) throw new Error('Falta #root');
  createRoot(host).render(<SiteRenderer name={fixture.name} logoUrl="https://img.test/logo.svg" theme={fixture.theme} document={fixture.document} slug="pruebas" mode="public" />);
};
