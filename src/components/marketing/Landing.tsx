'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Bot, Boxes,
  CalendarDays, Check, ChevronDown, CircleCheck, Download, Expand, FileCheck2,
  Globe2, Landmark, Laptop, Layers3, LockKeyhole, Menu, Monitor, ReceiptText,
  ShieldCheck, ShoppingCart, Sparkles, Terminal, Ticket, UsersRound, WalletCards, X,
} from 'lucide-react';
import s from './landing.module.css';
import SalesContact from './SalesContact';
import HeroPreview from './HeroPreview';
import ProductMock, { type ProductMockView } from './ProductMock';
import HowItWorks from './HowItWorks';
import ChileSection from './ChileSection';
import Shift from './Shift';
import Segments from './Segments';
import Security from './Security';
import Onboarding from './Onboarding';
import Plans from './Plans';
import Testimonials from './Testimonials';
import StickyActions from './StickyActions';
import { faqs } from './content';
import { useReveal } from './useReveal';

export type DesktopRelease = {
  platform: string; architecture: string; version: string;
  file: string; size: number; sha256: string;
};

const views = [
  { label: 'Visión general', image: 'dashboard' as ProductMockView, title: 'La perspectiva que tu negocio necesita.', description: 'Reúne ventas, costos, cobranza e inventario en un panel ejecutivo. Identifica lo que requiere atención y decide con tus datos a la vista.', icon: BarChart3, points: ['Indicadores del negocio', 'Alertas de inventario', 'Seguimiento de documentos'] },
  { label: 'Ventas', image: 'sales' as ProductMockView, title: 'Cada venta, de principio a fin.', description: 'Conecta clientes, documentos y pagos. Mantén el historial comercial a mano y da seguimiento a cada operación desde el mismo lugar.', icon: ReceiptText, points: ['Documentos y estados de pago', 'Historial por cliente', 'Control de folios y DTE'] },
  { label: 'Inventario', image: 'inventory' as ProductMockView, title: 'Conoce lo que tienes. Y lo que cuesta.', description: 'Controla existencias, movimientos y valorización por bodega. Anticipa faltantes y trabaja con costos promedio ponderados.', icon: Boxes, points: ['Stock por bodega', 'Kardex de movimientos', 'Valorización PMP'] },
  { label: 'Finanzas', image: 'treasury' as ProductMockView, title: 'Una mirada clara a tu caja.', description: 'Organiza cuentas por cobrar y pagar, revisa vencimientos y proyecta el flujo de caja para planificar el siguiente paso.', icon: WalletCards, points: ['Cobranza y vencimientos', 'Cuentas por pagar', 'Flujo de caja proyectado'] },
  { label: 'Eventos', image: 'projects' as ProductMockView, title: 'De la planificación al gran día.', description: 'Coordina proyectos y producción con el respaldo de tu operación financiera. Lleva presupuestos, auspicios y equipos bajo un mismo contexto.', icon: Ticket, points: ['Proyectos y presupuestos', 'Auspicios y producción', 'Ticketing y acreditaciones'] },
];

const moduleGroups = [
  { name: 'Comercial y operación', modules: [
    { title: 'Ventas y facturación', text: 'Documentos comerciales, DTE, folios y seguimiento de pagos.', icon: ReceiptText },
    { title: 'Compras', text: 'Órdenes, recepción de productos y control por proveedor.', icon: ShoppingCart },
    { title: 'Inventario y bodegas', text: 'Existencias, kardex, costos PMP y alertas de stock.', icon: Boxes },
    { title: 'Clientes y proveedores', text: 'Contactos, historial comercial y límites de crédito.', icon: UsersRound },
    { title: 'Punto de venta', text: 'Una experiencia dedicada a las ventas del día a día.', icon: Monitor },
    { title: 'Presupuestos', text: 'Propuestas y seguimiento antes de concretar cada negocio.', icon: FileCheck2 },
  ] },
  { name: 'Finanzas y control', modules: [
    { title: 'Tesorería', text: 'Cuentas por cobrar y pagar con sus vencimientos a la vista.', icon: WalletCards },
    { title: 'Contabilidad', text: 'Asientos, estados financieros y cierre mensual.', icon: Landmark },
    { title: 'Flujo de caja', text: 'Proyecciones para anticipar compromisos y necesidades de caja.', icon: BarChart3 },
    { title: 'Reportes', text: 'Información financiera y exportaciones a Excel.', icon: FileCheck2 },
    { title: 'Planes de pago', text: 'Cuotas, compromisos y seguimiento de cobranza.', icon: CalendarDays },
    { title: 'Auditoría', text: 'Trazabilidad de acciones y control de acceso por rol.', icon: ShieldCheck },
  ] },
  { name: 'Eventos y producción', modules: [
    { title: 'Proyectos', text: 'Planificación, presupuestos y seguimiento por evento.', icon: Layers3 },
    { title: 'Producción', text: 'Cronograma, vestuario y coordinación operativa.', icon: CalendarDays },
    { title: 'Auspicios', text: 'Marcas, contratos y compromisos de cada auspiciador.', icon: FileCheck2 },
    { title: 'Ticketing', text: 'Gestión de entradas y acceso público a la venta.', icon: Ticket },
    { title: 'Jurados y votaciones', text: 'Evaluaciones y votación con portales dedicados.', icon: UsersRound },
    { title: 'Acreditaciones', text: 'Credenciales y verificación de acceso por QR.', icon: ShieldCheck },
  ] },
];

