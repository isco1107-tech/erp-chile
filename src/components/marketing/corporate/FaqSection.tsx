import { ArrowUpRight, ChevronDown } from 'lucide-react';
import s from './empresas.module.css';
import { faqs } from '../content';
import { faqSection } from './content';

/**
 * Subconjunto de `faqs` (compartido con `/`, para que un cambio futuro se
 * propague a ambas landings). Se conserva el orden de `faqSection.questions`.
 */
const selected = faqSection.questions
  .map((question) => faqs.find(([entryQuestion]) => entryQuestion === question))
  .filter((entry): entry is [string, string] => Boolean(entry));

/** Titular a la izquierda y respuestas a la derecha: la lista no empuja la página hacia abajo. */
export default function FaqSection() {
  return (
    <section className={s.section} id="preguntas" aria-labelledby="preguntas-title">
      <div className={`${s.container} ${s.faqLayout}`}>
        <div className={s.faqHead}>
          <p className={s.kicker}>{faqSection.kicker}</p>
          <h2 id="preguntas-title" className={s.h2}>{faqSection.title}</h2>
          <p className={s.sectionHeadingLead}>{faqSection.lead}</p>
          <a className={s.textLink} href="#cotizar">
            {faqSection.more} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>

        <div className={s.faqList}>
          {selected.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
