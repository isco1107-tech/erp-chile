import { ArrowUpRight, Clapperboard, Gavel, Ticket, UsersRound } from 'lucide-react';
import Link from 'next/link';
import s from './empresas.module.css';
import { eventsSection } from './content';

const icons = [UsersRound, Clapperboard, Ticket, Gavel];

/**
 * Sección breve a propósito: el comprador que solo busca ERP no debe
 * distraerse. Una sola tarjeta: el texto a la izquierda y las cuatro piezas
 * de la línea de certámenes a la derecha.
 */
export default function EventsSection() {
  return (
    <section className={`${s.section} ${s.eventsSection}`} id="certamenes" aria-labelledby="certamenes-title">
      <div className={s.container}>
        <div className={s.eventsCard}>
          <div className={s.eventsCopy}>
            <p className={s.kicker}>{eventsSection.kicker}</p>
            <h2 id="certamenes-title" className={s.h2}>{eventsSection.title}</h2>
            <p>{eventsSection.lead}</p>
            <Link className={s.textLink} href="/#para-quien">
              Ver las pantallas de certámenes <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <ul className={s.chipGrid}>
            {eventsSection.chips.map((chip, index) => {
              const Icon = icons[index] ?? UsersRound;
              return (
                <li key={chip.title} className={s.chip}>
                  <span className={s.chipIcon}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <strong>{chip.title}</strong>
                  <p>{chip.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
