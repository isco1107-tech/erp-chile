import ModulesGrid from '../modules/ModulesGrid';
import { SHOWCASE_CATEGORIES } from '@/lib/marketing/module-showcase';
import { getShowcaseCards } from '@/lib/marketing/module-showcase-content';
import s from './v2.module.css';

/**
 * «Arma tu Aether.»: todos los módulos en recuadros con su captura real. Cada
 * recuadro abre su página (`/modulos/[slug]`) con las pantallas y los pasos;
 * la casilla de la esquina lo suma a la cotización (barra fija, `QuoteCart`).
 */
export default function ModulesScene() {
  const cards = getShowcaseCards();
  const categories = SHOWCASE_CATEGORIES.filter((category) => cards.some((card) => card.category === category));

  return (
    <section id="modulos" className={`${s.section} ${s.modules}`} aria-labelledby="modulos-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>MÓDULOS</p>
          <h2 id="modulos-title" className={`${s.heading} ${s.headingMid}`}>
            <span className={s.display}>Arma tu Aether.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>Módulo a módulo.</span>
          </h2>
        </div>
        <p className={s.body}>
          Toca un módulo para ver cómo funciona, con capturas reales de cada pantalla. Marca la casilla <strong className={s.modulesPlus}>+</strong> de los que te interesen y pide tu cotización.
        </p>
      </div>
      <ModulesGrid cards={cards} categories={[...categories]} />
    </section>
  );
}
