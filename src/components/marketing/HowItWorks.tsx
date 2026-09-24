import { ArrowRight, Boxes, FileText, Landmark, ReceiptText, WalletCards, Zap } from 'lucide-react';
import s from './landing.module.css';

export const steps = [
  {
    icon: FileText,
    tag: 'PRESUPUESTO',
    title: 'Cotizas',
    text: 'Armas la propuesta con precios y condiciones. Si el cliente acepta, se convierte en venta sin volver a digitar nada.',
  },
  {
    icon: ReceiptText,
    tag: 'DOCUMENTO TRIBUTARIO',
    title: 'Vendes',
    text: 'Boleta, factura o guía: toma un folio del rango autorizado por el SII, calcula el IVA línea a línea y queda timbrada.',
  },
  {
    icon: Boxes,
    tag: 'INVENTARIO',
    title: 'Se mueve el stock',
    text: 'La cantidad baja en la bodega correcta y el costo sale del promedio ponderado vigente en ese mismo instante.',
  },
  {
    icon: WalletCards,
    tag: 'TESORERÍA',
    title: 'Cobras',
    text: 'La cuenta por cobrar nace junto con el documento. Registras el pago y el flujo de caja se actualiza.',
  },
  {
    icon: Landmark,
    tag: 'CONTABILIDAD',
    title: 'Cierras el mes',
    text: 'El asiento, el libro de compraventa y el F29 del período se arman con los documentos reales, no con planillas aparte.',
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className={`${s.section} ${s.flow}`}>
      <div className={s.container}>
        <div className={s.flowHeading} data-reveal>
          <p className={s.kicker}>ASÍ TRABAJA AETHER</p>
          <h2>Un dato entra una vez.<br /><span>Y recorre toda tu empresa.</span></h2>
          <p className={s.flowLead}>
            Esto es una operación real de punta a punta. Cada paso alimenta al siguiente, sin copiar y pegar entre sistemas.
          </p>
        </div>

        <ol className={s.flowSteps}>
          {steps.map((step, index) => (
            <li key={step.title} data-reveal style={{ transitionDelay: `${index * 110}ms` }}>
              <div className={s.flowNode}>
                <span className={s.flowIcon}><step.icon size={21} aria-hidden="true" /></span>
                <span className={s.flowIndex}>0{index + 1}</span>
              </div>
              <p className={s.flowTag}>{step.tag}</p>
              <h3>{step.title}</h3>
              <p className={s.flowText}>{step.text}</p>
              {index < steps.length - 1 && <ArrowRight className={s.flowArrow} size={16} aria-hidden="true" />}
            </li>
          ))}
        </ol>

        <div className={s.flowFooter} data-reveal>
          <Zap size={17} aria-hidden="true" />
          <p>
            <strong>¿Y cuando algo se sale de la norma?</strong> Stock bajo el mínimo, folios del SII por agotarse, un pago que no
            llega: defines la regla una vez y Aether avisa por correo, por notificación interna o hacia el sistema que uses.
          </p>
        </div>
      </div>
    </section>
  );
}
