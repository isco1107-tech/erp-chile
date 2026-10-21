import { steps } from '../HowItWorks';
import s from './v2.module.css';

/**
 * «Un dato entra una vez.»: los cinco pasos de HowItWorks en una sola línea
 * de tiempo, unidos por un riel que se dibuja al entrar (--in de
 * useLiveMotion). Antes era una escena fija de 320vh; ahora se lee de un
 * vistazo. La numeración es una secuencia real, por eso va en una lista
 * ordenada.
 */
export default function FlowScene() {
  return (
    <section id="como-funciona" className={`${s.section} ${s.flow}`} aria-labelledby="como-funciona-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>ASÍ TRABAJA AETHER</p>
          <h2 id="como-funciona-title" className={`${s.heading} ${s.headingMid}`}>
            <span className={s.display}>Un dato entra una vez.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>Y recorre toda tu empresa.</span>
          </h2>
        </div>
        <p className={s.body}>Una operación real de punta a punta: cada paso alimenta al siguiente, sin copiar y pegar entre sistemas.</p>
      </div>
      <div className={s.flowTrack} data-live>
        <span className={s.flowRail} aria-hidden="true"><span /></span>
        <ol className={s.flowSteps}>
          {steps.map((step, index) => (
            <li key={step.title} id={`paso-${index + 1}`} data-reveal>
              <span className={s.flowNode} aria-hidden="true"><step.icon size={18} strokeWidth={1.6} /></span>
              <p className={s.flowTag}><span className={s.flowNumber}>0{index + 1}</span>{step.tag}</p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
