import { createRoot } from 'react-dom/client';
import { AcademySite } from '@/components/public/academy/AcademySite';
import { ACADEMY_FIXTURES } from './academy-fixtures';

/** Monta el micrositio de la academia EN el navegador, para que corran los efectos reales (carrusel, revelado, ajuste del nombre). */
declare global {
  interface Window {
    mountAcademy: (name: string) => void;
  }
}

window.mountAcademy = (name: string) => {
  const site = ACADEMY_FIXTURES[name];
  if (!site) throw new Error(`No existe el caso "${name}"`);
  const host = document.getElementById('root');
  if (!host) throw new Error('Falta #root');
  createRoot(host).render(<AcademySite site={site} />);
};
