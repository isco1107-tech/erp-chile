import { Layers3, ShieldCheck, SquareCheckBig, ToggleRight } from 'lucide-react';
import s from './empresas.module.css';
import { benefits } from './content';

const icons = [Layers3, SquareCheckBig, ToggleRight, ShieldCheck];

export default function Benefits() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <div className={s.sectionHeading}>
          <p className={s.kicker}>{benefits.kicker}</p>
          <h2 className={s.h2}>{benefits.title}</h2>
          <p className={s.sectionHeadingLead}>{benefits.lead}</p>
        </div>

        <div className={s.benefitsGrid}>
          {benefits.items.map((item, index) => {
            const Icon = icons[index] ?? Layers3;
            return (
              <article key={item.title} className={s.benefitCard}>
                <span className={s.benefitIcon}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