const tickerItems = [
  'Ventas y facturación', 'Documentos tributarios', 'Inventario PMP', 'Compras', 'Punto de venta',
  'Tesorería', 'Flujo de caja', 'Contabilidad', 'F29', 'Presupuestos', 'Pagarés', 'Honorarios',
  'Proyectos', 'Ticketing', 'Jurados', 'Auspicios', 'Acreditaciones', 'Automatizaciones', 'Agentes IA',
];


function Brand() {
  return <span className={s.brand}><Image src="/branding/aether-icon.png" alt="" width={29} height={34} /><span>Aether<span className={s.brandSuffix}>ERP</span></span></span>;
}

function DownloadOption({ platform, name, detail, icon: Icon, releases, delay }: {
  platform: string; name: string; detail: string; icon: typeof Monitor; releases: DesktopRelease[]; delay: number;
}) {
  const options = releases.filter(release => release.platform === platform);
  const [architecture, setArchitecture] = useState('arm64');
  const release = options.find(option => option.architecture === architecture) ?? options[0];
  return (
    <article className={s.downloadOption} data-reveal style={{ transitionDelay: `${delay}ms` }}>
      <div className={s.downloadTop}><Icon aria-hidden="true" /><span>{release ? 'Disponible' : 'En preparación'}</span></div>
      <h3>{name}</h3><p>{detail}</p>
      <div className={s.downloadMeta}>
        {platform === 'macos' && options.length > 1 ? (
          <label>Procesador<select value={architecture} onChange={event => setArchitecture(event.target.value)}>
            <option value="arm64">Apple Silicon (M1 o posterior)</option><option value="x64">Intel</option>
          </select></label>
        ) : <span>{platform === 'windows' ? 'Windows 10 / 11 · 64 bits' : platform === 'linux' ? 'Linux · x86_64' : 'macOS'}</span>}
        <span>{release ? `v${release.version} · ${(release.size / 1024 / 1024).toFixed(1)} MB` : 'Usa Aether en tu navegador mientras tanto.'}</span>
      </div>
      {release ? <a className={s.downloadButton} href={`/downloads/${release.file}`} download><Download size={17} aria-hidden="true" />Descargar para {name}</a> : <Link className={s.downloadButton} href="/login"><Globe2 size={17} aria-hidden="true" />Abrir versión web</Link>}
      <span className={s.downloadFormat}>{release ? (platform === 'windows' ? 'Instalador .exe' : platform === 'macos' ? 'Imagen .dmg' : 'AppImage') : 'Sin instalación'}</span>
    </article>
  );
}

