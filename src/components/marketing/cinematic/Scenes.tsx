import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { ArrowUp, ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import { points } from '../ChileSection';
import { moduleGroups } from '../catalog';
import { faqs, plans } from '../content';
import { formatCurrency } from '@/lib/chile/tax';
import s from './v2.module.css';

/*
 * Escenas de la landing que no necesitan JavaScript: se renderizan en el
 * servidor. Los textos salen de los mismos archivos que usa el resto del
 * sitio (ChileSection, catalog.ts, content.ts).
 */

/**
 * «Hecho para Chile.»: tres de los seis puntos de ChileSection, en lista a
 * la derecha del titular, con la nota de lo que aún no hace.
 */
const chilePoints = points.filter(point => ['IVA que siempre cuadra', 'Folios autorizados', 'F29 del período'].includes(point.title));

export function ChileScene() {
  return (
    <section id="tributacion" className={`${s.section} ${s.chile}`} aria-labelledby="tributacion-title">
      <div className={s.chileIntro}>
        <p className={s.kicker}>TRIBUTACIÓN CHILENA</p>
        <h2 id="tributacion-title" className={`${s.heading} ${s.headingMid}`}>
          <span className={s.display}>Hecho para Chile.</span>{' '}
          <span className={s.subhead}>El SII no es un complemento. Es el centro.</span>
        </h2>
        <p className={s.body}>No es un ERP extranjero al que le pegaron el IVA chileno encima. El RUT, los folios, el timbre y el F29 están en el núcleo del sistema, escritos para la norma local.</p>
      </div>
      <div className={s.chileSide}>
        <ul className={s.chileList}>
          {chilePoints.map(point => (
            <li key={point.title} data-reveal data-spot>
              <span className={s.chileIcon}><point.icon size={22} strokeWidth={1.4} aria-hidden="true" /></span>
              <div>
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className={s.note}>La firma con certificado digital y el envío automático al SII están en desarrollo. Hoy el documento se emite, se timbra y queda listo con su XML conforme al esquema del SII.</p>
      </div>
    </section>
  );
}

/**
 * Planes: los precios salen solo de content.ts. Mientras ninguno tenga precio
 * publicado, la condición («se cotiza según módulos») se dice una vez en la
 * cabecera en vez de repetirse en cada tarjeta.
 */
const PLAN_HIGHLIGHTS = 4;
const allQuoted = plans.every(plan => plan.priceFrom === null);

export function PlansScene() {
  return (
    <section id="planes" className={`${s.section} ${s.plans}`} aria-labelledby="planes-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>PLANES</p>
          <h2 id="planes-title" className={`${s.heading} ${s.headingMid}`}>
            <span className={s.display}>Parte por lo que necesitas.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>Suma módulos cuando crezcas.</span>
          </h2>
        </div>
        <p className={s.body}>
          Cada plan es un punto de partida: los módulos se activan por separado, así que pagas por las áreas que tu empresa usa de verdad.
          {allQuoted && <strong className={s.plansTerms}>Precio según módulos · cotización a medida, sin compromiso.</strong>}
        </p>
      </div>
      <div className={s.planGrid}>
        {plans.map(plan => (
          <article key={plan.name} className={s.plan} data-featured={plan.featured || undefined} data-reveal data-spot data-tilt>
            {plan.featured && <span className={s.planTag}>Recomendado</span>}
            <h3>{plan.name}</h3>
            <p>{plan.audience}</p>
            {!allQuoted && (
              <div className={s.planPrice}>
                {plan.priceFrom !== null ? (
                  <><strong>Desde {formatCurrency(plan.priceFrom)}</strong><span>+ IVA al mes</span></>
                ) : (
                  <><strong>Precio según módulos</strong><span>Cotización a medida, sin compromiso</span></>
                )}
              </div>
            )}
            <ul>{plan.includes.slice(0, PLAN_HIGHLIGHTS).map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
            <a className={s.planLink} href="#cotizar">Cotizar {plan.name.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" /></a>
          </article>
        ))}
      </div>
      <p className={s.note}>¿Tu empresa combina varias cosas? Arma tu propia mezcla de módulos: la cotización se ajusta a lo que activas.</p>
    </section>
  );
}

/** Preguntas frecuentes: el mismo arreglo que publica el JSON-LD (FAQPage). */
export function FaqScene() {
  return (
    <section id="preguntas" className={`${s.section} ${s.faq}`} aria-labelledby="preguntas-title">
      <div className={s.faqHead}>
        <p className={s.kicker}>ANTES DE EMPEZAR</p>
        <h2 id="preguntas-title" className={`${s.heading} ${s.headingMid}`}><span className={s.display}>Las cosas claras.</span></h2>
        <p className={s.body}>Lo que necesitas saber sobre Aether ERP. ¿Te queda otra duda? <a className={s.inlineLink} href="#cotizar">Pregúntanos directo.</a></p>
      </div>
      <div className={s.faqList}>
        {faqs.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * Franja de palabras que corre de lado con el scroll (--view de
 * useLiveMotion). Una sola fila: separa el hero del contenido sin alargar la
 * página. Las palabras se repiten y se ocultan a los lectores de pantalla;
 * `label` las dice una sola vez.
 */
export function Marquee({ words, label }: { words: readonly string[]; label: string }) {
  return (
    <div className={s.marquee} data-live>
      <p className={s.srOnly}>{label}: {words.join(', ')}.</p>
      <div className={s.marqueeRow} aria-hidden="true">
        {[0, 1, 2].flatMap(() => words).map((word, index) => (
          <Fragment key={index}>
            <span className={index % 2 === 0 ? s.marqueeOutline : s.marqueeGold}>{word}</span>
            <i />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Los nombres de los módulos que existen hoy (los mismos de la escena Módulos). */
export const moduleWords = moduleGroups.flatMap(group => group.modules.map(item => item.title));

/**
 * Pie con el cierre de la página arriba: la frase final y la vuelta al
 * inicio. El llamado a cotizar ya está justo encima (#cotizar), así que el
 * cierre no lo repite.
 */
export function Footer({ salesEmail, legalName, legalRut }: { salesEmail: string; legalName?: string; legalRut?: string }) {
  return (
    <footer className={s.footer}>
      <div className={s.closing}>
        <p className={s.kicker}>TU EMPRESA YA TIENE EL POTENCIAL</p>
        <h2 id="cierre-title" className={s.closingTitle} data-live>
          <span>Dale espacio para crecer.</span>{' '}
          <span className={s.gold}>Dale Aether.</span>
        </h2>
        <a className={s.backTop} href="#contenido">Volver al inicio <ArrowUp size={16} aria-hidden="true" /></a>
      </div>
      <div className={s.footerGrid}>
        <div className={s.footerBrand}>
          <Link href="/" className={s.brand} aria-label="Aether ERP, inicio">
            <Image src="/branding/aether-icon.png" alt="" width={26} height={30} />
            <span>Aether <span className={s.brandSuffix}>ERP</span></span>
          </Link>
          <p>ERP chileno para gestionar tu empresa de punta a punta. Gestión conectada, hecha para avanzar.</p>
        </div>
        <nav className={s.footerCol} aria-label="Producto">
          <h3>Producto</h3>
          <ul>
            <li><a href="#plataforma">La plataforma</a></li>
            <li><a href="#como-funciona">Cómo funciona</a></li>
            <li><a href="#tributacion">Tributación chilena</a></li>
            <li><a href="#planes">Planes</a></li>
            <li><a href="#descargas">Descargas</a></li>
          </ul>
        </nav>
        <nav className={s.footerCol} aria-label="Contacto">
          <h3>Contacto</h3>
          <ul>
            <li><a href="#cotizar">Solicitar una demo</a></li>
            <li><a href={`mailto:${salesEmail}`}>{salesEmail}</a></li>
            <li><Link href="/login">Ingresar al ERP</Link></li>
            <li><Link href="/empresas">Para empresas</Link></li>
          </ul>
        </nav>
        <nav className={s.footerCol} aria-label="Legal">
          <h3>Legal</h3>
          <ul>
            <li><Link href="/aether/privacidad">Política de privacidad</Link></li>
            <li><Link href="/aether/terminos">Términos de servicio</Link></li>
          </ul>
        </nav>
      </div>
      <div className={s.footerLegal}>
        <span>© {new Date().getFullYear()} {legalName ?? 'Aether ERP'}{legalRut ? ` · RUT ${legalRut}` : ''}</span>
        <span>Hecho en Chile, para empresas chilenas.</span>
      </div>
    </footer>
  );
}
