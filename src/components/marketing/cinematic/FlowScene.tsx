'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { Zap } from 'lucide-react';
import { steps } from '../HowItWorks';
import { clamp01 } from './sequence';
import s from './v2.module.css';

/**
 * Donde la escena no cabe fija se muestra apilada. Mismo criterio que
 * v2.module.css. Con movimiento reducido sigue fija: los pasos cambian con el
 * scroll de la persona y el CSS quita los fundidos.
 */
const STILL_QUERY = '(max-height: 620px), (max-width: 960px) and (max-height: 760px)';

/**
 * Escena 4, «Un dato entra una vez.»: la sección queda fija mientras el scroll
 * avanza por los cinco pasos de HowItWorks. Aquí la numeración sí es una
 * secuencia real, por eso va en una lista ordenada.
 */
export default function FlowScene() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = root.current;
    const stageNode = stage.current;
    const lineNode = line.current;
    if (!node || !stageNode || !lineNode || typeof IntersectionObserver === 'undefined') return;
    const links = [...node.querySelectorAll<HTMLAnchorElement>('[data-step-link]')];
    const panels = [...node.querySelectorAll<HTMLElement>('[data-step-panel]')];
    const still = window.matchMedia(STILL_QUERY);
    let frame = 0;
    let visible = false;
    let active = 0;

    const activate = (next: number) => {
      active = next;
      links.forEach((link, index) => {
        link.toggleAttribute('data-active', index === next);
        link.toggleAttribute('data-done', index < next);
        if (index === next) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      });
      panels.forEach((panel, index) => panel.toggleAttribute('data-active', index === next));
    };

    // Se mide en el evento de scroll (con el diseño al día) y se escribe en
    // requestAnimationFrame: medir ahí, después de que otro módulo escribió,
    // obligaría a recalcular el diseño en cada cuadro.
    let measured: number | null = null;
    const measure = () => {
      const travel = Math.max(1, node.offsetHeight - stageNode.offsetHeight);
      measured = clamp01(-node.getBoundingClientRect().top / travel);
    };
    const update = () => {
      frame = 0;
      if (still.matches || !visible || document.hidden) return;
      if (measured === null) measure();
      const progress = measured ?? 0;
      measured = null;
      lineNode.style.setProperty('--flow', progress.toFixed(4));
      const next = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      if (next !== active) activate(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const configure = () => {
      if (still.matches) {
        lineNode.style.removeProperty('--flow');
        links.forEach(link => link.removeAttribute('aria-current'));
      } else {
        activate(active);
        schedule();
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
    });
    observer.observe(node);
    const onScroll = () => {
      if (visible && !still.matches) measure();
      schedule();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    still.addEventListener('change', configure);
    configure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      still.removeEventListener('change', configure);
    };
  }, []);

  /** En la versión fija, cada paso lleva al punto de la pista donde se muestra. */
  function goToStep(event: MouseEvent<HTMLAnchorElement>, index: number) {
    const node = root.current;
    const stageNode = stage.current;
    if (!node || !stageNode || window.matchMedia(STILL_QUERY).matches) return;
    event.preventDefault();
    const travel = node.offsetHeight - stageNode.offsetHeight;
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((index + 0.5) / steps.length) * travel });
  }

  return (
    <>
      <section id="como-funciona" ref={root} className={s.flow} aria-labelledby="como-funciona-title" data-pinned-scene>
        <div ref={stage} className={s.flowStage}>
          <div className={s.flowSide}>
            <p className={s.kicker}>ASÍ TRABAJA AETHER</p>
            <h2 id="como-funciona-title" className={s.heading}>
              <span className={s.display}>Un dato entra una vez.</span>{' '}
              <span className={s.subhead}>Y recorre toda tu empresa.</span>
            </h2>
            <p className={s.body}>Esto es una operación real de punta a punta. Cada paso alimenta al siguiente, sin copiar y pegar entre sistemas.</p>
            <nav className={s.flowNav} aria-label="Pasos de una operación">
              <span className={s.flowRail} aria-hidden="true"><span ref={line} /></span>
              <ol>
                {steps.map((step, index) => (
                  <li key={step.title}>
                    <a href={`#paso-${index + 1}`} data-step-link data-active={index === 0 || undefined} onClick={event => goToStep(event, index)}>
                      <span className={s.flowNumber}>0{index + 1}</span><span className={s.flowTitle}>{step.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div className={s.flowPanels}>
            {steps.map((step, index) => (
              <article key={step.title} id={`paso-${index + 1}`} className={s.flowPanel} data-step-panel data-active={index === 0 || undefined}>
                <span className={s.flowGhost} aria-hidden="true">0{index + 1}</span>
                <step.icon size={34} strokeWidth={1.3} aria-hidden="true" />
                <p className={s.flowTag}>0{index + 1} / {step.tag}</p>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className={s.flowNote} aria-label="Automatizaciones">
        <Zap size={18} aria-hidden="true" />
        <p><strong>¿Y cuando algo se sale de la norma?</strong> Stock bajo el mínimo, folios del SII por agotarse, un pago que no llega: defines la regla una vez y Aether avisa por correo, por notificación interna o hacia el sistema que uses.</p>
      </aside>
    </>
  );
}
