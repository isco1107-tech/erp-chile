import { Layers3, ShieldCheck, SquareCheckBig, ToggleRight } from 'lucide-react';
import s from './empresas.module.css';
import { benefits } from './content';

const icons = [Layers3, SquareCheckBig, ToggleRight, ShieldCheck];

/** Cuatro razones en una fila, separadas por líneas: sin cajas que alarguen la página. */
export default function Benefits() {
  return (
    <section className={s.section} aria-labelledby="beneficios-title">
      <div className={s.container}>
        <div className={s.splitHeading}>
          <div>
            <p className={s.kicker}>{benefits.kicker}</p>
            <h2 id="beneficios-title" className={s.h2}>{benefits.title}</h2>
          </div>
          <p className={s.sectionHeadingLead}>{benefits.lead}</p>
        </div>

        <ul className={s.benefitsGrid}>
          {benefits.items.map((item, index) => {
            const Icon = icons[index] ?? Layers3;
            return (
              <li key={item.title} className={s.benefitItem}>
                <div className={s.benefitTop}>
                  <span className={s.benefitIcon}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className={s.benefitIndex} aria-hidden="true">0{index + 1}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
