import s from './empresas.module.css';
import { ctaBand } from './content';

/** Única franja de fondo oscuro de toda la página (brief §3.10). */
export default function CtaBand() {
  return (
    <section className={s.ctaBand}>
      <div className={s.container}>
        <h2>{ctaBand.title}</h2>
        <p>{ctaBand.lead}</p>
        <a className={`${s.btnGold} ${s.btnPrimary}`} href="#cotizar">
          {ctaBand.action}
        </a>
      </div>
    </section>
  );
}
