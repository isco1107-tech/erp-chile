import { BadgeCheck, Calculator, FileCheck2, Percent, ScanLine, ShieldCheck } from 'lucide-react';
import s from './landing.module.css';

const points = [
  { icon: BadgeCheck, title: 'RUT validado de verdad', text: 'Módulo 11 sobre cada RUT, con el formato 12.345.678-K que esperan tus documentos.' },
  { icon: Percent, title: 'IVA que siempre cuadra', text: '19% repartido entre las líneas afectas por resto mayor: la suma por línea calza al peso con el total del documento.' },
  { icon: FileCheck2, title: 'Folios autorizados', text: 'Cargas el CAF y el sistema toma folios de ese rango, bloqueando el que está usando para no dejar huecos.' },
  { icon: ScanLine, title: 'Timbre electrónico', text: 'El TED se firma con la llave del propio CAF y queda verificable incluso sin conexión.' },
  { icon: Calculator, title: 'F29 del período', text: 'Débito fiscal, crédito, remanente del mes anterior y PPM sobre las ventas netas del mes.' },
  { icon: ShieldCheck, title: 'Exentos sin sorpresas', text: 'El catálogo manda: un producto exento nunca recibe 19% por un descuido en el formulario.' },
];

export default function ChileSection() {
  return (
    <section className={`${s.section} ${s.chile}`}>
      <div className={`${s.container} ${s.chileGrid}`}>
        <div className={s.chileCopy} data-reveal>
          <p className={s.kicker}>TRIBUTACIÓN CHILENA</p>
          <h2>El SII no es un<br />complemento. <span>Es el centro.</span></h2>
          <p>
            No es un ERP extranjero al que le pegaron el IVA chileno encima. El RUT, los folios, el timbre y el F29 están
            en el núcleo del sistema, escritos para la norma local.
          </p>
          <ul className={s.chileList}>
            {points.map((point, index) => (
              <li key={point.title} data-reveal style={{ transitionDelay: `${index * 70}ms` }}>
                <span className={s.chilePointIcon}><point.icon size={17} aria-hidden="true" /></span>
                <div>
                  <strong>{point.title}</strong>
                  <p>{point.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className={s.chileNote}>
            La firma con certificado digital y el envío automático al SII están en desarrollo. Hoy el documento se emite,
            se timbra y queda listo con su XML conforme al esquema del SII.
          </p>
        </div>

        <div className={s.chileVisual} data-reveal aria-hidden="true">
          <div className={s.dteCard}>
            <div className={s.dteHead}>
              <div>
                <span>FACTURA ELECTRÓNICA</span>
                <strong>N° 000 124</strong>
              </div>
              <span className={s.dteCode}>SII 33</span>
            </div>
            <div className={s.dteRows}>
              <div><span>Cliente</span><span>Comercial del Sur SpA</span></div>
              <div><span>RUT</span><span>76.192.083-9</span></div>
            </div>
            <div className={s.dteLines}>
              <div><span>Neto</span><strong>$1.250.000</strong></div>
              <div><span>IVA 19%</span><strong>$237.500</strong></div>
              <div className={s.dteTotal}><span>Total</span><strong>$1.487.500</strong></div>
            </div>
            <div className={s.dteStamp}>
              <div className={s.dteBars}>{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ height: `${28 + ((index * 37) % 62)}%` }} />)}</div>
              <p>Timbre Electrónico SII · Folio autorizado</p>
            </div>
          </div>
          <span className={`${s.dteBadge} ${s.dteBadgeOne}`}><BadgeCheck size={14} />RUT válido</span>
          <span className={`${s.dteBadge} ${s.dteBadgeTwo}`}><Percent size={14} />IVA cuadrado</span>
        </div>
      </div>
    </section>
  );
}
