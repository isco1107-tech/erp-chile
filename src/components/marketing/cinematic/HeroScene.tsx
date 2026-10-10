import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Building2, FileCheck2, LockKeyhole, ReceiptText } from 'lucide-react';
import ProductMock from '../ProductMock';
import s from './hero.module.css';

const facts = [
  ['01', 'Opera.', 'Ventas, compras e inventario, conectados.'],
  ['02', 'Controla.', 'Caja, contabilidad y F29 con datos reales.'],
  ['03', 'Decide.', 'Indicadores de toda tu empresa.'],
] as const;

/**
 * Portada de la landing, sin video: el titular a la izquierda y, a la
 * derecha, el panel principal del ERP (ProductMock, datos de ejemplo) en una
 * ventana con un halo dorado y la órbita del logo girando lento detrás. El
 * único video de la página es el del cierre (CinematicFinale).
 *
 * Componente de servidor: la entrada es una animación CSS (solo transform y
 * opacity) y la órbita se detiene cuando la portada ya no está a la vista
 * (LandingShell quita data-in-track). `data-cinematic-track` es la marca que
 * LandingShell usa para saber si la portada está a la vista (cabecera
 * transparente, sin barra fija).
 */
export default function HeroScene() {
  return (
    <section id="contenido" className={s.hero} aria-labelledby="hero-title" data-cinematic-track>
      <div className={s.backdrop} aria-hidden="true">
        <svg className={s.orbit} viewBox="0 0 800 800">
          <ellipse cx="400" cy="400" rx="380" ry="150" />
          <ellipse cx="400" cy="400" rx="300" ry="300" className={s.orbitFaint} />
          <circle cx="780" cy="400" r="5" className={s.orbitStar} />
        </svg>
      </div>

      <div className={s.inner}>
        <div className={s.copy}>
          <p className={s.badge}><span aria-hidden="true" />ERP chileno · Hecho para el SII</p>
          <h1 id="hero-title" className={s.title}>
            <span>Opera.</span> <span>Controla.</span> <span className={s.gold}>Decide.</span>
          </h1>
          <p className={s.lead}>Ventas, inventario, finanzas, contabilidad y personas en un solo sistema de gestión. Hecho para empresas chilenas.</p>
          <div className={s.actions}>
            <a className={s.primary} href="#modulos" data-magnetic>Quiero conocer Aether <ArrowUpRight size={18} aria-hidden="true" /></a>
            <a className={s.secondary} href="#como-funciona">Ver cómo funciona <ArrowDown size={17} aria-hidden="true" /></a>
          </div>
          <Link className={s.corporate} href="/empresas">
            <Building2 size={16} aria-hidden="true" />
            <span>¿Evalúas Aether para tu empresa? <strong>Ver la versión corporativa</strong></span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <figure className={s.visual}>
          <div className={s.window}>
            <div className={s.windowBar} aria-hidden="true">
              <span /><span /><span />
              <p><LockKeyhole size={11} /> aether · Panel de tu empresa</p>
            </div>
            <div className={s.screen}>
              <ProductMock view="dashboard" />
            </div>
          </div>
          {/* Lo que el sistema hace de verdad (sin cifras inventadas): decorativo, el texto está en el resto de la página. */}
          <p className={`${s.chip} ${s.chipTop}`} aria-hidden="true"><ReceiptText size={16} /> IVA que cuadra al peso</p>
          <p className={`${s.chip} ${s.chipBottom}`} aria-hidden="true"><FileCheck2 size={16} /> F29 con tus documentos reales</p>
          <figcaption className={s.caption}>Vista ilustrativa · datos de ejemplo</figcaption>
        </figure>
      </div>

      {/* La numeración es decorativa: no es una secuencia de pasos. */}
      <ul className={s.facts}>
        {facts.map(([number, title, text]) => (
          <li key={number}><span className={s.factNumber} aria-hidden="true">{number}</span><p><strong>{title}</strong> {text}</p></li>
        ))}
      </ul>
    </section>
  );
}
