import SalesContact from '../SalesContact';
import type { DesktopRelease } from '../Landing';
import CinematicSequence from './CinematicSequence';
import Downloads from './Downloads';
import EventScene from './EventScene';
import FlowScene from './FlowScene';
import LandingShell from './LandingShell';
import ProductScene from './ProductScene';
import { ChileScene, FaqScene, Footer, Marquee, PlansScene, moduleWords } from './Scenes';
import s from './v2.module.css';

/**
 * Landing cinematográfica (`/`). Componente de servidor: solo el hero, las
 * pestañas (plataforma y certámenes), el formulario y las descargas envían
 * JavaScript al navegador; el resto llega como HTML.
 *
 * Recorrido compacto (la versión anterior medía ~20 pantallas): hero con
 * video · franja de módulos · plataforma · cómo funciona (línea de tiempo) ·
 * tributación · certámenes · planes · preguntas · cotización · descargas ·
 * pie con el cierre. Una sola escena fija: el video del hero.
 */
export default function CinematicLanding({ releases, salesEmail, salesWhatsapp, legalName, legalRut, className }: {
  releases: DesktopRelease[];
  salesEmail: string;
  salesWhatsapp?: string;
  legalName?: string;
  legalRut?: string;
  className?: string;
}) {
  return (
    <LandingShell className={className}>
      <CinematicSequence />
      <Marquee words={moduleWords} label="Módulos de Aether" />
      <ProductScene />
      <FlowScene />
      <ChileScene />
      <EventScene />
      <PlansScene />
      <FaqScene />
      <div className={s.contact}><SalesContact email={salesEmail} whatsapp={salesWhatsapp} /></div>
      <Downloads releases={releases} />
      <Footer salesEmail={salesEmail} legalName={legalName} legalRut={legalRut} />
    </LandingShell>
  );
}
