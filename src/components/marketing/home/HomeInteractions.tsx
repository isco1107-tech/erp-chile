'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Download, Expand, Globe2, Layers3, Menu, Monitor, Search, SlidersHorizontal, X } from 'lucide-react';
import type { ShowcaseCard } from '@/lib/marketing/module-showcase-content';
import type { DesktopRelease } from '../Landing';
import { useQuoteCart } from '../modules/quote-cart';
import s from './home.module.css';

const nav = [['Soluciones', '#soluciones'], ['Plataforma', '#plataforma'], ['Módulos', '#modulos'], ['Preguntas', '#preguntas']] as const;

export function Header() {
  const menu = useRef<HTMLDialogElement>(null);
  return <header className={s.header}>
    <div className={s.headerInner}>
      <Link href="/conoce-aether" className={s.brand} aria-label="Aether ERP, inicio"><Image src="/branding/aether-icon.png" alt="" width={29} height={34} /><span>aether<span className={s.brandSuffix}>ERP</span></span></Link>
      <nav className={s.desktopNav} aria-label="Navegación principal">{nav.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
      <div className={s.headerActions}><Link href="/login" className={s.login}>Ingresar <ArrowUpRight size={14} aria-hidden="true" /></Link><a href="#cotizar" className={s.headerCta}>Agendar demo <ArrowUpRight size={15} aria-hidden="true" /></a><button type="button" className={s.menuButton} aria-label="Abrir menú" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}><Menu size={22} /></button></div>
    </div>
    <dialog ref={menu} className={s.mobileMenu} aria-labelledby="menu-title">
      <div className={s.menuHeading}><span id="menu-title">Explora Aether</span><button type="button" aria-label="Cerrar menú" onClick={() => menu.current?.close()}><X size={24} /></button></div>
      <nav aria-label="Navegación móvil">{nav.map(([label, href], index) => <a key={href} href={href} onClick={() => menu.current?.close()}><span>0{index + 1}</span>{label}<ArrowUpRight size={20} aria-hidden="true" /></a>)}<a href="#descargas" onClick={() => menu.current?.close()}><span>05</span>Descargas<Download size={20} aria-hidden="true" /></a></nav>
      <a className={s.primary} href="#cotizar" onClick={() => menu.current?.close()}>Agendar una demo <ArrowUpRight size={18} aria-hidden="true" /></a><Link href="/login" className={s.quietLink}>Ingresar a mi cuenta <ArrowRight size={16} aria-hidden="true" /></Link>
    </dialog>
  </header>;
}

const views = [
  { id: 'general', name: 'Visión general', file: 'primeros-pasos', title: 'Tu operación, en perspectiva.', text: 'El punto de partida para ver ventas, gastos y cuentas pendientes.', href: '/empresas' },
  { id: 'ventas', name: 'Ventas', file: 'ventas-facturacion', title: 'De la venta al documento.', text: 'Clientes, documentos y estados para seguir tu gestión comercial.', href: '/modulos/punto-de-venta' },
  { id: 'inventario', name: 'Inventario', file: 'catalogo-inventario', title: 'Cada producto, en su lugar.', text: 'Catálogo, existencias por bodega y movimientos de inventario.', href: '/modulos/inventario-y-catalogo' },
  { id: 'finanzas', name: 'Finanzas', file: 'tesoreria', title: 'La claridad empieza en tus números.', text: 'Saldos, cobros y pagos para planificar el siguiente movimiento.', href: '/modulos/tesoreria-y-cobranzas' },
  { id: 'eventos', name: 'Eventos', file: 'certamenes', title: 'Tu evento empieza mucho antes del show.', text: 'Proyectos, etapas y la gestión que hace posible cada producción.', href: '/modulos/eventos-y-certamenes' },
  { id: 'ia', name: 'Agentes IA', file: 'agentes', title: 'Una nueva manera de trabajar con tus datos.', text: 'Asistentes para consultar información y apoyar tareas de tu operación.', href: '/modulos/agentes-de-ia' },
];

