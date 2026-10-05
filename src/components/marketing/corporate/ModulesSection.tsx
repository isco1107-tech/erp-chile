'use client';

import { useState } from 'react';
import {
  BarChart3, Bot, Boxes, Building2, ClipboardCheck, FileSignature,
  Gauge, Handshake, Landmark, Monitor, ReceiptText, ShoppingCart, UsersRound, WalletCards,
  type LucideIcon,
} from 'lucide-react';
import s from './empresas.module.css';
import { tabKeys } from '../cinematic/tabs';
import { modulesSection } from './content';

/** Ícono por título de módulo, con la misma etiqueta exacta que usa `content.ts`. */
const MODULE_ICONS: Record<string, LucideIcon> = {
  'Ventas y facturación': ReceiptText,
  'Compras y proveedores': ShoppingCart,
  'Inventario y bodegas': Boxes,
  'Punto de venta (POS)': Monitor,
  'CRM comercial': Handshake,
  'Tesorería y cobranzas': WalletCards,
  Contabilidad: Landmark,
  Presupuestos: BarChart3,
  'Activo fijo': Building2,
  'Rendición de gastos': ClipboardCheck,
  'Boletas de honorarios y pagarés': FileSignature,
  Remuneraciones: UsersRound,
  'Centro de Inteligencia 360': Gauge,
  'Agentes ejecutivos': Bot,
};

const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Explorador de módulos: las áreas a la izquierda (pestañas de WAI-ARIA) y
 * los módulos del área elegida a la derecha. Antes eran acordeones apilados
 * que alargaban la página; ahora el alto es el del área más grande. Sin
 * JavaScript las pestañas se ocultan y todas las áreas quedan a la vista,
 * cada una con su nombre (ver empresas.module.css, `scripting`).
 */
export default function ModulesSection() {
  const [active, setActive] = useState(0);
  const groups = modulesSection.groups;
  const total = groups.reduce((sum, group) => sum + group.modules.length, 0);

  return (
    <section className={s.section} id="modulos" aria-labelledby="modulos-title">
      <div className={s.container}>
        <div className={s.splitHeading}>
          <div>
            <p className={s.kicker}>{modulesSection.kicker}</p>
            <h2 id="modulos-title" className={s.h2}>{modulesSection.title}</h2>
          </div>
          <p className={s.sectionHeadingLead}>{modulesSection.lead}</p>
        </div>

        <div className={s.modulesExplorer}>
          <div className={s.modulesTabs} role="tablist" aria-label="Áreas de la empresa" onKeyDown={(event) => tabKeys(event, active, groups.length, setActive)}>
            {groups.map((group, index) => (
              <button
                key={group.name}
                id={`modulos-tab-${slug(group.name)}`}
                type="button"
                role="tab"
                aria-selected={active === index}
                aria-controls={`modulos-panel-${slug(group.name)}`}
                tabIndex={active === index ? 0 : -1}
                onClick={() => setActive(index)}
              >
                <span>{group.name}</span>
                <span className={s.modulesCount}>{group.modules.length}<span className={s.srOnly}> módulos</span></span>
              </button>
            ))}
            <p className={s.modulesTotal}>{total} módulos en total</p>
          </div>

          <div className={s.modulesPanels}>
            {groups.map((group, index) => (
              <div
                key={group.name}
                id={`modulos-panel-${slug(group.name)}`}
                role="tabpanel"
                aria-labelledby={`modulos-tab-${slug(group.name)}`}
                className={s.modulesPanel}
                data-active={active === index || undefined}
              >
                <p className={s.modulesPanelName}>{group.name}</p>
                <ul className={s.moduleGrid}>
                  {group.modules.map((item) => {
                    const Icon = MODULE_ICONS[item.title] ?? ReceiptText;
                    return (
                      <li key={item.title} className={s.moduleCard}>
                        <span className={s.moduleIcon}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <div>
                          <h3>{item.title}</h3>
                          <p>{item.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className={s.modulesNote}>{modulesSection.note}</p>
      </div>
    </section>
  );
}
