import SalesContact from '../SalesContact';
import type { DesktopRelease } from '../Landing';
import CinematicSequence from './CinematicSequence';
import Downloads from './Downloads';
import FlowScene from './FlowScene';
import LandingShell from './LandingShell';
import ModulesScene from './ModulesScene';
import ProductScene from './ProductScene';
import { ChileScene, Closing, EventScene, FaqScene, Footer, Marquee, OnboardingScene, Outcomes, PlansScene, SecurityScene, ShiftScene, moduleWords } from './Scenes';
import s from './v2.module.css';

/** Las frases del titular del hero y de la escena de tributación, en la franja antes de planes. */
const taglineWords = ['Emite.', 'Cuadra.', 'Corona.', 'Hecho para Chile.'] as const;

/**
 * Landing cinematográfica (/landing-v2). Componente de servidor: solo el hero,
 * las pestañas, la escena fija de pasos, el formulario y las descargas envían
 * JavaScript al navegador; el resto llega como HTML.
 *
 * Orden de escenas: 1-2 hero con video (v1 y v2) · resultados · 3 plataforma ·
 * 4 cómo funciona y lo que cambia · 5 tributación · 6 certámenes y segmentos ·
 * 7 módulos e IA · 8 seguridad, planes, puesta en marcha, preguntas,
 * cotización y descargas · 9 cierre y pie.
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
      <Marquee words={moduleWords} />
      <ProductScene />
      <FlowScene />
      <ShiftScene />
      <ChileScene />
      <EventScene />
      <ModulesScene />
      <SecurityScene />
      <Marquee words={taglineWords} />
      <PlansScene />
      <OnboardingScene />
      <FaqScene />
      <div className={s.contact}><SalesContact email={salesEmail} whatsapp={salesWhatsapp} /></div>
      <Downloads releases={releases} />
      <Closing />
      <Footer salesEmail={salesEmail} legalName={legalName} legalRut={legalRut} />
    </LandingShell>
  );
}
