import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import s from './empresas.module.css';
import ProductMock from '../ProductMock';
import { hero } from './content';

/** Hero estático: sin auroras ni constelaciones animadas (ver brief §3.2). */
export default function Hero() {
  return (
    <section className={s.hero} id="contenido">
      <div className={`${s.container} ${s.heroGrid}`}>
        <div className={s.heroContent}>
          <p className={s.kicker}>{hero.kicker}</p>
          <h1>{hero.title}</h1>
          <p className={s.heroLead}>{hero.lead}</p>
          <div className={s.heroActions}>
            <a className={s.btnPrimary} href="#cotizar">
              Solicitar demo <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <Link className={s.btnSecondary} href="/login">
              Ingresar
            </Link>
          </div>
          <p className={s.heroTrust}>
            <Check size={16} aria-hidden="true" />
            {hero.trustLine}
          </p>
        </div>

        <div className={s.heroVisual}>
          <div className={s.heroFrame}>
            <ProductMock view="dashboard" />
          </div>
          <p className={s.heroCaption}>{hero.mockCaption}</p>
        </div>
      </div>
    </section>
  );
}