export function ProductTour() {
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = views[active];
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % views.length : event.key === 'ArrowLeft' ? (index - 1 + views.length) % views.length : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setActive(next); tabs.current[next]?.focus();
  }
  return <div id="plataforma" className={s.product}>
    <div className={s.productBar}><span className={s.windowDots} aria-hidden="true"><i /><i /><i /></span><span>AETHER / TU ESPACIO DE TRABAJO</span><span className={s.productLive}><span className={s.statusDot} /> CAPTURAS REALES</span></div>
    <div className={s.productTabs} role="tablist" aria-label="Explorar la plataforma">{views.map((item, index) => <button key={item.id} type="button" role="tab" id={`tour-tab-${item.id}`} aria-selected={active === index} aria-controls="product-panel" tabIndex={active === index ? 0 : -1} ref={element => { tabs.current[index] = element; }} onClick={() => setActive(index)} onKeyDown={event => moveTab(event, index)}>{item.name}</button>)}</div>
    <div id="product-panel" role="tabpanel" aria-labelledby={`tour-tab-${view.id}`} tabIndex={0} className={s.productPanel}>
      <div className={s.productImage}><Image key={view.file} src={`/manual/screenshots/${view.file}.jpg`} alt={`Captura real de Aether: ${view.name}, con datos de una empresa de demostración`} width={1366} height={854} sizes="(max-width: 760px) 100vw, (max-width: 1400px) 90vw, 1240px" preload={active === 0} /><button type="button" className={s.expand} aria-label={`Ampliar captura de ${view.name}`} onClick={() => dialog.current?.showModal()}><Expand size={18} aria-hidden="true" /><span>Ampliar</span></button></div>
      <div className={s.productCaption}><div><h2>{view.title}</h2><p>{view.text}</p></div><Link href={view.href}>Conocer más <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
    </div>
    <p className={s.demoCaption}>Capturas del sistema con datos de demostración. La configuración depende de los módulos contratados.</p>
    <dialog ref={dialog} className={s.imageDialog} aria-label={`Captura ampliada: ${view.name}`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><div className={s.imageDialogTop}><span>{view.name} · Empresa de demostración</span><button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar captura"><X size={22} /></button></div><div className={s.zoomScroll}><Image src={`/manual/screenshots/${view.file}.jpg`} alt={`Vista ampliada de ${view.name}`} width={1366} height={854} sizes="1366px" /></div><p>En pantallas pequeñas, desliza la captura para ver sus detalles.</p></dialog>
  </div>;
}

