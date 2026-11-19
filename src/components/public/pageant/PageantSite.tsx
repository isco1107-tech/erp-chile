'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import {
  audienceHero,
  directorCopy,
  headingSize,
  ribbonLoop,
  initials,
  registrationProcess,
  splitDescription,
  splitPackageBenefits,
  sponsorProcess,
  whatsappGreeting,
  whatsappMessageUrl,
  whatsappPackageMessage,
  type PageantAudience,
  type PageantView,
} from '@/lib/events/pageant-site';
import { safeHref } from '@/lib/web-sites/urls';
import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import { DEFAULT_PAGEANT_OPTIONS, PAGEANT_SECTION_INFO, overrideOr, resolveLayout, sectionSettings, sectionToneClasses, type PageantSectionId } from '@/lib/events/pageant-layout';
import SiteRenderer from '@/components/web-sites/SiteRenderer';
import { SITE_CSS } from '@/components/web-sites/site/site-css';
import type { PublicPageantCandidate, PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { Arrow, Calendar, Check, Chevron, Close, Crown, Diamond, Instagram, Mail, Pin, Plus, Ticket, Tiara, Whatsapp } from './icons';
import { PAGEANT_FONT_CLASSES } from './fonts';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import { PAGEANT_TYPOGRAPHY_CLASS, pageantTypographyCss } from '@/lib/events/pageant-typography';
import { DEFAULT_FOOTER_PARTNERS_TITLE } from '@/lib/events/pageant-partners';
import { FitText } from './FitText';
import { HallOfFame } from './HallOfFame';
import { startReveal } from './reveal';
import { AboutHeading, AboutProse, HeadingText, HeroSky, Kicker, pad } from './parts';
import { SponsorLeadForm } from './SponsorLeadForm';
import { CandidateApplicationForm } from './CandidateApplicationForm';
import { WhatsappFloat } from './WhatsappFloat';
import { PAGEANT_SITE_STYLES } from './styles';

/**
 * Micrositio público de un certamen — la cara del evento hacia el público,
 * las marcas y las postulantes. Lenguaje visual "gala nocturna": el mismo de
 * la página de postulación (Italiana + Karla, noche índigo, champaña y
 * papel marfil), para que sitio e inscripción se sientan una sola marca.
 *
 * Todo lo que recibe ya viene filtrado por `getPublicPageantSite` y todo lo
 * derivado (fechas legibles, recorrido, cifras, preguntas) llega calculado
 * del servidor en `view`: este componente solo presenta. Cada sección
 * aparece únicamente si el certamen tiene ese dato o módulo activo.
 */

function useCountdown(target: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (!target || now === null) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return null;
  const total = Math.floor(diff / 1000);
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/** Animaciones de entrada al hacer scroll (ver `reveal.ts`): solo con JS y sin "reducir movimiento"; sin eso, todo se ve de inmediato. */
function useReveal(rootRef: React.RefObject<HTMLDivElement | null>, enabled = true) {
  useEffect(() => {
    const root = rootRef.current;
    // En el editor visual todo se ve de inmediato: una animación movería los contornos de selección.
    return root && enabled ? startReveal(root) : undefined;
  }, [rootRef, enabled]);
}

/** Marca `.is-offscreen` en las zonas con animaciones continuas cuando salen de la pantalla: el CSS las pausa. */
function useOffscreenPause(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
    });
    root.querySelectorAll('.pgs-hero, .pgs-ribbon').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5] }
    );
    for (const id of key.split('|')) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function Portrait({ candidate, className = '', eager = false }: { candidate: { name: string; photoUrl: string | null }; className?: string; eager?: boolean }) {
  return candidate.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={candidate.photoUrl} alt={candidate.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  ) : (
    <span className={`pgs-monogram ${className}`} role="img" aria-label={candidate.name}>
      <span>{initials(candidate.name)}</span>
    </span>
  );
}

