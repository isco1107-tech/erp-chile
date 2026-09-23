import { ArrowUpRight, Check } from 'lucide-react';
import s from './landing.module.css';
import { plans } from './content';

const clp = new Intl.NumberFormat('es-CL');

export default function Plans() {
  return (
    <section id="planes" className={`${s.section} ${s.plans}`}>
      <div className={s.container}>
        <div className={s.sectionHeading} data-reveal>
          <div>
            <p className={s.kicker}>PLANES</p>
            <h2>Parte por lo que necesitas.<br />Suma módulos cuando crezcas.</h2>
          </div>
          <p>Cada plan es un punto de partida: los módulos se activan por separado, así que pagas por las áreas que tu empresa usa de verdad.</p>
        </div>
        <div className={s.planGrid}>
          {plans.map((plan, index) => (
            <article key={plan.name} className={`${s.plan} ${plan.featured ? s.planFeatured : ''}`} data-reveal style={{ transitionDelay: `${index * 90}ms` }}>
              {plan.featured && <span className={s.planTag}>Recomendado</span>}
              <h3>{plan.name}</h3>
              <p>{plan.audience}</p>
              <div className={s.planPrice}>
                {plan.priceFrom !== null ? (
                  <>
                    <strong>Desde ${clp.format(plan.priceFrom)}</strong>
                    <span>+ IVA al mes</span>
                  </>
                ) : (
                  <>
                    <strong>Precio según módulos</strong>
                    <span>Cotización a medida, sin compromiso</span>
                  </>
                )}
              </div>
              <ul>
                {plan.includes.map((item) => (
                  <li key={item}>
                    <Check size={16} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="#cotizar">
                Cotizar {plan.name.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
        <p className={s.planNote} data-reveal>¿Tu empresa combina varias cosas? Arma tu propia mezcla de módulos: la cotización se ajusta a lo que activas.</p>
      </div>
    </section>
  );
}
