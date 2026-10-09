import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Fingerprint, GraduationCap, Layers3, LockKeyhole, Sparkles, Ticket, Workflow } from 'lucide-react';
import type { DesktopRelease } from '../Landing';
import SalesContact from '../SalesContact';
import QuoteCart from '../modules/QuoteCart';
import { faqs } from '../content';
import { getShowcaseCards } from '@/lib/marketing/module-showcase-content';
import { Header, ProductTour, ModuleFinder, Downloads } from './HomeInteractions';
import s from './home.module.css';

const capabilities = [
  { icon: Layers3, number: '01', title: 'Empresas que avanzan.', text: 'De la primera venta al cierre del mes. Conecta inventario, compras, tesorería y contabilidad con el trabajo de tu equipo.', tags: ['Ventas y stock', 'Finanzas', 'CRM'], href: '/empresas', link: 'Aether para empresas', className: s.business },
  { icon: GraduationCap, number: '02', title: 'Academias con espacio para enseñar.', text: 'Inscripciones, calendario de clases, asistencia, mensualidades y material para tus alumnas. También tu propio sitio web.', tags: ['Clases', 'Inscripciones', 'Sitio de academia'], href: '#cotizar', link: 'Conocer Academia', className: s.academy },
  { icon: Ticket, number: '03', title: 'Eventos que se viven. Y se gestionan.', text: 'Certámenes, auspicios, entradas, votación y producción en vivo. Del sitio público a la escaleta, en un mismo lugar.', tags: ['Entradas y QR', 'Jurado', 'Producción en vivo'], href: '/modulos/eventos-y-certamenes', link: 'Explorar eventos', className: s.events },
];