export default function Landing({ releases, salesEmail = 'aethererp1@gmail.com', salesWhatsapp, legalName, legalRut }: { releases: DesktopRelease[]; salesEmail?: string; salesWhatsapp?: string; legalName?: string; legalRut?: string }) {
  const [activeView, setActiveView] = useState(0);
  const [activeGroup, setActiveGroup] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const page = useRef<HTMLElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const view = views[activeView];

  useReveal(page, s.isVisible);

  // Scroll progress + condensed header, written straight to the DOM so the
  // page never re-renders on scroll.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;
      if (progress.current) progress.current.style.transform = `scaleX(${ratio})`;
      header.current?.classList.toggle(s.headerScrolled, window.scrollY > 24);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Smooth anchor scrolling only while the landing is mounted; the ERP itself
    // keeps the browser default.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousBehavior = document.documentElement.style.scrollBehavior;
    if (!calm) document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      document.documentElement.style.scrollBehavior = previousBehavior;
    };
  }, []);

  function tabKeys(event: React.KeyboardEvent<HTMLDivElement>, index: number, count: number, change: (index: number) => void) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index + count - 1) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault(); change(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  /** Pointer-following highlight on a card, as CSS custom properties. */
  function spotlight(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <main className={s.landing} ref={page}>
      <div className={s.progressTrack} aria-hidden="true"><div className={s.progressBar} ref={progress} /></div>
      <a className={s.skip} href="#contenido">Ir al contenido</a>

      <header className={s.header} ref={header}>
        <div className={s.headerInner}>
          <Link href="/conoce-aether" aria-label="Aether ERP, inicio"><Brand /></Link>
          <nav className={s.desktopNav} aria-label="Navegación principal"><a href="#como-funciona">Cómo funciona</a><a href="#plataforma">La plataforma</a><a href="#para-quien">Para quién</a><a href="#modulos">Soluciones</a><a href="#seguridad">Seguridad</a><a href="#planes">Planes</a><a href="#descargas">Descargas</a></nav>
          <div className={s.headerActions}>
            <Link className={s.login} href="/login">Ingresar <ArrowUpRight size={15} aria-hidden="true" /></Link>
            <a className={s.headerCta} href="#cotizar">Solicitar demo <ArrowUpRight size={15} aria-hidden="true" /></a>
            <button className={s.menuButton} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </div>
        {menuOpen && <nav id="mobile-nav" className={s.mobileNav} aria-label="Navegación móvil" onClick={() => setMenuOpen(false)}><a href="#como-funciona">Cómo funciona</a><a href="#cambio">Lo que cambia</a><a href="#plataforma">La plataforma</a><a href="#tributacion">Tributación chilena</a><a href="#para-quien">Para quién</a><a href="#modulos">Soluciones</a><a href="#seguridad">Seguridad</a><a href="#planes">Planes</a><a href="#descargas">Descargas</a><a href="#cotizar">Cotizar para mi empresa</a><Link href="/login">Ingresar al ERP</Link></nav>}
      </header>

      <section id="contenido" className={s.hero}>
        <div className={s.aurora} aria-hidden="true"><span /><span /><span /></div>
        <svg className={s.constellation} viewBox="0 0 520 420" fill="none" aria-hidden="true">
          <path d="M60 330 L150 190 L262 246 L356 96 L470 168" stroke="currentColor" strokeWidth="1" strokeDasharray="620" strokeDashoffset="620" />
          {[[60, 330], [150, 190], [262, 246], [356, 96], [470, 168]].map(([cx, cy], index) => (
            <circle key={cx} cx={cx} cy={cy} r={index === 3 ? 4.5 : 2.6} style={{ animationDelay: `${1 + index * 0.22}s` }} />
          ))}
        </svg>

        <div className={s.heroGrid}>
          <div className={s.heroContent}>
            <p className={s.eyebrow}><span className={s.statusDot} /> AETHER ERP / HECHO PARA CHILE</p>
            <h1><span className={s.heroLine}>Menos caos.</span><span className={s.heroLine}>Más control.</span><span className={`${s.heroLine} ${s.heroAccent}`}>Mejor negocio.</span></h1>
            <p className={s.heroDescription}>Tu empresa tiene mucho por crecer. Conecta ventas, inventario y finanzas en un solo lugar, y vuelve a enfocarte en lo que viene.</p>
            <div className={s.heroActions}><a href="#cotizar" className={s.primary}>Quiero conocer Aether <ArrowUpRight size={18} aria-hidden="true" /></a><a href="#como-funciona" className={s.heroSecondary}>Ver cómo funciona <ArrowDown size={17} aria-hidden="true" /></a></div>
            <div className={s.heroPlatforms}><Check size={14} aria-hidden="true" /> Modular <span /> Multiempresa <span /> Web y escritorio</div>
          </div>

          <div className={s.heroVisual}>
            <div className={s.orbitLabel}><span className={s.statusDot} /> TU OPERACIÓN, EN PERSPECTIVA</div>
            <div className={s.heroMedia}><div className={s.windowBar}><span /><span /><span /><p><LockKeyhole size={11} /> Aether / Panel de tu empresa</p><Layers3 size={13} /></div><HeroPreview /></div>
            <div className={s.connectedCard}><span className={s.connectedIcon}><Layers3 size={22} /></span><div><strong>Todo conectado. Todo más claro.</strong><p>De la primera venta al último pago.</p></div><CircleCheck size={19} /></div>
            <div className={s.heroFlow}><span><ReceiptText size={15} /> Ventas</span><ArrowRight size={13} /><span><Boxes size={15} /> Stock</span><ArrowRight size={13} /><span><WalletCards size={15} /> Caja</span></div>
            <p className={s.demoCaption}>Vista ilustrativa del panel · datos de ejemplo</p>
          </div>
        </div>

        <div className={s.ticker} aria-hidden="true">
          <div className={s.tickerTrack}>
            {[0, 1].map(copy => (
              <span key={copy}>{tickerItems.map(item => <span key={item} className={s.tickerItem}>{item}<i /></span>)}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.outcomes}`}><div className={s.container}>
        <div className={s.sectionHeading} data-reveal><div><p className={s.kicker}>QUE TU SISTEMA TRABAJE CONTIGO</p><h2>El control se nota.<br />En cada parte de tu día.</h2></div><p>Cuando la información deja de estar repartida, tu equipo puede dedicar más atención a vender, planificar y hacer avanzar el negocio.</p></div>
        <div className={s.outcomeGrid}>
          <article data-reveal onPointerMove={spotlight}><span className={s.outcomeIcon}><ReceiptText size={23} /></span><span className={s.outcomeLabel}>VENDE CON CONTEXTO</span><h3>Una venta.<br />Toda la historia.</h3><p>Revisa el cliente, el documento y sus pagos sin reconstruir la operación entre archivos.</p><a href="#plataforma" onClick={() => setActiveView(1)}>Conoce el área comercial <ArrowUpRight size={16} /></a></article>
          <article data-reveal style={{ transitionDelay: '110ms' }} onPointerMove={spotlight}><span className={s.outcomeIcon}><Boxes size={23} /></span><span className={s.outcomeLabel}>ANTICIPA TU OPERACIÓN</span><h3>El stock correcto.<br />La decisión a tiempo.</h3><p>Consulta existencias, movimientos y costos por bodega para preparar tu próxima compra.</p><a href="#plataforma" onClick={() => setActiveView(2)}>Explora el inventario <ArrowUpRight size={16} /></a></article>
          <article data-reveal style={{ transitionDelay: '220ms' }} onPointerMove={spotlight}><span className={s.outcomeIcon}><WalletCards size={23} /></span><span className={s.outcomeLabel}>MIRA HACIA ADELANTE</span><h3>Conoce tu caja.<br />Planifica lo que viene.</h3><p>Ten a la vista cobros, pagos y vencimientos para decidir con el panorama financiero completo.</p><a href="#plataforma" onClick={() => setActiveView(3)}>Descubre las finanzas <ArrowUpRight size={16} /></a></article>
        </div>
      </div></section>

      <HowItWorks />

      <Shift />

      <section id="plataforma" className={`${s.section} ${s.platform}`}><div className={s.container}>
        <div className={s.sectionHeading} data-reveal><div><p className={s.kicker}>CONOCE TU PRÓXIMO ERP</p><h2>Todo se entiende mejor<br /> cuando está conectado.</h2></div><p>Del primer presupuesto al último pago. Aether reúne las áreas de tu empresa para que puedas ver el panorama completo.</p></div>
        <div className={s.tabs} role="tablist" aria-label="Vistas del ERP" data-reveal onKeyDown={event => tabKeys(event, activeView, views.length, setActiveView)}>{views.map((item, index) => <button id={`view-tab-${index}`} key={item.image} role="tab" aria-selected={activeView === index} aria-controls="product-panel" tabIndex={activeView === index ? 0 : -1} onClick={() => setActiveView(index)}><item.icon size={17} aria-hidden="true" />{item.label}</button>)}</div>
        <div id="product-panel" role="tabpanel" aria-labelledby={`view-tab-${activeView}`} className={s.productPanel}>
          <div className={s.productCopy} key={`copy-${view.image}`}><span className={s.viewNumber}>0{activeView + 1}</span><h3>{view.title}</h3><p>{view.description}</p><ul>{view.points.map(point => <li key={point}><CircleCheck size={16} aria-hidden="true" />{point}</li>)}</ul><a href="#cotizar">Quiero verlo para mi empresa <ArrowUpRight size={17} aria-hidden="true" /></a></div>
          <figure className={s.productImage} key={view.image}><div className={s.productFrame}><ProductMock view={view.image} /></div><button className={s.expandButton} title="Ampliar vista" aria-label={`Ampliar vista de ${view.label}`} onClick={() => dialog.current?.showModal()}><Expand size={18} /></button><figcaption>Vista ilustrativa · datos de ejemplo</figcaption></figure>
        </div>
      </div></section>

      <ChileSection />

      <Segments />

      <Testimonials />

      <section id="modulos" className={`${s.section} ${s.modules}`}><div className={s.container}>
        <div className={s.sectionHeading} data-reveal><div><p className={s.kicker}>UN LUGAR PARA CADA ÁREA</p><h2>Empieza con lo que necesitas.<br /> Crece con lo que viene.</h2></div><p>Una estructura modular que acompaña tu operación. Activa las herramientas que tu empresa necesita y mantén la información conectada.</p></div>
        <div className={`${s.tabs} ${s.moduleTabs}`} role="tablist" aria-label="Familias de módulos" data-reveal onKeyDown={event => tabKeys(event, activeGroup, moduleGroups.length, setActiveGroup)}>{moduleGroups.map((group, index) => <button id={`module-tab-${index}`} key={group.name} role="tab" aria-selected={activeGroup === index} aria-controls="module-panel" tabIndex={activeGroup === index ? 0 : -1} onClick={() => setActiveGroup(index)}>{group.name}</button>)}</div>
        <div id="module-panel" role="tabpanel" aria-labelledby={`module-tab-${activeGroup}`} className={s.moduleGrid} key={activeGroup}>{moduleGroups[activeGroup].modules.map((item, index) => <article key={item.title} className={s.module} style={{ animationDelay: `${index * 55}ms` }} onPointerMove={spotlight}><div className={s.moduleTop}><item.icon size={25} aria-hidden="true" /><span>0{index + 1}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
      </div></section>

      <section className={`${s.section} ${s.intelligence}`}><div className={s.container}>
        <div className={s.intelligenceHeading} data-reveal><p className={s.kicker}><Sparkles size={16} aria-hidden="true" /> MÁS CONTEXTO. MEJORES DECISIONES.</p><h2>Tu información tiene mucho que decir.<br /><span>Dale una voz.</span></h2></div>
        <div className={s.intelligenceGrid}><div data-reveal><Bot size={32} aria-hidden="true" /><h3>Agentes con visión de negocio</h3><p>Asistentes para dirección, finanzas, operaciones y ventas que revisan tus datos y proponen acciones para tu equipo.</p></div><div data-reveal style={{ transitionDelay: '110ms' }}><CalendarDays size={32} aria-hidden="true" /><h3>El seguimiento continúa</h3><p>Automatizaciones, notificaciones y recordatorios para acompañar las tareas recurrentes de tu operación.</p></div><div data-reveal style={{ transitionDelay: '220ms' }}><LockKeyhole size={32} aria-hidden="true" /><h3>El control sigue en tus manos</h3><p>Roles, permisos y auditoría para que cada persona trabaje con el acceso que le corresponde.</p></div></div>
        <div className={s.intelligenceFooter} data-reveal><span><Check size={16} /> Multiempresa</span><span><Check size={16} /> Permisos por rol</span><span><Check size={16} /> Exportación a Excel</span><span><Check size={16} /> Respaldos por empresa</span></div>
      </div></section>

      <Security />

      <Plans />

      <Onboarding />

      <section className={`${s.section} ${s.faq}`}><div className={s.container}><div data-reveal><p className={s.kicker}>ANTES DE EMPEZAR</p><h2>Las cosas claras.</h2><p>Lo que necesitas saber<br /> sobre Aether ERP.</p></div><div className={s.faqList}>{faqs.map(([question, answer], index) => <details key={question} data-reveal style={{ transitionDelay: `${index * 45}ms` }}><summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></div></section>

      <SalesContact email={salesEmail} whatsapp={salesWhatsapp} />

      <section id="descargas" className={`${s.section} ${s.downloads}`}><div className={s.container}>
        <div className={s.downloadHeading} data-reveal><p className={s.kicker}>TU NEGOCIO, A UN CLIC</p><h2>Un lugar en tu escritorio.<br /><span>Toda tu empresa adentro.</span></h2><p>Abre Aether en su propia ventana y entra directo a tu operación.<br /> Elige tu sistema y descarga el cliente de escritorio.</p></div>
        <div className={s.downloadGrid}><DownloadOption platform="windows" name="Windows" detail="Tu operación, siempre a mano." icon={Monitor} releases={releases} delay={0} /><DownloadOption platform="macos" name="macOS" detail="Aether también vive en tu Mac." icon={Laptop} releases={releases} delay={110} /><DownloadOption platform="linux" name="Linux" detail="Tu entorno. La misma plataforma." icon={Terminal} releases={releases} delay={220} /></div>
        <div className={s.downloadNote} data-reveal><p><ShieldCheck size={17} aria-hidden="true" /> Requiere internet y una cuenta activa. Instaladores sin firma comercial.</p>{releases.length > 0 && <a href="/downloads/SHA256SUMS.txt" download>Verificación SHA-256 <ArrowUpRight size={14} aria-hidden="true" /></a>}</div>
        <div className={s.webOption} data-reveal><div><Globe2 size={25} aria-hidden="true" /><p><strong>También puedes entrar desde el navegador.</strong><span>La misma información, sin instalar nada.</span></p></div><Link href="/login">Abrir Aether web <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
      </div></section>


      <section className={s.finalCta}><div className={s.container} data-reveal><p className={s.kicker}>TU EMPRESA YA TIENE EL POTENCIAL</p><h2>Dale espacio para crecer.<br />Dale Aether.</h2><a href="#cotizar">Conversemos de tu empresa <ArrowRight size={22} aria-hidden="true" /></a></div></section>

      <footer className={s.footer}><div className={s.container}>
        <div className={s.footerGrid}>
          <div className={s.footerBrand}><Link href="/" aria-label="Aether ERP, inicio"><Brand /></Link><p>ERP chileno para ventas, inventario, finanzas y producción de eventos. Gestión conectada, hecha para avanzar.</p></div>
          <nav className={s.footerCol} aria-label="Producto"><h3>Producto</h3><ul><li><a href="#como-funciona">Cómo funciona</a></li><li><a href="#plataforma">La plataforma</a></li><li><a href="#modulos">Módulos</a></li><li><a href="#planes">Planes</a></li><li><a href="#descargas">Descargas</a></li></ul></nav>
          <nav className={s.footerCol} aria-label="Empresa"><h3>Contacto</h3><ul><li><a href="#cotizar">Solicitar una demo</a></li><li><a href={`mailto:${salesEmail}`}>{salesEmail}</a></li><li><a href="#seguridad">Seguridad</a></li><li><Link href="/login">Ingresar al ERP</Link></li></ul></nav>
          <nav className={s.footerCol} aria-label="Legal"><h3>Legal</h3><ul><li><Link href="/aether/privacidad">Política de privacidad</Link></li><li><Link href="/aether/terminos">Términos de servicio</Link></li></ul></nav>
        </div>
        <div className={s.footerLegal}><span>© {new Date().getFullYear()} {legalName ?? 'Aether ERP'}{legalRut ? ` · RUT ${legalRut}` : ''}</span><span>Hecho en Chile, para empresas chilenas.</span></div>
      </div></footer>

      <StickyActions />

      <dialog ref={dialog} className={s.lightbox} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-label={`Vista ampliada: ${view.label}`}><div><button className={s.closeLightbox} aria-label="Cerrar vista ampliada" onClick={() => dialog.current?.close()} autoFocus><X /></button><div className={s.lightboxFrame}><ProductMock view={view.image} /></div><p>{view.label} · vista ilustrativa con datos de ejemplo</p></div></dialog>
    </main>
  );
}
