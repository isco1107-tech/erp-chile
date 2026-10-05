import s from './empresas.module.css';
import { steps } from '../Onboarding';
import { implementation } from './content';

/**
 * Reutiliza los 4 pasos ya redactados y aprobados de `Onboarding.tsx`, en
 * una línea de tiempo horizontal (vertical en móvil).
 */
export default function Implementation() {
  return (
    <section className={s.section} id="implementacion" aria-labelledby="implementacion-title">
      <div className={s.container}>
        <div className={s.splitHeading}>
          <div>
            <p className={s.kicker}>{implementation.kicker}</p>
            <h2 id="implementacion-title" className={s.h2}>{implementation.title}</h2>
          </div>
          <p className={s.sectionHeadingLead}>{implementation.closing}</p>
        </div>

        <ol className={s.stepsRow}>
          {steps.map((step, index) => (
            <li key={step.title} className={s.stepItem}>
              <span className={s.stepIcon}>
                <step.icon size={18} aria-hidden="true" />
              </span>
              <p className={s.stepIndex}>Paso {index + 1}</p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
