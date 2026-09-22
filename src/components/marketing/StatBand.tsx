import { useRef } from 'react';
import s from './landing.module.css';
import { useCountUp } from './useReveal';

const stats = [
  { value: 35, suffix: '', label: 'módulos', detail: 'Activas solo los que tu empresa necesita.' },
  { value: 7, suffix: '', label: 'documentos tributarios', detail: 'Factura, boleta, exenta, guía, notas de crédito y débito.' },
  { value: 5, suffix: '', label: 'roles base', detail: 'Más los roles a medida que definas por empresa.' },
  { value: 3, suffix: '', label: 'sistemas operativos', detail: 'Windows, macOS y Linux, además del navegador.' },
];

function Stat({ value, suffix, label, detail, delay }: { value: number; suffix: string; label: string; detail: string; delay: number }) {
  const number = useRef<HTMLSpanElement>(null);
  useCountUp(number, value);
  return (
    <li data-reveal style={{ transitionDelay: `${delay}ms` }}>
      <strong><span ref={number}>{value}</span>{suffix}</strong>
      <span className={s.statLabel}>{label}</span>
      <p>{detail}</p>
    </li>
  );
}

export default function StatBand() {
  return (
    <section className={s.statBand} aria-label="Aether ERP en números">
      <ul className={s.container}>
        {stats.map((stat, index) => <Stat key={stat.label} {...stat} delay={index * 90} />)}
      </ul>
    </section>
  );
}
