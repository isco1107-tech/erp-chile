import {
  BarChart3, Bot, Boxes, Building2, ChevronDown, ClipboardCheck, FileSignature,
  Gauge, Handshake, Landmark, Monitor, ReceiptText, ShoppingCart, UsersRound, WalletCards,
  type LucideIcon,
} from 'lucide-react';
import s from './empresas.module.css';
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

/**
 * Acordeón por grupo con `<details>` nativos: cero JavaScript, accesible por
 * defecto (mismo patrón que la sección de preguntas frecuentes) y sin scroll
 * horizontal en 360px, que era el riesgo de una barra de pestañas angosta.
 */
export default function ModulesSection() {
  return (
    <section className={s.section} id="modulos">
      <div className={s.container}>
        <div className={s.sectionHeading}>
          <p className={s.kicker}>{modulesSection.kicker}</p>
          <h2 className={s.h2}>{modulesSection.title}</h2>
          <p className={s.sectionHeadingLead}>{modulesSection.lead}</p>
        </div>

        {modulesSection.groups.map((group, index) => (
          <details key={group.name} className={s.modulesGroup} open={index === 0}>
            <summary className={s.modulesSummary}>
              {group.name}
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <div className={s.moduleGrid}>
              {group.modules.map((item) => {
                const Icon = MODULE_ICONS[item.title] ?? ReceiptText;
                return (
                  <article key={item.title} className={s.moduleCard}>
                    <span className={s.moduleIcon}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                );
              })}
            </div>
          </details>
        ))}

        <p className={s.modulesNote}>{modulesSection.note}</p>
      </div>
    </section>
  );
}
