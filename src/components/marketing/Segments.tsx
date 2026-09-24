import { ArrowUpRight, Briefcase, Building2, PartyPopper, Store } from 'lucide-react';
import s from './landing.module.css';

export const segments = [
  {
    icon: Store,
    label: 'COMERCIO Y DISTRIBUCIÓN',
    title: 'Vendes productos y mueves bodega.',
    text: 'Necesitas saber qué tienes, dónde está y cuánto te costó realmente cada salida, sin esperar al inventario de fin de mes.',
    tags: ['Inventario multibodega', 'Punto de venta', 'Compras y recepción', 'Kardex con costo PMP'],
  },
  {
    icon: Briefcase,
    label: 'SERVICIOS Y PROFESIONALES',
    title: 'Facturas trabajo, no cajas.',
    text: 'Propuestas, facturas y boletas de honorarios con su retención, más el seguimiento de lo que está por cobrar.',
    tags: ['Presupuestos', 'Boletas de honorarios', 'Planes de pago', 'Cuentas por cobrar'],
  },
  {
    icon: PartyPopper,
    label: 'EVENTOS Y CERTÁMENES',
    title: 'Produces y además rindes cuentas.',
    text: 'Candidatas, jurado, escaleta, auspicios y entradas conviven con la contabilidad del evento en el mismo lugar.',
    tags: ['Proyectos y presupuestos', 'Auspicios', 'Ticketing', 'Jurados y votación'],
  },
  {
    icon: Building2,
    label: 'GRUPOS CON VARIAS EMPRESAS',
    title: 'Más de un RUT, una sola mirada.',
    text: 'Cada empresa con sus usuarios, sus permisos y sus módulos, sin mezclar información entre una y otra.',
    tags: ['Multiempresa', 'Roles a medida', 'Reportes por empresa', 'Respaldo completo'],
  },
];

export default function Segments() {
  return (
    <section id="para-quien" className={`${s.section} ${s.segments}`}>
      <div className={s.container}>
        <div className={s.sectionHeading} data-reveal>
          <div>
            <p className={s.kicker}>RUTAS DE IMPLEMENTACIÓN</p>
            <h2>Cuatro formas de operar.<br />Tu punto de partida.</h2>
          </div>
          <p>Aether no asume que todas las empresas venden igual. Reconoce tu operación en una de estas rutas y activa solo los módulos que necesitas.</p>
        </div>

        <div className={s.segmentGrid}>
          {segments.map((segment, index) => (
            <article key={segment.label} data-reveal style={{ transitionDelay: `${index * 90}ms` }}>
              <span className={s.segmentIcon}><segment.icon size={22} aria-hidden="true" /></span>
              <p className={s.segmentLabel}>{segment.label}</p>
              <h3>{segment.title}</h3>
              <p className={s.segmentText}>{segment.text}</p>
              <ul>{segment.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
            </article>
          ))}
        </div>

        <p className={s.segmentNote} data-reveal>
          ¿Tu empresa es una mezcla de varias, o ninguna calza del todo? Los módulos se activan por separado.
          <a href="#cotizar">Cuéntanos tu operación <ArrowUpRight size={15} aria-hidden="true" /></a>
        </p>
      </div>
    </section>
  );
}
