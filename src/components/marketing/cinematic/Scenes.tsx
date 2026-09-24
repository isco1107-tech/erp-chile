import { existsSync } from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { ArrowRight, ArrowUp, ArrowUpRight, Boxes, Check, ChevronDown, ReceiptText, WalletCards } from 'lucide-react';
import { points } from '../ChileSection';
import { segments } from '../Segments';
import { moduleGroups } from '../catalog';
import { faqs, outcomes, plans } from '../content';
import { formatCurrency } from '@/lib/chile/tax';
import { ViewLink } from './LandingShell';
import s from './v2.module.css';

/*
 * Escenas de /landing-v2 que no necesitan JavaScript: se renderizan en el
 * servidor. Los textos salen de los mismos archivos que usa `/` (o, si esa
 * sección ya no existe allá, de content.ts, copiados de la historia de git).
 */

const outcomeIcons = [ReceiptText, Boxes, WalletCards];

/** Escena 2, después de la pista: «Que tu sistema trabaje contigo». */
export function Outcomes() {
  return (
    <section className={`${s.section} ${s.outcomes}`} aria-labelledby="resultados-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>QUE TU SISTEMA TRABAJE CONTIGO</p>
          <h2 id="resultados-title" className={`${s.heading} ${s.headingMid}`}>
            <span className={s.display}>El control se nota.</span>{' '}
            <span className={`${s.display} ${s.gold}`}>En cada parte de tu día.</span>
          </h2>
        </div>
        <p className={s.body}>Cuando la información deja de estar repartida, tu equipo puede dedicar más atención a vender, planificar y hacer avanzar el negocio.</p>
      </div>
      <div className={s.outcomeGrid}>
        {outcomes.map((item, index) => {
          const Icon = outcomeIcons[index] ?? ReceiptText;
          return (
            <article key={item.label} className={s.outcome} data-reveal data-spot>
              <Icon size={26} strokeWidth={1.4} aria-hidden="true" />
              <p className={s.cardLabel}>{item.label}</p>
              <h3>{item.title[0]}<br />{item.title[1]}</h3>
              <p>{item.text}</p>
              <ViewLink view={item.view} className={s.textLink}>{item.link} <ArrowUpRight size={16} aria-hidden="true" /></ViewLink>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Escena 5, «Hecho para Chile.»: tres de los seis puntos de ChileSection (versión
 * minimalista de la landing), con la nota de lo que aún no hace.
 */
const chilePoints = points.filter(point => ['IVA que siempre cuadra', 'Folios autorizados', 'F29 del período'].includes(point.title));

export function ChileScene() {
  return (
    <section id="tributacion" className={`${s.section} ${s.chile}`} aria-labelledby="tributacion-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>TRIBUTACIÓN CHILENA</p>
          <h2 id="tributacion-title" className={s.heading}>
            <span className={s.display}>Hecho para Chile.</span>{' '}
            <span className={s.subhead}>El SII no es un complemento. Es el centro.</span>
          </h2>
        </div>
        <p className={s.body}>No es un ERP extranjero al que le pegaron el IVA chileno encima. El RUT, los folios, el timbre y el F29 están en el núcleo del sistema, escritos para la norma local.</p>
      </div>
      <ul className={s.chileGrid}>
        {chilePoints.map(point => (
          <li key={point.title} data-reveal data-spot>
            <point.icon size={24} strokeWidth={1.4} aria-hidden="true" />
            <h3>{point.title}</h3>
            <p>{point.text}</p>
          </li>
        ))}
      </ul>
      <p className={s.note}>La firma con certificado digital y el envío automático al SII están en desarrollo. Hoy el documento se emite, se timbra y queda listo con su XML conforme al esquema del SII.</p>
    </section>
  );
}

const gallery = [
  { file: 'constelacion.webp', caption: 'Postulación y acreditación' },
  { file: 'orbita.webp', caption: 'Escaleta minuto a minuto' },
  { file: 'corona.webp', caption: 'Escrutinio y coronación' },
] as const;

/**
 * Si falta una imagen de la galería queda el hueco oscuro, y solo en
 * desarrollo se rotula el archivo pendiente. En producción no se toca el disco.
 */
function isPending(file: string): boolean {
  return process.env.NODE_ENV !== 'production' && !existsSync(path.join(process.cwd(), 'public/marketing/cinematic/gallery', file));
}

/** Escena 6, «Del casting a la corona.»: galería de certámenes. */
export function EventScene() {
  return (
    <section id="para-quien" className={`${s.section} ${s.events}`} aria-labelledby="para-quien-title">
      <div className={s.sectionHead}>
        <div>
          <p className={s.kicker}>{segments[2].label}</p>
          <h2 id="para-quien-title" className={s.heading}><span className={s.display}>Del casting a la corona.</span></h2>
        </div>
      </div>
      <div className={s.gallery}>
        {gallery.map((item, index) => (
          <figure key={item.file} data-reveal>
            <div className={s.galleryFrame}>
              {isPending(item.file) && <span className={s.galleryPending}>Imagen pendiente: public/marketing/cinematic/gallery/{item.file}</span>}
              <Image src={`/marketing/cinematic/gallery/${item.file}`} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" />
            </div>
            <figcaption><span aria-hidden="true">0{index + 1}</span>{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/**
 * Planes: los precios salen solo de content.ts; hoy todos se cotizan. Cada
 * tarjeta muestra lo principal de lo que incluye; el detalle va en la cotización.
 */
const PLAN_HIGHLIGHTS = 4;

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
        <p className={s.body}>Cada plan es un punto de partida: los módulos se activan por separado, así que pagas por las áreas que tu empresa usa de verdad.</p>
      </div>
      <div className={s.planGrid}>
        {plans.map((plan, index) => (
          <article key={plan.name} className={s.plan} data-featured={plan.featured || undefined} data-reveal data-spot data-tilt>
            {plan.featured && <span className={s.planTag}>Recomendado</span>}
            <h3>{plan.name}</h3>
            <p>{plan.audience}</p>
            <div className={s.planPrice}>
              {plan.priceFrom !== null ? (
                <><strong>Desde {formatCurrency(plan.priceFrom)}</strong><span>+ IVA al mes</span></>
              ) : (
                <><strong>Precio según módulos</strong><span>Cotización a medida, sin compromiso</span></>
              )}
            </div>
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
        <p className={s.body}>Lo que necesitas saber sobre Aether ERP.</p>
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
 * Franja de palabras gigantes que corre de lado con el scroll (--view de
 * useLiveMotion), una fila hacia cada lado. Las filas repiten las palabras y
 * se ocultan a los lectores de pantalla; `label` las dice una sola vez.
 */
export function Marquee({ words, label }: { words: readonly string[]; label: string }) {
  const half = Math.ceil(words.length / 2);
  const rows = [words.slice(0, half), words.slice(half)];
  return (
    <div className={s.marquee} data-live>
      <p className={s.srOnly}>{label}: {words.join(', ')}.</p>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={s.marqueeRow} aria-hidden="true">
          {[0, 1, 2, 3].flatMap(() => row).map((word, index) => (
            <Fragment key={index}>
              <span className={(index + rowIndex) % 2 === 0 ? s.marqueeOutline : s.marqueeGold}>{word}</span>
              <i />
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Los nombres de los módulos que existen hoy (los mismos de la escena Módulos). */
export const moduleWords = moduleGroups.flatMap(group => group.modules.map(item => item.title));

/** Escena 9, cierre gigante con vuelta al inicio. */
export function Closing() {
  return (
    <section className={s.closing} aria-labelledby="cierre-title">
      <p className={s.kicker}>TU EMPRESA YA TIENE EL POTENCIAL</p>
      <h2 id="cierre-title" className={s.closingTitle} data-live>
        <span>Dale espacio para crecer.</span>{' '}
        <span className={s.gold}>Dale Aether.</span>
      </h2>
      <div className={s.closingActions}>
        <a className={s.button} href="#cotizar" data-magnetic>Conversemos de tu empresa <ArrowRight size={20} aria-hidden="true" /></a>
        <a className={s.backTop} href="#contenido">Volver al inicio <ArrowUp size={16} aria-hidden="true" /></a>
      </div>
    </section>
  );
}

export function Footer({ salesEmail, legalName, legalRut }: { salesEmail: string; legalName?: string; legalRut?: string }) {
  return (
    <footer className={s.footer}>
      <div className={s.footerGrid}>
        <div className={s.footerBrand}>
          <Link href="/" className={s.brand} aria-label="Aether ERP, inicio">
            <Image src="/branding/aether-icon.png" alt="" width={26} height={30} />
            <span>Aether <span className={s.brandSuffix}>ERP</span></span>
          </Link>
          <p>ERP chileno para cualquier negocio, con producción de certámenes y eventos. Gestión conectada, hecha para avanzar.</p>
        </div>
        <nav className={s.footerCol} aria-label="Producto">
          <h3>Producto</h3>
          <ul>
            <li><a href="#como-funciona">Cómo funciona</a></li>
            <li><a href="#plataforma">La plataforma</a></li>
            <li><a href="#preguntas">Preguntas frecuentes</a></li>
            <li><a href="#tributacion">Tributación chilena</a></li>
            <li><a href="#descargas">Descargas</a></li>
          </ul>
        </nav>
        <nav className={s.footerCol} aria-label="Empresa">
          <h3>Contacto</h3>
          <ul>
            <li><a href="#cotizar">Solicitar una demo</a></li>
            <li><a href={`mailto:${salesEmail}`}>{salesEmail}</a></li>
            <li><Link href="/login">Ingresar al ERP</Link></li>
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
