import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Expand, Lightbulb } from 'lucide-react';
import type { ShowcaseCard, ShowcaseDetail } from '@/lib/marketing/module-showcase-content';
import { displayFont } from '../cinematic/displayFont';
import AddToQuote from './AddToQuote';
import ModuleCard from './ModuleCard';
import QuoteCart, { type QuotableModule } from './QuoteCart';
import m from './modules.module.css';
import p from './module-page.module.css';

/** Cuántas capacidades (temas del manual) se listan en la cabecera. */
const CAPABILITIES = 8;

/**
 * Página pública de un módulo (`/modulos/[slug]`): qué resuelve, qué se puede
 * hacer y cómo funciona pantalla por pantalla, con las capturas reales y los
 * pasos del manual (verificados contra la pantalla). Sin precios: se cotiza
 * desde el carrito.
 */
export default function ModulePage({ detail, related, quotable, salesEmail, legalName }: {
  detail: ShowcaseDetail;
  related: ShowcaseCard[];
  quotable: QuotableModule[];
  salesEmail: string;
  legalName?: string;
}) {
  const { card, screens } = detail;
  const capabilities = screens.flatMap((screen) => screen.topics.map((topic) => topic.title)).slice(0, CAPABILITIES);

  return (
    <div className={`${displayFont.variable} ${m.tokens} ${p.page}`}>
      <a className={p.skip} href="#contenido">Ir al contenido</a>
      <header className={p.header}>
        <Link href="/" className={p.brand} aria-label="Aether ERP, inicio">
          <Image src="/branding/aether-icon.png" alt="" width={24} height={28} />
          <span>Aether <span>ERP</span></span>
        </Link>
        <nav className={p.headerNav} aria-label="Navegación">
          <Link href="/#modulos"><ArrowLeft size={16} aria-hidden="true" />Todos los módulos</Link>
          <Link href="/login" className={p.login}>Ingresar <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </nav>
      </header>

      <main id="contenido">
        <section className={p.hero} aria-labelledby="modulo-titulo">
          <div className={p.heroCopy}>
            <nav aria-label="Ruta de navegación">
              <ol className={p.crumbs}>
                <li><Link href="/#modulos">Módulos</Link></li>
                <li aria-current="page">{card.category}</li>
              </ol>
            </nav>
            <h1 id="modulo-titulo" className={p.title}>{card.title}</h1>
            <p className={p.lead}>{card.summary}</p>
            <div className={p.actions}>
              {card.quoteId ? (
                <AddToQuote id={card.quoteId} />
              ) : (
                <p className={p.includedNote}>
                  <Check size={18} aria-hidden="true" /> Viene incluido con la plataforma base de Aether, sin costo adicional. <Link href="/#modulos">Elige los módulos que quieras sumar.</Link>
                </p>
              )}
            </div>
          </div>
          {capabilities.length > 0 && (
            <div className={p.capabilities}>
              <h2>Qué puedes hacer</h2>
              <ul>
                {capabilities.map((title) => <li key={title}><Check size={16} aria-hidden="true" />{title}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className={p.screens} aria-labelledby="como-funciona">
          <div className={p.screensHead}>
            <p className={p.kicker}>CÓMO FUNCIONA</p>
            <h2 id="como-funciona" className={p.sectionTitle}>Pantalla por pantalla.</h2>
            <p>Capturas reales del sistema con datos de demostración. Abre cada paso para ver cómo se hace.</p>
          </div>
          {screens.map((screen, index) => (
            <article key={screen.id} id={screen.id} className={p.screen} data-shot={screen.screenshot ? '' : undefined}>
              {screen.screenshot && (
                <a className={p.shot} href={screen.screenshot} target="_blank" rel="noopener" aria-label={`Ver la captura de ${screen.title} en tamaño completo`}>
                  <Image
                    src={screen.screenshot}
                    alt={`Captura de la pantalla: ${screen.title}`}
                    width={1366}
                    height={854}
                    sizes="(max-width: 960px) 100vw, 60vw"
                    priority={index === 0}
                  />
                  <span className={p.shotHint}><Expand size={14} aria-hidden="true" />Ampliar</span>
                </a>
              )}
              <div className={p.screenCopy}>
                <p className={p.screenNumber}>Pantalla {String(index + 1).padStart(2, '0')}</p>
                <h3>{screen.title}</h3>
                <p className={p.screenSummary}>{screen.summary}</p>
                <div className={p.topics}>
                  {screen.topics.map((topic) => (
                    <details key={topic.id}>
                      <summary>{topic.title}</summary>
                      <ol>{topic.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
                      {topic.tip && <p className={p.tip}><Lightbulb size={16} aria-hidden="true" />{topic.tip}</p>}
                    </details>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        {related.length > 0 && (
          <section className={p.related} aria-labelledby="relacionados">
            <h2 id="relacionados" className={p.sectionTitle}>Otros módulos de {card.category.toLowerCase()}</h2>
            <ul className={m.grid}>
              {related.map((item) => <li key={item.slug}><ModuleCard card={item} /></li>)}
            </ul>
          </section>
        )}

        <section className={p.closing} aria-labelledby="cierre">
          <h2 id="cierre" className={p.sectionTitle}>¿Te sirve para tu empresa?</h2>
          <p>Suma los módulos que necesites a tu cotización y te la enviamos sin compromiso.</p>
          <div className={p.actions}>
            <Link href="/#modulos" className={m.addButton}><ArrowLeft size={17} aria-hidden="true" />Ver todos los módulos</Link>
            {card.quoteId && <AddToQuote id={card.quoteId} />}
          </div>
        </section>
      </main>

      <footer className={p.footer}>
        <span>© {new Date().getFullYear()} {legalName ?? 'Aether ERP'}</span>
        <nav aria-label="Legal">
          <Link href="/aether/privacidad">Privacidad</Link>
          <Link href="/aether/terminos">Términos</Link>
          <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
        </nav>
      </footer>

      <QuoteCart modules={quotable} salesEmail={salesEmail} />
    </div>
  );
}
