import SalesContact from '../SalesContact';
import type { DesktopRelease } from '../Landing';
import CinematicSequence from './CinematicSequence';
import Downloads from './Downloads';
import FlowScene from './FlowScene';
import LandingShell from './LandingShell';
import ProductScene from './ProductScene';
import { ChileScene, Closing, EventScene, FaqScene, Footer, Marquee, Outcomes, PlansScene, moduleWords } from './Scenes';
import s from './v2.module.css';

/**
 * Landing cinematográfica (/landing-v2). Componente de servidor: solo el hero,
 * las pestañas, la escena fija de pasos, el formulario y las descargas envían
 * JavaScript al navegador; el resto llega como HTML.
 *
 * Versión minimalista: hero con video · resultados y franja de módulos ·
 * plataforma · cómo funciona · tributación (tres puntos) · certámenes ·
 * planes · preguntas · cotización y descargas · cierre y pie. Lo que dejó de
 * mostrarse (lo que cambia, rutas, módulos, seguridad, puesta en marcha)
 * sigue en la historia de git.
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
      <Outcomes />
      <Marquee words={moduleWords} label="Módulos de Aether" />
      <ProductScene />
      <FlowScene />
      <ChileScene />
      <EventScene />
      <PlansScene />
      <FaqScene />
      <div className={s.contact}><SalesContact email={salesEmail} whatsapp={salesWhatsapp} /></div>
      <Downloads releases={releases} />
      <Closing />
      <Footer salesEmail={salesEmail} legalName={legalName} legalRut={legalRut} />
    </LandingShell>
  );
}
