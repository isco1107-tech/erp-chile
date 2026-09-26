import { Clapperboard, Gavel, Ticket, UsersRound } from 'lucide-react';
import s from './empresas.module.css';
import { eventsSection } from './content';

const icons = [UsersRound, Clapperboard, Ticket, Gavel];

/** Sección breve a propósito: el comprador que solo busca ERP no debe distraerse. */
export default function EventsSection() {
  return (
    <section className={s.section} id="certamenes">
      <div className={s.container}>
        <div className={s.sectionHeading}>
          <p className={s.kicker}>{eventsSection.kicker}</p>
          <h2 className={s.h2}>{eventsSection.title}</h2>
          <p className={s.sectionHeadingLead}>{eventsSection.lead}</p>
        </div>

        <div className={s.chipGrid}>
          {eventsSection.chips.map((chip, index) => {
            const Icon = icons[index] ?? UsersRound;
            return (
              <article key={chip.title} className={s.chip}>
                <span className={s.chipIcon}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <strong>{chip.title}</strong>
                <p>{chip.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
