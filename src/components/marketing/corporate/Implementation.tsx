import s from './empresas.module.css';
import { steps } from '../Onboarding';
import { implementation } from './content';

/** Reutiliza los 4 pasos ya redactados y aprobados de `Onboarding.tsx`. */
export default function Implementation() {
  return (
    <section className={s.section} id="implementacion">
      <div className={s.container}>
        <div className={s.sectionHeading}>
          <p className={s.kicker}>{implementation.kicker}</p>
          <h2 className={s.h2}>{implementation.title}</h2>
        </div>

        <ol className={s.stepsRow}>
          {steps.map((step, index) => (
            <li key={step.title} className={s.stepItem}>
              <div className={s.stepTop}>
                <span className={s.stepIcon}>
                  <step.icon size={18} aria-hidden="true" />
                </span>
                <span className={s.stepIndex}>0{index + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>

        <p className={s.implementationClosing}>{implementation.closing}</p>
      </div>
    </section>
  );
}