function normalized(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

export function ModuleFinder({ modules }: { modules: ShowcaseCard[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas las áreas');
  const [expanded, setExpanded] = useState(false);
  const { ids, toggle } = useQuoteCart();
  const categories = ['Todas las áreas', ...new Set(modules.map(module => module.category))];
  const filtered = modules.filter(module => (category === categories[0] || module.category === category) && normalized(`${module.title} ${module.summary}`).includes(normalized(query.trim())));
  const visible = expanded ? filtered : filtered.slice(0, 6);
  return <div className={s.finder}>
    <div className={s.finderControls}><label className={s.search}><Search size={18} aria-hidden="true" /><span className={`sr-only ${s.srOnly}`}>Buscar módulos</span><input value={query} onChange={event => { setQuery(event.target.value); setExpanded(false); }} placeholder="¿Qué quieres conectar?" type="search" /></label><label className={s.category}><SlidersHorizontal size={16} aria-hidden="true" /><span className={`sr-only ${s.srOnly}`}>Filtrar por área</span><select value={category} onChange={event => { setCategory(event.target.value); setExpanded(false); }}>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></label></div>
    <p className={s.resultCount} role="status">{filtered.length === 1 ? '1 módulo disponible' : `${filtered.length} módulos disponibles`}{ids.length > 0 && <span> · {ids.length} en tu selección</span>}</p>
    <div className={s.moduleGrid}>{visible.map(module => <article key={module.slug} className={s.moduleCard}><div className={s.moduleCategory}><Layers3 size={17} aria-hidden="true" /><span>{module.category}</span>{module.quoteId && ids.includes(module.quoteId) && <Check size={17} aria-label="Seleccionado" />}</div><h3><Link href={`/modulos/${module.slug}`}>{module.title}<ArrowUpRight size={17} aria-hidden="true" /></Link></h3><p>{module.summary}</p><div className={s.moduleBottom}><Link href={`/modulos/${module.slug}`}>Ver cómo funciona <ArrowRight size={14} aria-hidden="true" /></Link>{module.quoteId ? <label className={s.quoteChoice}><input type="checkbox" checked={ids.includes(module.quoteId)} onChange={() => { if (module.quoteId) toggle(module.quoteId); }} aria-label={`Agregar ${module.title} a la cotización`} /><span>{ids.includes(module.quoteId) ? 'Agregado' : 'Cotizar'}</span></label> : <span className={s.included}>Incluido en la base</span>}</div></article>)}</div>
    {filtered.length === 0 && <div className={s.empty}><Search size={28} aria-hidden="true" /><h3>No encontramos ese módulo.</h3><p>Prueba con otra palabra o explora todas las áreas.</p><button type="button" className={s.outlineButton} onClick={() => { setQuery(''); setCategory(categories[0]); }}>Restablecer filtros</button></div>}
    {filtered.length > 6 && <button type="button" className={s.showMore} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Mostrar menos módulos' : `Explorar los ${filtered.length} módulos`}<ArrowDown size={16} className={expanded ? s.rotated : ''} aria-hidden="true" /></button>}
    <p className={s.moduleHelp}>No necesitas saber qué módulos elegir. <a href="#cotizar">Te ayudamos a definirlo <ArrowUpRight size={14} aria-hidden="true" /></a></p>
  </div>;
}

function DownloadOption({ platform, label, releases }: { platform: string; label: string; releases: DesktopRelease[] }) {
  const options = releases.filter(release => release.platform === platform);
  const [architecture, setArchitecture] = useState('arm64');
  const release = options.find(option => option.architecture === architecture) ?? options[0];
  return <li><div><h3><Monitor size={18} aria-hidden="true" />{label}</h3>{platform === 'macos' && options.length > 1 ? <label><span className={`sr-only ${s.srOnly}`}>Procesador de macOS</span><select value={architecture} onChange={event => setArchitecture(event.target.value)}><option value="arm64">Apple Silicon</option><option value="x64">Intel</option></select></label> : <p>{platform === 'windows' ? 'Windows 10 / 11 · 64 bits' : platform === 'linux' ? 'Linux · x86_64' : 'macOS'}</p>}<p>{release ? `v${release.version} · ${(release.size / 1024 / 1024).toFixed(1)} MB` : 'En preparación'}</p></div>{release ? <a href={`/downloads/${release.file}`} download aria-label={`Descargar para ${label}`}><Download size={16} aria-hidden="true" />Descargar</a> : <Link href="/login" aria-label={`Abrir versión web (${label} en preparación)`}><Globe2 size={16} aria-hidden="true" />Versión web</Link>}</li>;
}

export function Downloads({ releases }: { releases: DesktopRelease[] }) {
  return <section id="descargas" className={`${s.downloads} ${s.container}`} aria-labelledby="downloads-title"><div><p className={s.eyebrow}>TU ESPACIO DE TRABAJO, CONTIGO</p><h2 id="downloads-title">En tu navegador.<br /><span>O en tu escritorio.</span></h2><p>La misma plataforma, en la ventana que prefieras.</p><Link href="/login" className={s.quietLink}>Abrir Aether web <ArrowUpRight size={16} aria-hidden="true" /></Link></div><div><ul>{[['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']].map(([platform, label]) => <DownloadOption key={platform} platform={platform} label={label} releases={releases} />)}</ul><p className={s.downloadNote}>Instaladores sin firma comercial: tu sistema puede mostrar una advertencia de editor desconocido. {releases.length > 0 && <a href="/downloads/SHA256SUMS.txt" download>Verificar SHA-256</a>}</p></div></section>;
}
