import type { DesktopRelease } from '../Landing';
import QuoteCart from '../modules/QuoteCart';
import { getShowcaseCards } from '@/lib/marketing/module-showcase-content';
import CinematicFinale from './CinematicFinale';
import Downloads from './Downloads';
import FlowScene from './FlowScene';
import HeroScene from './HeroScene';
import LandingShell from './LandingShell';
import ModulesScene from './ModulesScene';
import ProductScene from './ProductScene';
import { ChileScene, FaqScene, Footer, PlansScene } from './Scenes';
import s from './v2.module.css';

/**
 * Landing (`/`). Componente de servidor: solo el cierre con video, las
 * pestañas de la plataforma, la vitrina y las descargas envían JavaScript al
 * navegador; el resto (la portada incluida) llega como HTML.
 *
 * Recorrido compacto: portada (titular y el panel del ERP) · módulos
 * (recuadros con su página propia y carrito de cotización) · plataforma ·
 * cómo funciona (línea de tiempo) · tributación · planes · preguntas ·
 * descargas · cierre con el único video de la página (v2: la galaxia se arma
 * en el logo) · pie. Se cotiza desde la vitrina (carrito), sin formulario de
 * demo aparte. Los certámenes no tienen escena propia: sus módulos están en
 * la vitrina, cada uno con sus pantallas reales.
 */
export default function CinematicLanding({ releases, salesEmail, legalName, legalRut, className }: {
  releases: DesktopRelease[];
  salesEmail: string;
  legalName?: string;
  legalRut?: string;
  className?: string;
}) {
  const quotable = getShowcaseCards().flatMap((card) => (card.quoteId ? [{ id: card.quoteId, title: card.title }] : []));

  return (
    <LandingShell className={className}>
      <HeroScene />
      <ModulesScene />
      <ProductScene />
      <FlowScene />
      <ChileScene />
      <PlansScene />
      <FaqScene salesEmail={salesEmail} />
      <Downloads releases={releases} />
      <CinematicFinale />
      <Footer salesEmail={salesEmail} legalName={legalName} legalRut={legalRut} />
      {/* Fuera de las secciones: content-visibility no debe contener la barra fija. Siempre a la vista:
          aparece recién cuando la persona marca un módulo, y debe confirmarlo aunque la portada asome arriba. */}
      <QuoteCart modules={quotable} salesEmail={salesEmail} />
    </LandingShell>
  );
}