export default function HomeLanding({ releases, salesEmail, legalName, legalRut }: {
  releases: DesktopRelease[]; salesEmail: string; legalName?: string; legalRut?: string;
}) {
  const modules = getShowcaseCards();
  const quotable = modules.flatMap(module => module.quoteId ? [{ id: module.quoteId, title: module.title }] : []);
  return (
    <div className={s.home}>
      <a href="#contenido" className={s.skip}>Saltar al contenido</a>
      <Header />
      <main id="contenido">
        <section className={`${s.hero} ${s.container}`} aria-labelledby="hero-title">
          <div className={s.heroEyebrow}><span className={s.statusDot} /> HECHO EN CHILE. PENSADO PARA LO QUE VIENE.<span className={s.heroEdition}>GESTIÓN · WEB · IA</span></div>
          <div className={s.heroGrid}>
            <h1 id="hero-title">Toda tu operación.<br /><span>Una nueva perspectiva.</span></h1>
            <div className={s.heroCopy}>
              <p>Tu empresa, tu academia o tu próximo gran evento. Conecta la gestión, tu equipo y tu presencia digital con Aether.</p>
              <a href="#cotizar" className={s.primary}>Conversemos de tu negocio <ArrowUpRight size={18} aria-hidden="true" /></a>
              <a href="#plataforma" className={s.quietLink}>Explorar la plataforma <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </div>
          <ProductTour />
          <div className={s.proofStrip}>
            <span><Fingerprint size={17} aria-hidden="true" /> Roles y permisos por equipo</span>
            <span><Layers3 size={17} aria-hidden="true" /> Módulos según tu operación</span>
            <span><Workflow size={17} aria-hidden="true" /> Datos conectados, de punta a punta</span>
          </div>
        </section>

        <section id="soluciones" className={s.solutions} aria-labelledby="solutions-title">
          <div className={s.container}>
            <div className={s.sectionHead}>
              <div><p className={s.eyebrow}>UN SISTEMA. MUCHAS POSIBILIDADES.</p><h2 id="solutions-title">Tu forma de trabajar.<br /><span>Todo para hacerla crecer.</span></h2></div>
              <p>Empieza por lo que necesitas hoy. Conecta nuevas áreas cuando tu negocio esté listo para el siguiente paso.</p>
            </div>
            <div className={s.capabilityGrid}>
              {capabilities.map(({ icon: Icon, ...item }) => <article key={item.number} className={`${s.capability} ${item.className}`}>
                <div className={s.cardTop}><Icon size={26} strokeWidth={1.5} aria-hidden="true" /><span>{item.number} / AETHER</span></div>
                <h3>{item.title}</h3><p>{item.text}</p>
                <div className={s.tags}>{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                <Link href={item.href} className={s.cardLink}>{item.link}<ArrowUpRight size={18} aria-hidden="true" /></Link>
              </article>)}
            </div>
            <article className={s.webCard}>
              <div className={s.webCopy}>
                <p className={s.eyebrow}><Sparkles size={16} aria-hidden="true" /> TU PRESENCIA DIGITAL, CONECTADA</p>
                <h3>Imagina tu web.<br /><span>Hazla tuya con IA.</span></h3>
                <p>Un creador visual para diseñar páginas con tu identidad: secciones, tipografías, colores y movimiento. La IA te ayuda a dar forma a tus ideas; tú revisas y decides qué publicar.</p>
                <ul><li><Check size={16} aria-hidden="true" /> Sitios de empresa, academia y certámenes</li><li><Check size={16} aria-hidden="true" /> Formularios conectados a tu operación</li><li><Check size={16} aria-hidden="true" /> Vista previa antes de publicar</li></ul>
                <Link href="/modulos/sitios-web" className={s.lightButton}>Conocer el creador web <ArrowUpRight size={18} aria-hidden="true" /></Link>
              </div>
              <div className={s.webVisual}>
                <Image src="/marketing/aether-sculpture.png" alt="Escultura de la A de Aether con un anillo orbital dorado" width={1672} height={941} sizes="(max-width: 760px) 100vw, 650px" />
                <div className={s.webVisualCaption}><span><Sparkles size={15} aria-hidden="true" /> DE LA IDEA A TU SITIO</span><span>Diseña. Personaliza. Publica.</span></div>
              </div>
            </article>
          </div>
        </section>

        <section id="modulos" className={`${s.modules} ${s.container}`} aria-labelledby="modules-title">
          <div className={s.sectionHead}>
            <div><p className={s.eyebrow}>CONSTRUYE TU AETHER</p><h2 id="modules-title">Elige las piezas.<br /><span>Conecta las posibilidades.</span></h2></div>
            <p>Explora qué hace cada módulo y arma una selección para cotizar. El alcance y el precio se acuerdan antes de contratar.</p>
          </div>
          <ModuleFinder modules={modules} />
        </section>

        <section id="como-funciona" className={s.flow} aria-labelledby="flow-title">
          <div className={s.container}>
            <div className={s.flowHeading}><p className={s.eyebrow}>DE LA PRIMERA CONVERSACIÓN AL DÍA A DÍA</p><h2 id="flow-title">Un siguiente paso claro.</h2></div>
            <div className={s.steps}>
              {[['01', 'Nos cuentas cómo trabajas.', 'Vemos tus procesos y las áreas que quieres conectar en una demo enfocada en tu operación.'], ['02', 'Definimos tu configuración.', 'Revisas los módulos, el alcance y la cotización. Puedes importar tus datos desde Excel o CSV.'], ['03', 'Tu equipo toma el control.', 'Asigna permisos, centraliza la operación y suma nuevas capacidades a medida que las necesites.']].map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}
            </div>
          </div>
        </section>

        <section id="tributacion" className={`${s.trust} ${s.container}`} aria-labelledby="trust-title">
          <div className={s.trustIntro}><p className={s.eyebrow}>CONTEXTO LOCAL. CONTROL REAL.</p><h2 id="trust-title">Hecho para Chile.<br /><span>Con las cuentas claras.</span></h2><p>RUT, IVA, folios CAF, timbre electrónico y reportes F29. Herramientas pensadas para la operación de una empresa chilena.</p><p className={s.scopeNote}>La firma digital y el envío automático al SII aún no están disponibles. Revisamos contigo el alcance tributario antes de contratar.</p><a href="#preguntas" className={s.quietLink}>Resolver mis dudas <ArrowRight size={16} aria-hidden="true" /></a></div>
          <div className={s.trustCards}>
            <article><LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true" /><div><h3>Cada persona, con su acceso.</h3><p>Información separada por empresa y permisos para definir qué puede hacer cada integrante.</p></div></article>
            <article><Fingerprint size={24} strokeWidth={1.5} aria-hidden="true" /><div><h3>Una operación con trazabilidad.</h3><p>Las acciones relevantes quedan registradas con fecha, autor y detalle para auditoría.</p></div></article>
            <article><Layers3 size={24} strokeWidth={1.5} aria-hidden="true" /><div><h3>Tus datos también son tuyos.</h3><p>Exporta la información de tu empresa en JSON, sin incluir contraseñas ni credenciales.</p></div></article>
          </div>
        </section>

        <section id="planes" className={`${s.planBand} ${s.container}`} aria-labelledby="plans-title"><div><p className={s.eyebrow}>A TU MEDIDA, DESDE EL INICIO</p><h2 id="plans-title">Una propuesta para tu operación.</h2><p>Cotización según módulos, configuración y alcance. Primero conoces la propuesta; después decides.</p></div><a href="#cotizar" className={s.primary}>Solicitar una demo <ArrowUpRight size={18} aria-hidden="true" /></a></section>

        <section id="preguntas" className={`${s.faq} ${s.container}`} aria-labelledby="faq-title"><div><p className={s.eyebrow}>ANTES DE EMPEZAR</p><h2 id="faq-title">Buenas preguntas.<br /><span>Respuestas claras.</span></h2><a href={`mailto:${salesEmail}`} className={s.quietLink}>Habla con nuestro equipo <ArrowUpRight size={16} aria-hidden="true" /></a></div><div className={s.faqList}>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>

        <SalesContact email={salesEmail} className={s.contact} kicker="TU SIGUIENTE PASO EMPIEZA AQUÍ" heading={<>Hagamos espacio<br /><span>para lo que viene.</span></>} lead="Cuéntanos qué quieres conectar. Te mostraremos cómo Aether puede acompañar tu operación, con una demo y una propuesta a tu medida." />
        <Downloads releases={releases} />
      </main>
      <footer className={`${s.footer} ${s.container}`}>
        <div className={s.footerTop}><Link href="/conoce-aether" className={s.brand} aria-label="Aether ERP, inicio"><Image src="/branding/aether-icon.png" alt="" width={29} height={34} /><span>aether<span className={s.brandSuffix}>ERP</span></span></Link><p>La perspectiva cambia.<br />Las posibilidades también.</p><a href="#contenido" className={s.quietLink}>Volver arriba <ArrowUpRight size={16} aria-hidden="true" /></a></div>
        <div className={s.footerLinks}><nav aria-label="Producto"><a href="#soluciones">Soluciones</a><a href="#modulos">Módulos</a><Link href="/empresas">Para empresas</Link><Link href="/login">Ingresar</Link></nav><nav aria-label="Contacto y legal"><a href={`mailto:${salesEmail}`}>{salesEmail}</a><Link href="/aether/privacidad">Privacidad</Link><Link href="/aether/terminos">Términos</Link></nav></div>
        <div className={s.footerLegal}><span>© {new Date().getFullYear()} {legalName ?? 'Aether ERP'}{legalRut ? ` · RUT ${legalRut}` : ''}</span><span>Hecho en Chile. Pensado para avanzar.</span></div>
      </footer>
      <QuoteCart modules={quotable} salesEmail={salesEmail} />
    </div>
  );
}
