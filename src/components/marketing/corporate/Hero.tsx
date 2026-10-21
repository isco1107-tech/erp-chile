import { ArrowUpRight, Check } from 'lucide-react';
import s from './empresas.module.css';
import ProductMock from '../ProductMock';
import { hero } from './content';

/**
 * Hero estático (sin auroras ni constelaciones): titular con la promesa
 * tributaria destacada, acciones y el panel en un marco de ventana. El fondo
 * es una trama de puntos que se desvanece, pintada una sola vez con CSS.
 */
export default function Hero() {
  return (
    <section className={s.hero} id="contenido">
      <div className={`${s.container} ${s.heroGrid}`}>
        <div className={s.heroContent}>
          <p className={s.kicker}>{hero.kicker}</p>
          <h1>{hero.title[0]}<span className={s.heroHighlight}>{hero.title[1]}</span></h1>
          <p className={s.heroLead}>{hero.lead}</p>
          <div className={s.heroActions}>
            <a className={s.btnPrimary} href="#cotizar">
              Solicitar demo <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <a className={s.btnSecondary} href="#modulos">
              Ver módulos
            </a>
          </div>
          <ul className={s.heroTrust}>
            {hero.trustPoints.map((point) => (
              <li key={point}>
                <Check size={15} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <figure className={s.heroVisual}>
          <div className={s.heroWindow}>
            <div className={s.heroWindowBar} aria-hidden="true">
              <span /><span /><span />
              <p>Aether ERP · Inicio</p>
            </div>
            <div className={s.heroFrame}>
              <ProductMock view="dashboard" />
            </div>
          </div>
          <figcaption className={s.heroCaption}>{hero.mockCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
