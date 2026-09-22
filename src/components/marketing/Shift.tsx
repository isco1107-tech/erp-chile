import { ArrowRight, Check, CircleSlash, Sparkles } from 'lucide-react';
import s from './landing.module.css';

/** Cada par es el mismo problema visto sin sistema conectado y con Aether. */
const shifts: [before: string, after: string][] = [
  ['El stock real lo sabe una planilla que alguien actualiza cuando puede.', 'La venta descuenta la bodega correcta en el mismo momento en que se emite.'],
  ['El costo de lo que vendiste es una estimación que nadie quiere revisar.', 'Cada salida toma el promedio ponderado vigente en ese instante y queda en el kardex.'],
  ['Los folios se llevan en un cuaderno y de vez en cuando se salta uno.', 'Los folios salen del rango que autorizó el SII, uno a la vez y sin dejar huecos.'],
  ['El F29 se arma a mano el día 10, revisando carpetas y correos.', 'Débito, crédito, remanente del mes anterior y PPM salen de los documentos del período.'],
  ['La cobranza se acuerda de un cliente cuando el cliente llama.', 'La cuenta por cobrar nace con el documento y el vencimiento aparece antes de vencer.'],
  ['Nadie sabe quién cambió ese precio, ni cuándo, ni con qué autorización.', 'Permisos por persona y registro de auditoría de las acciones que importan.'],
];

export default function Shift() {
  return (
    <section id="cambio" className={`${s.section} ${s.shift}`}>
      <div className={s.container}>
        <div className={s.sectionHeading} data-reveal>
          <div>
            <p className={s.kicker}>LO QUE CAMBIA DESDE EL PRIMER MES</p>
            <h2>Del &laquo;después lo cuadramos&raquo;<br />al dato que ya está cuadrado.</h2>
          </div>
          <p>No es una promesa de eficiencia en abstracto. Son las seis conversaciones que dejas de tener cuando tu operación deja de vivir en planillas separadas.</p>
        </div>

        <div className={s.shiftPanel} data-reveal>
          <div className={s.shiftHead}>
            <span className={s.shiftHeadBefore}><CircleSlash size={14} aria-hidden="true" />Hoy, sin un sistema conectado</span>
            <span aria-hidden="true" />
            <span className={s.shiftHeadAfter}><Sparkles size={14} aria-hidden="true" />Con Aether</span>
          </div>
          <ul className={s.shiftRows}>
            {shifts.map(([before, after], index) => (
              <li key={before} data-reveal style={{ transitionDelay: `${index * 55}ms` }}>
                <div className={s.shiftBefore}><CircleSlash size={15} aria-hidden="true" /><p><span className={s.shiftInline}>Hoy: </span>{before}</p></div>
                <ArrowRight className={s.shiftArrow} size={15} aria-hidden="true" />
                <div className={s.shiftAfter}><Check size={15} aria-hidden="true" /><p><span className={s.shiftInline}>Con Aether: </span>{after}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
