'use client';

import { useEffect, useRef, useState } from 'react';
import { moduleGroups } from '../catalog';
import { tabKeys } from './tabs';
import { intelligenceItems } from './trust';
import s from './v2.module.css';

/** Escena 7: las tres familias de módulos y el bloque de agentes con IA. */
export default function ModulesScene() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = root.current;
    node?.setAttribute('data-tabs-ready', '');
    return () => node?.removeAttribute('data-tabs-ready');
  }, []);

  return (
    <section id="modulos" ref={root} className={`${s.section} ${s.modules}`} aria-labelledby="modulos-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>UN LUGAR PARA CADA ÁREA</p>
          <h2 id="modulos-title" className={`${s.heading} ${s.headingMid}`}>
            <span className={s.display}>Empieza con lo que necesitas.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>Crece con lo que viene.</span>
          </h2>
        </div>
        <p className={s.body}>Una estructura modular que acompaña tu operación. Activa las herramientas que tu empresa necesita y mantén la información conectada.</p>
      </div>

      <div className={`${s.tabs} ${s.moduleTabs}`} role="tablist" aria-label="Familias de módulos" onKeyDown={event => tabKeys(event, active, moduleGroups.length, setActive)}>
        {moduleGroups.map((group, index) => (
          <button
            key={group.name}
            id={`module-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`module-panel-${index}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className={s.modulePanels}>
        {moduleGroups.map((group, index) => (
          <div key={group.name} id={`module-panel-${index}`} role="tabpanel" aria-labelledby={`module-tab-${index}`} className={s.modulePanel} data-active={index === active || undefined}>
            <h3 className={s.panelLabel}>{group.name}</h3>
            <div className={s.moduleGrid}>
              {group.modules.map((item, position) => (
                <article key={item.title} className={s.moduleCard} data-spot>
                  <div className={s.moduleTop}><item.icon size={24} strokeWidth={1.4} aria-hidden="true" /><span aria-hidden="true">0{position + 1}</span></div>
                  <h4>{item.title}</h4>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={s.intelligence}>
        <div className={s.intelligenceHead}>
          <p className={s.kicker}>MÁS CONTEXTO. MEJORES DECISIONES.</p>
          <h3 className={`${s.heading} ${s.headingSmall}`}>
            <span className={s.display}>Tu información tiene mucho que decir.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>Dale una voz.</span>
          </h3>
        </div>
        <div className={s.intelligenceGrid}>
          {intelligenceItems.map((item, index) => (
            <article key={item.title} data-reveal>
              <item.icon size={30} strokeWidth={1.3} aria-hidden="true" />
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