function CandidateDialog({
  candidates,
  index,
  voting,
  onNavigate,
  onClose,
}: {
  candidates: PublicPageantCandidate[];
  index: number;
  voting: PublicPageantSite['voting'];
  onNavigate: (next: number) => void;
  onClose: () => void;
}) {
  const candidate = candidates[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = candidates.length > 1;
  const go = useCallback((delta: number) => onNavigate((index + delta + candidates.length) % candidates.length), [index, candidates.length, onNavigate]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (many && event.key === 'ArrowRight') go(1);
      if (many && event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, many, onClose]);

  const firstName = candidate.name.split(' ')[0];
  return (
    <div className="pgs-dialog-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pgs-dialog" role="dialog" aria-modal="true" aria-labelledby="pgs-dialog-name" key={candidate.id}>
        <button ref={closeRef} type="button" className="pgs-dialog-close" onClick={onClose} aria-label="Cerrar">
          <Close />
        </button>
        <div className="pgs-dialog-photo">
          <Portrait candidate={candidate} eager />
          {candidate.number != null && <span className="pgs-dialog-number">{pad(candidate.number)}</span>}
        </div>
        <div className="pgs-dialog-body">
          <p className="pgs-eyebrow">{candidate.number != null ? `Candidata N° ${candidate.number}` : 'Candidata oficial'}</p>
          <h2 id="pgs-dialog-name" className="pgs-dialog-name">
            {candidate.name}
          </h2>
          {candidate.representing && <p className="pgs-dialog-rep">Representa a {candidate.representing}</p>}
          {(candidate.isWinner || candidate.isFinalist) && (
            <p className={`pgs-badge${candidate.isWinner ? '' : ' is-soft'}`}>
              <Crown className="pgs-badge-icon" />
              {candidate.isWinner ? 'Ganadora' : 'Finalista'}
            </p>
          )}
          <span className="pgs-ornament is-left" aria-hidden="true">
            <span />
            <Diamond />
            <span />
          </span>
          {candidate.bio ? <p className="pgs-dialog-bio">{candidate.bio}</p> : <p className="pgs-dialog-bio is-muted">Muy pronto conocerás más de {firstName}.</p>}
          {voting && (
            <a className="pgs-btn is-gold" href={`${voting.href}?candidata=${encodeURIComponent(candidate.id)}`}>
              <span>Votar por {firstName}</span>
              <span className="pgs-btn-note">{formatCurrency(voting.pricePerVote)} por voto</span>
            </a>
          )}
          {many && (
            <div className="pgs-dialog-nav">
              <button type="button" onClick={() => go(-1)} aria-label="Candidata anterior">
                <Chevron direction="left" />
              </button>
              <span>
                {index + 1} / {candidates.length}
              </span>
              <button type="button" onClick={() => go(1)} aria-label="Candidata siguiente">
                <Chevron />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Solo en el lienzo del editor visual (`/preview/certamen/[id]/editor`): la
 * vista elegida en la barra y las marcas `data-edit-*` con que la capa de
 * edición encuentra cada sección y cada texto editable. El sitio público no
 * lo recibe y su HTML no cambia.
 */
export interface PageantSiteEditing {
  audience?: PageantAudience;
}

type ContentSection = Exclude<PageantSectionId, 'inicio'>;

/** Textos de fábrica de cada sección (una sola fuente con el panel del editor). */
const D = Object.fromEntries(Object.entries(PAGEANT_SECTION_INFO).map(([id, info]) => [id, info.defaults])) as Record<PageantSectionId, (typeof PAGEANT_SECTION_INFO)[PageantSectionId]['defaults']>;

/**
 * Las secciones propias y las del estudio visual se dibujan en el orden del
 * diseño (`resolveLayout`): un diseño anterior al orden libre se ve como
 * siempre. Cada sección propia aparece solo si tiene su dato y no está oculta.
 */
export function PageantSite({ site, view, editing }: { site: PublicPageantSite; view: PageantView; editing?: PageantSiteEditing }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isEditing = Boolean(editing);
  const design = site.creative;
  const options = design?.options ?? DEFAULT_PAGEANT_OPTIONS;
  const galaCountdown = useCountdown(site.results || !options.countdown ? null : site.galaDate);
  const closeCountdown = useCountdown(site.registration?.closesAt ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pickedPackageId, setPickedPackageId] = useState<string | null>(null);

  // Dos caras del sitio, como la convocatoria de referencia: "Quiero ser
  // candidata" y "Ser sponsor". El selector solo aparece si existen las dos.
  // Con el módulo de candidatas contratado la cara "candidata" existe siempre (aunque la convocatoria no esté abierta).
  const hasCandidateSide = site.candidateSide || Boolean(site.registration) || site.candidates.length > 0 || Boolean(site.voting) || Boolean(site.results);
  const hasSponsorSide = site.packages.length > 0 || site.sponsorLeadForm || site.sponsorsByTier.length > 0;
  const showAudienceSwitch = hasCandidateSide && hasSponsorSide;
  const [chosenAudience, setAudience] = useState<PageantAudience>(hasCandidateSide ? 'candidata' : 'sponsor');
  // En el editor manda la vista elegida en su barra.
  const audience = showAudienceSwitch && editing?.audience ? editing.audience : chosenAudience;
  useEffect(() => {
    // `?vista=sponsor` o `#auspicios` abren directo la vista de sponsors (links compartidos).
    const params = new URLSearchParams(window.location.search);
    if (showAudienceSwitch && (params.get('vista') === 'sponsor' || window.location.hash === '#auspicios')) setAudience('sponsor');
  }, [showAudienceSwitch]);
  const switchAudience = (next: PageantAudience) => {
    setAudience(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // Sin selector, la vista es la única cara que existe; un sitio sin ninguna de las dos (solo gala, entradas…) se muestra como siempre.
  const isSponsorView = showAudienceSwitch ? audience === 'sponsor' : hasSponsorSide && !hasCandidateSide;
  const whatsappFloat = site.whatsapp
    ? { href: whatsappMessageUrl(site.whatsapp.href, whatsappGreeting(isSponsorView ? 'sponsor' : 'candidata', site.name)), label: isSponsorView ? 'Escríbenos por WhatsApp para ser sponsor' : 'Escríbenos por WhatsApp para ser candidata' }
    : null;
  useReveal(rootRef, !isEditing);
  useOffscreenPause(rootRef);
  const [openPackages, setOpenPackages] = useState<Set<string>>(() => new Set());
  const togglePackage = (id: string) =>
    setOpenPackages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [directorOpen, setDirectorOpen] = useState(false);
  const packageBenefits = useMemo(() => splitPackageBenefits(site.packages), [site.packages]);
  const pickedPackage = site.packages.find((p) => p.id === pickedPackageId) ?? null;
  const pickPackage = (id: string) => {
    setPickedPackageId(id);
    document.getElementById('formulario-sponsor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { title } = view;
  const shortName = [title.lead, title.main].filter(Boolean).join(' ');
  const hasSponsorSection = site.sponsorsByTier.length > 0 || site.packages.length > 0 || site.sponsorLeadForm;
  const hasGala = Boolean(view.gala || site.venueName || site.tickets);
  const winner = site.results?.find((r) => r.rank === 1) ?? null;
  const court = site.results?.filter((r) => r.rank > 1) ?? [];
  const maxVotes = Math.max(1, ...(site.voteRanking ?? []).map((r) => r.votes));

  // ── Diseño libre: orden, ajustes por sección y bloques del estudio ──────────
  const blocks = design?.blocks;
  const blocksById = useMemo(() => new Map((blocks ?? []).map((block) => [block.id, block])), [blocks]);
  const layout = useMemo(
    () => resolveLayout({ layout: design?.layout, blockIds: (blocks ?? []).map((block) => block.id), placement: design?.placement, enabled: design?.enabled }).items,
    [design?.layout, blocks, design?.placement, design?.enabled]
  );
  const conf = (id: PageantSectionId) => sectionSettings(design?.sections, id);

  // Cuándo existe cada sección propia (sin su dato no se dibuja, esté donde esté en el orden).
  const candidateSide = !isSponsorView;
  const available: Record<ContentSection, boolean> = {
    resultados: candidateSide && Boolean(winner),
    certamen: Boolean(site.description) || view.highlights.length > 0,
    // Salón de la fama: prueba de trayectoria para la candidata (a quién puede llegar a ser) y para la marca (dónde se asocia).
    ganadoras: site.pastWinners.length > 0,
    // Con la convocatoria abierta, "Así es el proceso" de la inscripción reemplaza al recorrido general.
    camino: candidateSide && !site.registration && !site.registrationNotice,
    postula: candidateSide && (Boolean(site.registration) || Boolean(site.registrationNotice)),
    candidatas: site.candidates.length > 0,
    votacion: candidateSide && Boolean(site.voteRanking && site.voteRanking.length > 0),
    gala: hasGala,
    auspicios: hasSponsorSection && (isSponsorView || !showAudienceSwitch),
    director: Boolean(site.director),
    preguntas: candidateSide && view.faq.length > 0,
  };
  const isShown = (id: PageantSectionId) => (id === 'inicio' || available[id]) && !conf(id).hidden;
  const defaultLabel: Record<ContentSection, string> = {
    resultados: 'Resultados',
    certamen: 'El certamen',
    ganadoras: 'Ganadoras',
    camino: 'El camino',
    postula: 'Inscripción',
    candidatas: 'Candidatas',
    votacion: 'Votación',
    gala: 'La gala',
    auspicios: showAudienceSwitch ? 'Paquetes' : 'Auspicios',
    director: directorCopy(site.director?.title ?? null).label,
    preguntas: 'Preguntas',
  };
  const items = layout.filter((item) => (item.kind === 'block' ? blocksById.has(item.id) : isShown(item.id)));
  // Numeración editorial de las secciones visibles (01, 02, …) en el orden en que aparecen.
  const sections = items.flatMap((item) =>
    item.kind === 'section' && item.id !== 'inicio' ? [{ id: item.id, label: conf(item.id).navLabel ?? defaultLabel[item.id] }] : []
  );
  const numberOf = (id: string) => (options.numbers ? pad(sections.findIndex((s) => s.id === id) + 1) : undefined);
  const navItems = sections.filter((s) => !['camino', 'preguntas'].includes(s.id)).slice(0, 6);
  const footer = design?.footer;
  const footerMenu = footer?.showMenu !== false && navItems.length > 0 ? sections : [];
  const footerLinks = footer?.links.flatMap((link) => {
    const href = safeHref(link.href);
    return link.label && href ? [{ ...link, href }] : [];
  }) ?? [];
  const showFooterContact = footer?.showContact !== false;
  const footerInstagram = showFooterContact ? site.instagramHandles : [];
  const active = useScrollSpy(sections.map((s) => s.id));
  const heroShown = items.some((item) => item.kind === 'section' && item.id === 'inicio');
  const startsWithHero = items[0]?.kind === 'section' && items[0].id === 'inicio';

  /** Clases de una sección propia: su fondo y espaciado elegidos (o los de fábrica). */
  const sectionClass = (id: PageantSectionId, extra = '') => {
    const c = conf(id);
    return ['pgs-section', sectionToneClasses(c.tone, c.spacing), extra].filter(Boolean).join(' ');
  };
  const editKey = (id: PageantSectionId) => (isEditing ? { 'data-edit-key': `section:${id}` } : {});
  /** Título de dos partes: el propio de cada parte o el de fábrica. */
  const headingOf = (id: PageantSectionId, lead: string, accent: string) => {
    const c = conf(id);
    return { lead: overrideOr(c.title, lead), accent: overrideOr(c.titleAccent, accent) };
  };
  const heading = (id: PageantSectionId, lead: string, accent: string) => {
    const parts = headingOf(id, lead, accent);
    return <HeadingText lead={parts.lead} accent={parts.accent} editable={isEditing} />;
  };
  const hasHeading = (id: PageantSectionId, lead: string, accent: string) => {
    const parts = headingOf(id, lead, accent);
    return Boolean(parts.lead || parts.accent);
  };
  const sectionKicker = (id: PageantSectionId, text: string, tone?: 'night' | 'paper') => {
    const shown = overrideOr(conf(id).kicker, text);
    const index = numberOf(id);
    if (!shown && !index) return null;
    return (
      <Kicker index={index} tone={tone} editable={isEditing}>
        {shown}
      </Kicker>
    );
  };

  const primaryCta = showAudienceSwitch
    ? null
    : site.registration
    ? { href: '#postula', label: 'Inscríbete' }
    : site.tickets
      ? { href: site.tickets.href, label: 'Entradas' }
      : site.voting
        ? { href: site.voting.href, label: 'Votar' }
        : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const ribbon = [
    title.edition ? `Temporada ${title.edition}` : null,
    site.registration ? 'Postulaciones abiertas' : null,
    site.candidates.length > 0 ? `${site.candidates.length} candidatas oficiales` : null,
    view.gala ? `Gala · ${view.gala.short}` : null,
    site.venueName,
    site.voting ? 'Votación del público abierta' : null,
    site.tickets ? 'Entradas a la venta' : null,
  ].filter((item): item is string => Boolean(item));

  const ribbonMotion = ribbonLoop(ribbon);

  const hero = audienceHero(isSponsorView ? 'sponsor' : 'candidata', {
    name: site.name,
    edition: title.edition,
    tagline: isSponsorView ? null : site.tagline,
    maxCandidates: site.registration?.maxCandidates ?? null,
    registrationClosesLabel: view.registrationClosesLabel,
    registrationOpen: Boolean(site.registration),
    packagePrices: site.packages.map((p) => p.price),
    formatMoney: formatCurrency,
  });
  const heroConf = conf('inicio');
  const heroKicker = overrideOr(heroConf.kicker, hero.kicker);
  const heroCall = overrideOr(heroConf.title, hero.heading);
  // La frase principal se edita en el lugar solo cuando lo que se ve ES la frase guardada (en la vista de sponsors es otro texto).
  const taglineEditable = isEditing && !isSponsorView && Boolean(site.tagline);

  const aboutParagraphs = useMemo(() => splitDescription(site.description), [site.description]);
  const typographyCss = useMemo(() => pageantTypographyCss(site.typography), [site.typography]);

  // --pgs-lead-fit: "MISS UNIVERSO" crece hasta llenar el ancho sin desbordar en teléfonos.
  const titleFit = { '--pgs-fit': Math.max(title.main.length, 6) * 0.64, '--pgs-lead-fit': Math.max(title.lead.length, 8) * 0.9 } as CSSProperties;
  const studioBase = site.customDomain ? '' : `/certamen/${site.slug}`;
  const hasStudio = items.some((item) => item.kind === 'block');

  // ── Secciones propias ────────────────────────────────────────────────────────
  const renderers: Record<PageantSectionId, () => ReactNode> = {
    inicio: () => (
      <>
        <section id="inicio" className={`pgs-hero${site.coverImageUrl ? ' has-cover' : ''}`} aria-labelledby="pgs-title" {...editKey('inicio')}>
          {site.coverImageUrl && (
            <div className="pgs-hero-cover" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={site.coverImageUrl} alt="" fetchPriority="high" />
            </div>
          )}
          <HeroSky />

          <div className="pgs-hero-inner">
            <Tiara className="pgs-tiara" />
            {heroKicker && (
              <p className="pgs-hero-eyebrow pgs-rise" style={{ animationDelay: '0.2s' }}>
                {isEditing ? <span data-edit-field="kicker">{heroKicker}</span> : heroKicker}
              </p>
            )}
            <h1 id="pgs-title" className="pgs-title" style={titleFit}>
              {title.lead && (
                <span className="pgs-title-lead pgs-rise" style={{ animationDelay: '0.3s' }}>
                  <span className="pgs-title-rule" aria-hidden="true" />
                  {title.lead}
                  <span className="pgs-title-rule" aria-hidden="true" />
                </span>
              )}
              <FitText className="pgs-title-main pgs-foil pgs-rise" style={{ animationDelay: '0.42s' }}>
                {title.main}
              </FitText>
              {title.edition && (
                <span className="pgs-title-edition pgs-rise" style={{ animationDelay: '0.56s' }}>
                  {title.edition}
                </span>
              )}
            </h1>
            {heroCall && (
              <p className="pgs-hero-call pgs-rise" style={{ animationDelay: '0.62s' }}>
                {isEditing ? <span data-edit-field="title">{heroCall}</span> : heroCall}
              </p>
            )}
            <p className="pgs-tagline pgs-rise" style={{ animationDelay: '0.7s' }}>
              {taglineEditable ? <span data-edit-field="tagline">{hero.lead}</span> : hero.lead}
            </p>
            {options.pills && hero.pills.length > 0 && (
              <ul className="pgs-pills pgs-rise" style={{ animationDelay: '0.74s' }} aria-label="Datos clave">
                {hero.pills.map((pill) => (
                  <li key={pill}>
                    <Diamond className="pgs-pill-mark" />
                    {pill}
                  </li>
                ))}
              </ul>
            )}
            {(view.gala || site.venueName) && (
              <p className="pgs-hero-meta pgs-rise" style={{ animationDelay: '0.76s' }}>
                {view.gala && (
                  <span>
                    <Calendar className="pgs-inline-icon" />
                    <span>{view.gala.long}</span>
                  </span>
                )}
                {site.venueName && (
                  <span>
                    <Pin className="pgs-inline-icon" />
                    {site.venueName}
                  </span>
                )}
              </p>
            )}

            {options.countdown && (
              <div className="pgs-countdown pgs-rise" style={{ animationDelay: '0.86s' }} role="timer" aria-label="Cuenta regresiva a la gala" aria-hidden={galaCountdown ? undefined : true}>
                {galaCountdown &&
                  (
                    [
                      ['Días', 'Días', galaCountdown.days],
                      ['Horas', 'Hrs', galaCountdown.hours],
                      ['Minutos', 'Min', galaCountdown.minutes],
                      ['Segundos', 'Seg', galaCountdown.seconds],
                    ] as const
                  ).map(([label, short, value]) => (
                    <div key={label} className="pgs-count">
                      <span className="pgs-count-value">{pad(value)}</span>
                      <span className="pgs-count-label">
                        <span className="pgs-lg">{label}</span>
                        <span className="pgs-sm">{short}</span>
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <div className="pgs-hero-ctas pgs-rise" style={{ animationDelay: '0.96s' }}>
              {isSponsorView ? (
                <>
                  {site.sponsorLeadForm ? (
                    <a className="pgs-btn is-gold" href="#formulario-sponsor">
                      <span>Quiero ser sponsor</span>
                      <Arrow className="pgs-btn-icon" />
                    </a>
                  ) : (
                    whatsappFloat && (
                      <a className="pgs-btn is-gold" href={whatsappFloat.href} target="_blank" rel="noopener noreferrer">
                        <span>Quiero ser sponsor</span>
                        <Arrow className="pgs-btn-icon" />
                      </a>
                    )
                  )}
                  {site.packages.length > 0 && (
                    <a className="pgs-btn is-ghost" href="#paquetes">
                      <span>
                        Ver {site.packages.length === 1 ? 'el paquete' : `los ${site.packages.length} paquetes`}
                      </span>
                    </a>
                  )}
                </>
              ) : (
                (site.registration || site.registrationNotice) && (
                  <a className={`pgs-btn ${site.registration ? 'is-gold' : 'is-ghost'}`} href="#postula">
                    <span>{site.registration ? 'Quiero inscribirme' : site.registrationNotice?.state === 'closed' ? 'Postulaciones cerradas' : 'Postulaciones próximamente'}</span>
                    <Arrow className="pgs-btn-icon" />
                  </a>
                )
              )}
              {!isSponsorView && site.tickets && (
                <a className={`pgs-btn ${site.registration ? 'is-ghost' : 'is-gold'}`} href={site.tickets.href}>
                  <Ticket className="pgs-btn-icon is-lead" />
                  <span>
                    Entradas
                    {site.tickets.fromPrice != null && <span className="pgs-lg"> · desde {formatCurrency(site.tickets.fromPrice)}</span>}
                  </span>
                </a>
              )}
              {!isSponsorView && site.voting && (
                <a className="pgs-btn is-ghost" href={site.voting.href}>
                  <span className="pgs-lg">Vota por tu favorita</span>
                  <span className="pgs-sm">Votar</span>
                </a>
              )}
            </div>
            {site.director && isShown('director') && (
              <a className="pgs-link pgs-hero-link pgs-rise" style={{ animationDelay: '1s' }} href="#director">
                {directorCopy(site.director.title).invite}
                <Arrow className="pgs-btn-icon" />
              </a>
            )}
          </div>
          <a className="pgs-scroll-cue" href="#pgs-tras-portada" aria-label="Bajar al contenido">
            <span />
          </a>
        </section>

        {/* ── Cinta ──────────────────────────────────────────────────────── */}
        {options.ribbon && ribbon.length > 0 && (
          <div className="pgs-ribbon" aria-hidden="true" {...editKey('inicio')}>
            <div className="pgs-ribbon-track" style={{ '--pgs-ribbon-time': `${ribbonMotion.seconds}s` } as CSSProperties}>
              {[0, 1].map((copy) => (
                <span key={copy} className="pgs-ribbon-group">
                  {ribbonMotion.group.map((item, i) => (
                    <span key={`${item}-${i}`} className="pgs-ribbon-item">
                      <Diamond className="pgs-ribbon-diamond" />
                      {item}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Destino de «Bajar al contenido» y del salto de teclado cuando el sitio empieza con la portada. */}
        <div id="pgs-tras-portada" tabIndex={-1} />
      </>
    ),

    resultados: () =>
      winner && (
        <section id="resultados" className={sectionClass('resultados', 'pgs-results')} aria-labelledby="pgs-results-title" {...editKey('resultados')}>
          <div className="pgs-wrap">
            {sectionKicker('resultados', D.resultados.kicker!)}
            <div className="pgs-winner" data-reveal>
              <div className="pgs-winner-photo">
                <Portrait candidate={winner} eager />
                <Crown className="pgs-winner-crown" />
              </div>
              <div className="pgs-winner-body">
                {hasHeading('resultados', D.resultados.lead!, D.resultados.accent!) && (
                  <h2 id="pgs-results-title" className="pgs-h2">
                    {heading('resultados', D.resultados.lead!, D.resultados.accent!)}
                  </h2>
                )}
                <p className="pgs-winner-name pgs-foil">{winner.name}</p>
                {winner.representing && <p className="pgs-winner-rep">{winner.representing}</p>}
                {court.length > 0 && (
                  <ol className="pgs-court">
                    {court.map((r) => (
                      <li key={r.rank}>
                        <span className="pgs-court-rank">{r.rank}° lugar</span>
                        <span className="pgs-court-name">{r.name}</span>
                        {r.representing && <span className="pgs-court-rep">{r.representing}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </section>
      ),

    certamen: () => {
      const parts = headingOf('certamen', title.lead, title.main);
      return (
        <section id="certamen" className={sectionClass('certamen')} aria-labelledby="pgs-about-title" {...editKey('certamen')}>
          <div className="pgs-wrap pgs-about">
            <AboutHeading
              title={title}
              index={numberOf('certamen')}
              titleId="pgs-about-title"
              reveal
              kicker={overrideOr(conf('certamen').kicker, D.certamen.kicker!)}
              lead={parts.lead}
              accent={parts.accent}
              editable={isEditing}
            />
            {aboutParagraphs.length > 0 && <AboutProse paragraphs={aboutParagraphs} reveal editable={isEditing} />}
          </div>
          {view.highlights.length > 0 && (
            <div className="pgs-wrap">
              <dl className="pgs-stats" data-reveal>
                {view.highlights.map((h) => (
                  <div key={h.label} className="pgs-stat">
                    <dt>{h.label}</dt>
                    <dd>{h.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      );
    },

    ganadoras: () => {
      const c = conf('ganadoras');
      return (
        <HallOfFame
          winners={site.pastWinners}
          index={numberOf('ganadoras')}
          look={{ kicker: c.kicker ?? undefined, lead: c.title ?? undefined, accent: c.titleAccent ?? undefined, toneClass: sectionToneClasses(c.tone, c.spacing), editable: isEditing }}
        />
      );
    },

    camino: () => (
      <section id="camino" className={sectionClass('camino')} aria-labelledby="pgs-journey-title" {...editKey('camino')}>
        <div className="pgs-wrap">
          <div className="pgs-section-head" data-reveal>
            {sectionKicker('camino', D.camino.kicker!)}
            {hasHeading('camino', D.camino.lead!, D.camino.accent!) && (
              <h2 id="pgs-journey-title" className="pgs-h2">
                {heading('camino', D.camino.lead!, D.camino.accent!)}
              </h2>
            )}
          </div>
          <ol className="pgs-journey" data-reveal>
            {view.journey.map((stage, i) => (
              <li key={stage.key} className={`is-${stage.status}`} style={{ transitionDelay: `${i * 0.08}s` }}>
                <span className="pgs-journey-node" aria-hidden="true">
                  {stage.status === 'done' ? <Check /> : <span>{i + 1}</span>}
                </span>
                <span className="pgs-journey-title">
                  {stage.title}
                  {stage.status === 'current' && <span className="pgs-journey-now">Ahora</span>}
                </span>
                <span className="pgs-journey-detail">{stage.detail}</span>
                <span className="pgs-sr">{stage.status === 'done' ? '(etapa cumplida)' : stage.status === 'current' ? '(etapa en curso)' : '(próxima etapa)'}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    ),

    postula: () =>
      site.registration ? (
        <section id="postula" className={sectionClass('postula')} aria-labelledby="pgs-apply-title" {...editKey('postula')}>
          <div className="pgs-wrap">
            <div className="pgs-callout" data-reveal>
              <span className="pgs-callout-mark" aria-hidden="true">
                <Crown />
              </span>
              <div>
                <p className="pgs-callout-title">Preselección</p>
                <p>
                  {site.registration.maxCandidates ? (
                    <>
                      Solo <strong>{site.registration.maxCandidates} candidatas</strong> serán escogidas.{' '}
                    </>
                  ) : null}
                  Inscríbete en el formulario y espera el llamado, correo o WhatsApp de la organización con el resultado de tu preselección.
                </p>
              </div>
            </div>

            <div className="pgs-section-head is-center pgs-subhead" data-reveal>
              {sectionKicker('postula', D.postula.kicker!)}
              {hasHeading('postula', D.postula.lead!, D.postula.accent!) && (
                <h2 id="pgs-apply-title" className="pgs-h2">
                  {heading('postula', D.postula.lead!, D.postula.accent!)}
                </h2>
              )}
            </div>
            <ol className="pgs-steps" data-reveal>
              {registrationProcess({ name: site.name, maxCandidates: site.registration.maxCandidates }).map((step, i) => (
                <li key={step.title}>
                  <span className="pgs-steps-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pgs-steps-title">{step.title}</span>
                  <span className="pgs-steps-detail">{step.detail}</span>
                </li>
              ))}
            </ol>

            {site.registration.benefits.length > 0 && (
              <>
                <div className="pgs-section-head is-center pgs-subhead" data-reveal>
                  <p className="pgs-eyebrow">Qué incluye tu inscripción</p>
                  <h2 className="pgs-h2">
                    Formación profesional <em>antes de tu competencia</em>
                  </h2>
                </div>
                <ul className="pgs-includes" data-reveal>
                  {site.registration.benefits.map((benefit) => (
                    <li key={benefit}>
                      <span className="pgs-check" aria-hidden="true">
                        <Check />
                      </span>
                      {benefit}
                    </li>
                  ))}
                </ul>
                {site.registration.classesNote && (
                  <p className="pgs-note" data-reveal>
                    <strong>Lugar y horario de clases:</strong> {site.registration.classesNote}
                  </p>
                )}
              </>
            )}

            <div id="formulario-inscripcion" className="pgs-lead" data-reveal>
              <div className="pgs-lead-intro">
                <p className="pgs-eyebrow is-ink">Postula ahora</p>
                <h3 className="pgs-h3 is-ink">
                  Formulario de <em>inscripción</em>
                </h3>
                <p>
                  Completa tus datos y espera el llamado, correo o WhatsApp de la organización con el resultado de tu preselección
                  {site.registration.maxCandidates ? ` (solo ${site.registration.maxCandidates} candidatas)` : ''}.
                </p>
                {closeCountdown && view.registrationClosesLabel && <p className="pgs-lead-deadline">Inscripciones abiertas hasta el {view.registrationClosesLabel}.</p>}
              </div>
              <CandidateApplicationForm
                token={site.registration.token}
                requirements={site.registration.requirements}
                privacyHref={`/politica-privacidad?certamen=${encodeURIComponent(site.registration.token)}`}
              />
            </div>
          </div>
        </section>
      ) : (
        site.registrationNotice && (
          // Inscripción aún sin abrir (o ya cerrada): el título es el aviso automático del estado.
          <section id="postula" className={sectionClass('postula')} aria-labelledby="pgs-apply-title" {...editKey('postula')}>
            <div className="pgs-wrap">
              <div className="pgs-section-head is-center" data-reveal>
                {sectionKicker('postula', D.postula.kicker!)}
                <h2 id="pgs-apply-title" className="pgs-h2">
                  {site.registrationNotice.state === 'closed' ? (
                    <>
                      Las postulaciones <em>ya cerraron</em>
                    </>
                  ) : (
                    <>
                      Las postulaciones <em>abrirán pronto</em>
                    </>
                  )}
                </h2>
                <p className="pgs-note">
                  {site.registrationNotice.state === 'closed'
                    ? `La convocatoria de ${site.name} ya no recibe postulaciones.`
                    : site.registrationNotice.opensAtLabel
                      ? `La convocatoria de ${site.name} abre el ${site.registrationNotice.opensAtLabel}.`
                      : `Aún no está abierta la convocatoria de ${site.name}.`}{' '}
                  {site.whatsapp || site.contactEmail ? 'Escríbenos y te avisamos cuando haya novedades.' : 'Vuelve pronto para postular.'}
                </p>
                <div className="pgs-hero-ctas">
                  {site.whatsapp && (
                    <a className="pgs-btn is-gold" href={whatsappMessageUrl(site.whatsapp.href, whatsappGreeting('candidata', site.name))} target="_blank" rel="noopener noreferrer">
                      <span>Escríbenos por WhatsApp</span>
                    </a>
                  )}
                  {site.contactEmail && (
                    <a className="pgs-btn is-ghost" href={`mailto:${site.contactEmail}`}>
                      <span>{site.contactEmail}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      ),

    candidatas: () => (
      <section id="candidatas" className={sectionClass('candidatas')} aria-labelledby="pgs-candidates-title" {...editKey('candidatas')}>
        <div className="pgs-wrap">
          <div className="pgs-section-head is-split" data-reveal>
            <div>
              {sectionKicker('candidatas', site.candidates.length === 1 ? 'Candidata oficial' : `${site.candidates.length} candidatas oficiales`)}
              {hasHeading('candidatas', D.candidatas.lead!, D.candidatas.accent!) && (
                <h2 id="pgs-candidates-title" className="pgs-h2">
                  {heading('candidatas', D.candidatas.lead!, D.candidatas.accent!)}
                </h2>
              )}
            </div>
            {site.voting && (
              <a className="pgs-link is-light" href={site.voting.href}>
                Vota por tu favorita · {formatCurrency(site.voting.pricePerVote)} por voto
              </a>
            )}
          </div>
          <ul className="pgs-grid">
            {site.candidates.map((c, i) => (
              <li key={c.id} data-reveal style={{ transitionDelay: `${(i % 4) * 0.07}s` }}>
                <button type="button" className={`pgs-card${c.isWinner ? ' is-winner' : ''}`} onClick={() => setSelected(i)} aria-haspopup="dialog">
                  <span className="pgs-card-photo">
                    <Portrait candidate={c} />
                    <span className="pgs-card-shade" aria-hidden="true" />
                    {c.number != null && <span className="pgs-card-number">{pad(c.number)}</span>}
                    {(c.isWinner || c.isFinalist) && (
                      <span className={`pgs-card-flag${c.isWinner ? '' : ' is-soft'}`}>
                        <Crown className="pgs-badge-icon" />
                        {c.isWinner ? 'Ganadora' : 'Finalista'}
                      </span>
                    )}
                    <span className="pgs-card-caption">
                      <span className="pgs-card-name" data-truncate>{c.name}</span>
                      {c.representing && <span className="pgs-card-rep">{c.representing}</span>}
                      <span className="pgs-card-more" aria-hidden="true">
                        Ver perfil <Arrow />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    ),

    votacion: () =>
      site.voteRanking &&
      site.voteRanking.length > 0 && (
        <section id="votacion" className={sectionClass('votacion')} aria-labelledby="pgs-ranking-title" {...editKey('votacion')}>
          <div className="pgs-wrap pgs-vote">
            <div className="pgs-vote-head" data-reveal>
              {sectionKicker('votacion', D.votacion.kicker!)}
              {hasHeading('votacion', D.votacion.lead!, D.votacion.accent!) && (
                <h2 id="pgs-ranking-title" className="pgs-h2">
                  {heading('votacion', D.votacion.lead!, D.votacion.accent!)}
                </h2>
              )}
              <p className="pgs-muted">Tu voto también cuenta. El marcador suma solo votos con pago confirmado.</p>
              {site.voting && (
                <a className="pgs-btn is-gold" href={site.voting.href}>
                  <span>Votar ahora</span>
                  <span className="pgs-btn-note">{formatCurrency(site.voting.pricePerVote)} por voto</span>
                </a>
              )}
            </div>
            <ol className="pgs-ranking" data-reveal>
              {site.voteRanking.map((row, i) => (
                <li key={`${row.name}-${i}`} className={i === 0 ? 'is-first' : undefined}>
                  <span className="pgs-ranking-pos">{i === 0 ? <Crown /> : pad(i + 1)}</span>
                  <span className="pgs-ranking-body">
                    <span className="pgs-ranking-name">
                      {row.name}
                      {row.number != null && <span className="pgs-ranking-num">N° {row.number}</span>}
                    </span>
                    <span className="pgs-bar">
                      <span style={{ width: `${Math.max(3, (row.votes / maxVotes) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="pgs-ranking-votes">
                    {row.votes.toLocaleString('es-CL')}
                    <small>{row.votes === 1 ? 'voto' : 'votos'}</small>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ),

    gala: () => {
      const parts = headingOf('gala', site.venueName ?? 'Una noche', site.venueName ? '' : 'para recordar');
      return (
        <section id="gala" className={sectionClass('gala')} aria-labelledby="pgs-gala-title" {...editKey('gala')}>
          <div className="pgs-wrap pgs-gala">
            <div className="pgs-gala-date" data-reveal>
              {sectionKicker('gala', D.gala.kicker!, 'paper')}
              {view.gala ? (
                <p className="pgs-gala-day" aria-label={view.gala.long}>
                  <span className="pgs-gala-num">{view.gala.day}</span>
                  <span className="pgs-gala-month">
                    <span>{view.gala.month}</span>
                    <span>
                      {view.gala.weekday} · {view.gala.time} h
                    </span>
                  </span>
                </p>
              ) : (
                <p className="pgs-gala-tba">Fecha por anunciar</p>
              )}
            </div>
            <div className="pgs-gala-info" data-reveal>
              {(parts.lead || parts.accent) && (
                <h2 id="pgs-gala-title" className={`pgs-h2 is-ink ${headingSize([parts.lead, parts.accent].filter(Boolean).join(' '))}`.trim()}>
                  <HeadingText lead={parts.lead} accent={parts.accent} editable={isEditing} />
                </h2>
              )}
              {site.venueAddress && (
                <p className="pgs-gala-address">
                  <Pin className="pgs-inline-icon" />
                  {site.venueAddress}
                </p>
              )}
              <div className="pgs-gala-actions">
                {site.tickets && (
                  <a className="pgs-btn is-ink" href={site.tickets.href}>
                    <Ticket className="pgs-btn-icon is-lead" />
                    <span>Comprar entradas</span>
                    {site.tickets.fromPrice != null && <span className="pgs-btn-note">desde {formatCurrency(site.tickets.fromPrice)}</span>}
                  </a>
                )}
                {view.mapsUrl && (
                  <a className="pgs-link is-ink" href={view.mapsUrl} target="_blank" rel="noopener noreferrer">
                    <Pin className="pgs-inline-icon" />
                    Cómo llegar
                  </a>
                )}
                {view.calendarUrl && (
                  <a className="pgs-link is-ink" href={view.calendarUrl} target="_blank" rel="noopener noreferrer">
                    <Calendar className="pgs-inline-icon" />
                    Agregar a mi calendario
                  </a>
                )}
              </div>
              {site.tickets && <p className="pgs-fine">Tu entrada llega por correo con código QR para el acceso.</p>}
            </div>
          </div>
        </section>
      );
    },

    auspicios: () => (
      <section id="auspicios" className={sectionClass('auspicios')} aria-label="Sponsors" {...editKey('auspicios')}>
        <div className="pgs-wrap">
          {showAudienceSwitch && (
            <>
              <div className="pgs-section-head is-center pgs-subhead" data-reveal>
                <p className="pgs-eyebrow">Súmate como sponsor</p>
                <h2 className="pgs-h2">
                  Así funciona <em>tu alianza</em>
                </h2>
              </div>
              <ol className="pgs-steps" data-reveal>
                {sponsorProcess({ hasPackages: site.packages.length > 0, hasWhatsapp: Boolean(site.whatsapp) }).map((step, i) => (
                  <li key={step.title}>
                    <span className="pgs-steps-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="pgs-steps-title">{step.title}</span>
                    <span className="pgs-steps-detail">{step.detail}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {site.packages.length > 0 && (
            <>
              <div id="paquetes" className="pgs-section-head is-center pgs-subhead" data-reveal>
                {sectionKicker('auspicios', D.auspicios.kicker!)}
                {hasHeading('auspicios', D.auspicios.lead!, D.auspicios.accent!) && (
                  <h2 className="pgs-h2">
                    {heading('auspicios', D.auspicios.lead!, D.auspicios.accent!)}
                  </h2>
                )}
                <p className="pgs-muted pgs-head-note">Toca un paquete para ver todo lo que incluye.</p>
              </div>
              <ul className="pgs-packages">
                {site.packages.map((p, i) => {
                  const exclusive = packageBenefits.exclusive[p.id] ?? [];
                  const priceLabel = p.price != null ? formatCurrency(p.price) : null;
                  return (
                    <li key={p.id} className={`pgs-package${i === 0 ? ' is-featured' : ''}${p.slotsLeft === 0 ? ' is-soldout' : ''}${openPackages.has(p.id) ? ' is-open' : ''}`} data-reveal style={{ transitionDelay: `${i * 0.08}s` }}>
                      <button type="button" className="pgs-package-toggle" aria-expanded={openPackages.has(p.id)} aria-controls={`paquete-${p.id}`} onClick={() => togglePackage(p.id)}>
                        <span className="pgs-package-head">
                          <span className="pgs-eyebrow">{i === 0 && site.packages.length > 1 ? 'Más exclusivo' : p.tierLabel}</span>
                          <span className="pgs-package-name">{p.name}</span>
                          {p.price != null && (
                            <span className="pgs-package-price">
                              {formatCurrency(p.price)}
                            </span>
                          )}
                        </span>
                        <Chevron direction="down" className="pgs-package-chevron" />
                      </button>
                      {p.description && <p className="pgs-package-desc">{p.description}</p>}
                      <div id={`paquete-${p.id}`} className="pgs-package-body" hidden={!openPackages.has(p.id)}>
                        {packageBenefits.common.length > 0 && (
                          <>
                            <p className="pgs-package-group">Incluye en todos los paquetes</p>
                            <ul className="pgs-benefits">
                              {packageBenefits.common.map((benefit) => (
                                <li key={benefit}>
                                  <Diamond className="pgs-benefit-mark" />
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {exclusive.length > 0 && (
                          <>
                            {packageBenefits.common.length > 0 && <p className="pgs-package-group">Exclusivo {p.name}</p>}
                            <ul className="pgs-benefits">
                              {exclusive.map((benefit) => (
                                <li key={benefit}>
                                  <Diamond className="pgs-benefit-mark" />
                                  {benefit}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                      {p.slotsLeft != null && (
                        <p className="pgs-slots">{p.slotsLeft === 0 ? 'Cupos agotados' : `${p.slotsLeft} ${p.slotsLeft === 1 ? 'cupo disponible' : 'cupos disponibles'}`}</p>
                      )}
                      {p.slotsLeft !== 0 && (site.sponsorLeadForm || site.whatsapp) && (
                        <div className="pgs-package-actions">
                          {site.sponsorLeadForm && (
                            <button type="button" className="pgs-btn is-gold is-small" onClick={() => pickPackage(p.id)}>
                              <span>Quiero {p.name}</span>
                            </button>
                          )}
                          {site.whatsapp && (
                            <a className="pgs-link" href={whatsappMessageUrl(site.whatsapp.href, whatsappPackageMessage(site.name, p.name, priceLabel))} target="_blank" rel="noopener noreferrer">
                              o consultar por WhatsApp
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {site.sponsorNote && (
            <div className="pgs-callout pgs-callout-note" data-reveal>
              <span className="pgs-callout-mark" aria-hidden="true">
                <Crown />
              </span>
              <div>
                <p className="pgs-callout-title">Exclusividad por categoría</p>
                <p>{site.sponsorNote}</p>
              </div>
            </div>
          )}

          {site.whatsapp && showAudienceSwitch && (
            <div className="pgs-callout is-center" data-reveal>
              <div>
                <p className="pgs-callout-title">¿Prefieres coordinarlo directo con nosotros?</p>
                <p>Escríbenos por WhatsApp y te ayudamos a elegir el paquete ideal para tu marca.</p>
              </div>
              <a className="pgs-btn is-gold" href={whatsappMessageUrl(site.whatsapp.href, whatsappGreeting('sponsor', site.name))} target="_blank" rel="noopener noreferrer">
                <Whatsapp className="pgs-btn-icon is-lead" />
                <span>Quiero ser sponsor</span>
              </a>
            </div>
          )}

          {site.sponsorLeadForm && (
            <div id="formulario-sponsor" className="pgs-lead" data-reveal>
              <div className="pgs-lead-intro">
                <p className="pgs-eyebrow is-ink">Postula tu marca</p>
                <h3 className="pgs-h3 is-ink">
                  Formulario de <em>sponsor</em>
                </h3>
                <p>Completa tus datos y te contactaremos para coordinar tu patrocinio.</p>
              </div>
              <SponsorLeadForm slug={site.slug} selectedPackage={pickedPackage ? { id: pickedPackage.id, name: pickedPackage.name } : null} onClearPackage={() => setPickedPackageId(null)} />
            </div>
          )}
          {!site.sponsorLeadForm && !site.whatsapp && site.contactEmail && (
            <p className="pgs-note" data-reveal>
              Para ser sponsor escríbenos a <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </p>
          )}

          {site.sponsorsByTier.length > 0 && (
            <>
              <div className="pgs-section-head is-center pgs-subhead" data-reveal>
                <p className="pgs-eyebrow">Marcas que nos acompañan</p>
                <h2 className="pgs-h2">
                  Sponsors <em>oficiales</em>
                </h2>
              </div>
              <div className="pgs-sponsors" data-reveal>
                {site.sponsorsByTier.map((group, i) => (
                  <div key={group.tier} className={`pgs-sponsor-tier${i === 0 ? ' is-top' : ''}`}>
                    <p className="pgs-sponsor-label">
                      <span aria-hidden="true" />
                      {group.label}
                      <span aria-hidden="true" />
                    </p>
                    <ul>
                      {group.names.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    ),

    director: () => {
      if (!site.director) return null;
      const copy = directorCopy(site.director.title);
      return (
        <section id="director" className={sectionClass('director')} aria-labelledby="pgs-director-title" {...editKey('director')}>
          <div className="pgs-wrap">
            <div className="pgs-director" data-reveal>
              {site.director.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pgs-director-photo" src={site.director.photoUrl} alt={site.director.name} loading="lazy" decoding="async" />
              ) : (
                <span className="pgs-director-photo pgs-monogram" role="img" aria-label={site.director.name}>
                  <span>{initials(site.director.name)}</span>
                </span>
              )}
              <div className="pgs-director-body">
                {sectionKicker('director', D.director.kicker!)}
                {hasHeading('director', copy.lead, copy.word) && (
                  <h2 id="pgs-director-title" className="pgs-h2">
                    {heading('director', copy.lead, copy.word)}
                  </h2>
                )}
                <p className="pgs-director-name">{site.director.name}</p>
                {site.director.role && <p className="pgs-director-role">{site.director.role}</p>}
                {site.director.bio && <p className="pgs-director-bio">{site.director.bio}</p>}
                {site.director.highlights.length > 0 && (
                  <div className="pgs-director-career">
                    <button type="button" className="pgs-director-toggle" aria-expanded={directorOpen} aria-controls="pgs-director-highlights" onClick={() => setDirectorOpen((v) => !v)}>
                      <span>Trayectoria</span>
                      <Chevron direction="down" className="pgs-package-chevron" />
                    </button>
                    <ul id="pgs-director-highlights" className="pgs-director-highlights" hidden={!directorOpen}>
                      {site.director.highlights.map((item) => (
                        <li key={item}>
                          <Diamond className="pgs-benefit-mark" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {site.whatsapp && (
                  <a
                    className="pgs-btn is-ghost"
                    href={whatsappMessageUrl(site.whatsapp.href, `Hola, tengo una consulta sobre ${site.name}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Whatsapp className="pgs-btn-icon is-lead" />
                    <span>Escríbenos</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    },

    preguntas: () => (
      <section id="preguntas" className={sectionClass('preguntas')} aria-labelledby="pgs-faq-title" {...editKey('preguntas')}>
        <div className="pgs-wrap pgs-faq">
          <div className="pgs-faq-head" data-reveal>
            {sectionKicker('preguntas', D.preguntas.kicker!, 'paper')}
            {hasHeading('preguntas', D.preguntas.lead!, D.preguntas.accent!) && (
              <h2 id="pgs-faq-title" className="pgs-h2 is-ink">
                {heading('preguntas', D.preguntas.lead!, D.preguntas.accent!)}
              </h2>
            )}
            {(site.contactEmail || site.whatsapp) && (
              <p className="pgs-faq-contact">
                ¿Otra consulta?{' '}
                {site.whatsapp && (
                  <>
                    Háblanos por{' '}
                    <a href={site.whatsapp.href} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                    {site.contactEmail ? ' o escríbenos a ' : '.'}
                  </>
                )}
                {!site.whatsapp && 'Escríbenos a '}
                {site.contactEmail && <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}
              </p>
            )}
          </div>
          <div className="pgs-faq-list" data-reveal>
            {view.faq.map((item) => (
              <details key={item.q} className="pgs-faq-item">
                <summary>
                  {item.q}
                  <Plus className="pgs-faq-icon" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    ),
  };

  // ── Recorrido del orden: las secciones del estudio seguidas van en un solo tramo ──
  const body: ReactNode[] = [];
  let run: WebSiteBlock[] = [];
  const flushRun = () => {
    if (run.length === 0 || !design) return;
    const tramo = run;
    run = [];
    body.push(
      <SiteRenderer
        key={`estudio-${tramo[0]!.id}`}
        embedded
        withCss={false}
        name={site.name}
        logoUrl={null}
        blocks={tramo}
        theme={design.theme}
        slug={site.slug}
        basePath={studioBase}
        mode={isEditing ? 'preview' : 'public'}
      />
    );
  };
  for (const item of items) {
    if (item.kind === 'block') {
      const block = blocksById.get(item.id);
      if (block) run.push(block);
      continue;
    }
    flushRun();
    body.push(<Fragment key={item.id}>{renderers[item.id]()}</Fragment>);
  }
  flushRun();

  return (
    <div ref={rootRef} className={`pgs ${PAGEANT_FONT_CLASSES}${typographyCss ? ` ${SITE_FONT_CLASSES} ${PAGEANT_TYPOGRAPHY_CLASS}` : ''}`} data-accent={site.accent}>
      <style>{PAGEANT_SITE_STYLES}</style>
      {/* Tipografía elegida por bloque: después de la hoja base y solo con claves de la lista cerrada. */}
      {typographyCss && <style>{typographyCss}</style>}
      {/* Hoja de las secciones del estudio visual: una vez para todos sus tramos. */}
      {hasStudio && <style>{SITE_CSS}</style>}
      <a className="pgs-skip" href={startsWithHero ? '#pgs-tras-portada' : '#contenido'}>
        Saltar al contenido
      </a>

      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header className={`pgs-top${scrolled || menuOpen ? ' is-solid' : ''}`}>
        <a className="pgs-brand" href={heroShown ? '#inicio' : '#contenido'} aria-label={`${site.name}, inicio`}>
          <Crown className="pgs-brand-mark" />
          <span className="pgs-brand-name" data-truncate>
            {title.lead && <span className="pgs-brand-lead">{title.lead} </span>}
            {title.main}
          </span>
        </a>
        {navItems.length > 0 && (
          <nav className="pgs-nav" aria-label="Secciones">
            {navItems.map((item) => (
              <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? 'true' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <div className="pgs-top-actions">
          {showAudienceSwitch && (
            <div className="pgs-audience" role="group" aria-label="¿Qué te interesa?">
              <button type="button" aria-pressed={isSponsorView} className={isSponsorView ? 'is-active' : ''} onClick={() => switchAudience('sponsor')}>
                <span className="pgs-lg">Ser sponsor</span>
                <span className="pgs-sm">Sponsor</span>
              </button>
              <button type="button" aria-pressed={!isSponsorView} className={!isSponsorView ? 'is-active' : ''} onClick={() => switchAudience('candidata')}>
                <span className="pgs-lg">Quiero ser candidata</span>
                <span className="pgs-sm">Candidata</span>
              </button>
            </div>
          )}
          {primaryCta && (
            <a className="pgs-btn is-gold is-small" href={primaryCta.href}>
              <span>{primaryCta.label}</span>
            </a>
          )}
          {navItems.length > 0 && (
            <button type="button" className={`pgs-burger${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="pgs-menu" onClick={() => setMenuOpen((v) => !v)}>
              <span />
              <span />
            </button>
          )}
        </div>
      </header>
      {menuOpen && (
        <nav id="pgs-menu" className="pgs-menu" aria-label="Menú">
          <ol>
            {sections.map((item, i) => (
              <li key={item.id} style={{ animationDelay: `${0.05 + i * 0.05}s` }}>
                <a href={`#${item.id}`} onClick={() => setMenuOpen(false)}>
                  <span className="pgs-menu-index">{pad(i + 1)}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
          <div className="pgs-menu-foot">
            {site.whatsapp && (
              <a href={site.whatsapp.href} target="_blank" rel="noopener noreferrer">
                <Whatsapp className="pgs-inline-icon" />
                {site.whatsapp.label}
              </a>
            )}
            {site.instagramHandles.map((handle) => (
              <a key={handle} href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer">
                <Instagram className="pgs-inline-icon" />@{handle}
              </a>
            ))}
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`}>
                <Mail className="pgs-inline-icon" />
                {site.contactEmail}
              </a>
            )}
          </div>
        </nav>
      )}

      <main id="contenido" tabIndex={-1}>
        {/* La barra superior es fija y transparente: si el sitio no abre con la portada, se le deja su alto. */}
        {!startsWithHero && <div className="pgs-top-space" aria-hidden="true" />}
        {body}
      </main>

      {/* ── Pie ────────────────────────────────────────────────────────── */}
      <footer className="pgs-footer" {...(isEditing ? { 'data-edit-key': 'footer' } : {})}>
        {footerInstagram.map((handle) => (
          <a key={handle} className="pgs-follow" href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer" data-reveal>
            <span className="pgs-follow-label">
              <Instagram className="pgs-inline-icon" />
              Síguenos en Instagram
            </span>
            <span className="pgs-follow-handle">@{handle}</span>
          </a>
        ))}
        <div className="pgs-wrap pgs-footer-grid">
          <div className="pgs-footer-brand">
            <Crown className="pgs-brand-mark" />
            <p className="pgs-footer-name">
              {footer?.title || <>{shortName}{title.edition && <span className="pgs-footer-edition">{title.edition}</span>}</>}
            </p>
            {footer?.description && <p className="pgs-muted pgs-footer-description">{footer.description}</p>}
          </div>
          {(footerMenu.length > 0 || footerLinks.length > 0) && (
            <nav className="pgs-footer-nav" aria-label="Enlaces del pie de página">
              {footerMenu.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.label}
                </a>
              ))}
              {footerLinks.map((link) => (
                <a key={link.id} href={link.href} target={link.newTab ? '_blank' : undefined} rel={link.newTab ? 'noopener noreferrer' : undefined}>
                  {link.label}
                </a>
              ))}
            </nav>
          )}
          {(showFooterContact || site.registration) && (
            <div className="pgs-footer-contact">
              {showFooterContact && site.whatsapp && (
                <a href={site.whatsapp.href} target="_blank" rel="noopener noreferrer">
                  <Whatsapp className="pgs-inline-icon" />
                  {site.whatsapp.label}
                </a>
              )}
              {showFooterContact && site.contactEmail && (
                <a href={`mailto:${site.contactEmail}`}>
                  <Mail className="pgs-inline-icon" />
                  {site.contactEmail}
                </a>
              )}
              {footerInstagram.map((handle) => (
                <a key={handle} href={`https://instagram.com/${handle}`} target="_blank" rel="noopener noreferrer">
                  <Instagram className="pgs-inline-icon" />@{handle}
                </a>
              ))}
              {site.registration && <a href={site.registration.href}>Postula al certamen</a>}
            </div>
          )}
        </div>
        {site.footerPartners.items.length > 0 && (
          <div className="pgs-wrap pgs-partners" data-reveal>
            <p className="pgs-partners-title">{site.footerPartners.title ?? DEFAULT_FOOTER_PARTNERS_TITLE}</p>
            <ul className="pgs-partners-list">
              {site.footerPartners.items.map((partner) => {
                // eslint-disable-next-line @next/next/no-img-element
                const logo = <img src={partner.logoUrl} alt={partner.name} loading="lazy" decoding="async" />;
                return (
                  <li key={partner.id}>
                    {partner.href ? (
                      <a className="pgs-partner" href={partner.href} target="_blank" rel="noopener noreferrer" title={partner.name}>
                        {logo}
                      </a>
                    ) : (
                      <span className="pgs-partner" title={partner.name}>
                        {logo}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="pgs-wrap pgs-footer-legal">
          <p>
            {footer?.copyright || <>© {title.edition ?? ''} {shortName}</>}
          </p>
          <p>
            <a href="/politica-privacidad">Privacidad</a>
          </p>
        </div>
      </footer>

      {options.whatsappFloat && whatsappFloat && <WhatsappFloat href={whatsappFloat.href} label={whatsappFloat.label} />}

      {selected !== null && site.candidates[selected] && (
        <CandidateDialog candidates={site.candidates} index={selected} voting={site.voting} onNavigate={setSelected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
