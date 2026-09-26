import { ChevronDown } from 'lucide-react';
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

export default function FaqSection() {
  return (
    <section className={s.section} id="preguntas">
      <div className={s.container}>
        <div className={s.sectionHeading}>
          <p className={s.kicker}>{faqSection.kicker}</p>
          <h2 className={s.h2}>{faqSection.title}</h2>
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
