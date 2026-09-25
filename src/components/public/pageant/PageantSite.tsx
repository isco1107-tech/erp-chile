'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import {
  initials,
  registrationProcess,
  splitPackageBenefits,
  sponsorProcess,
  whatsappGreeting,
  whatsappMessageUrl,
  whatsappPackageMessage,
  type PageantAudience,
  type PageantView,
} from '@/lib/events/pageant-site';
import type { PublicPageantCandidate, PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { Arrow, Calendar, Check, Chevron, Close, Crown, Diamond, Instagram, Mail, Pin, Plus, Ticket, Tiara, Whatsapp } from './icons';
import { PAGEANT_FONT_CLASSES } from './fonts';
import { HeroSky, Kicker, pad } from './parts';
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

/** Animaciones de entrada al hacer scroll. Solo se activan con JS y sin "reducir movimiento": sin eso, todo se ve de inmediato. */
function useReveal(rootRef: React.RefObject<HTMLDivElement | null>, key: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    root.dataset.motion = 'on';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // `key` cambia al pasar de la vista de candidatas a la de sponsors: las secciones nuevas también se revelan.
  }, [rootRef, key]);
}

/** Sección visible en pantalla, para marcar el enlace activo del menú. */
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

export function PageantSite({ site, view }: { site: PublicPageantSite; view: PageantView }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const galaCountdown = useCountdown(site.results ? null : site.galaDate);
  const closeCountdown = useCountdown(site.registration?.closesAt ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pickedPackageId, setPickedPackageId] = useState<string | null>(null);

  // Dos caras del sitio, como la convocatoria de referencia: "Quiero ser
  // candidata" y "Ser sponsor". El selector solo aparece si existen las dos.
  const hasCandidateSide = Boolean(site.registration) || site.candidates.length > 0 || Boolean(site.voting) || Boolean(site.results);
  const hasSponsorSide = site.packages.length > 0 || site.sponsorLeadForm || site.sponsorsByTier.length > 0;
  const showAudienceSwitch = hasCandidateSide && hasSponsorSide;
  const [audience, setAudience] = useState<PageantAudience>(hasCandidateSide ? 'candidata' : 'sponsor');
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
  const isSponsorView = showAudienceSwitch ? audience === 'sponsor' : !hasCandidateSide;
  const whatsappFloat = site.whatsapp
    ? { href: whatsappMessageUrl(site.whatsapp.href, whatsappGreeting(isSponsorView ? 'sponsor' : 'candidata', site.name)), label: isSponsorView ? 'Escríbenos por WhatsApp para ser sponsor' : 'Escríbenos por WhatsApp para ser candidata' }
    : null;
  useReveal(rootRef, isSponsorView ? 'sponsor' : 'candidata');
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

  // Numeración editorial de las secciones visibles (01, 02, …) en el orden en que aparecen.
  const sections = useMemo(() => {
    const candidateSide = !isSponsorView;
    const list: Array<{ id: string; label: string; show: boolean }> = [
      { id: 'resultados', label: 'Resultados', show: candidateSide && Boolean(winner) },
      { id: 'certamen', label: 'El certamen', show: Boolean(site.description) || view.highlights.length > 0 },
      // Con la convocatoria abierta, "Así es el proceso" de la inscripción reemplaza al recorrido general.
      { id: 'camino', label: 'El camino', show: candidateSide && !site.registration },
      { id: 'postula', label: 'Inscripción', show: candidateSide && Boolean(site.registration) },
      { id: 'candidatas', label: 'Candidatas', show: site.candidates.length > 0 },
      { id: 'votacion', label: 'Votación', show: candidateSide && Boolean(site.voteRanking && site.voteRanking.length > 0) },
      { id: 'gala', label: 'La gala', show: hasGala },
      { id: 'auspicios', label: showAudienceSwitch ? 'Paquetes' : 'Auspicios', show: hasSponsorSection && (isSponsorView || !showAudienceSwitch) },
      { id: 'preguntas', label: 'Preguntas', show: candidateSide && view.faq.length > 0 },
    ];
    return list.filter((s) => s.show);
  }, [winner, site.description, site.registration, site.candidates.length, site.voteRanking, hasGala, hasSponsorSection, view.highlights.length, view.faq.length, isSponsorView, showAudienceSwitch]);
  const shows = (id: string) => sections.some((s) => s.id === id);
  const numberOf = (id: string) => pad(sections.findIndex((s) => s.id === id) + 1);
  const navItems = sections.filter((s) => !['camino', 'preguntas'].includes(s.id)).slice(0, 6);
  const active = useScrollSpy(sections.map((s) => s.id));

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

  const titleFit = { '--pgs-fit': Math.max(title.main.length, 6) * 0.64 } as CSSProperties;

  return (
    <div ref={rootRef} className={`pgs ${PAGEANT_FONT_CLASSES}`} data-accent={site.accent}>
      <style>{PAGEANT_SITE_STYLES}</style>
      <a className="pgs-skip" href="#contenido">
        Saltar al contenido
      </a>

      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header className={`pgs-top${scrolled || menuOpen ? ' is-solid' : ''}`}>
        <a className="pgs-brand" href="#inicio" aria-label={`${site.name}, inicio`}>
          {site.organizerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.organizerLogoUrl} alt="" className="pgs-brand-logo" />
          ) : (
            <Crown className="pgs-brand-mark" />
          )}
          <span className="pgs-brand-name">
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
            {site.instagramHandle && (
              <a href={`https://instagram.com/${site.instagramHandle}`} target="_blank" rel="noopener noreferrer">
                <Instagram className="pgs-inline-icon" />@{site.instagramHandle}
              </a>
            )}
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`}>
                <Mail className="pgs-inline-icon" />
                {site.contactEmail}
              </a>
            )}
          </div>
        </nav>
      )}

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section id="inicio" className={`pgs-hero${site.coverImageUrl ? ' has-cover' : ''}`} aria-labelledby="pgs-title">
        {site.coverImageUrl && (
          <div className="pgs-hero-cover" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.coverImageUrl} alt="" fetchPriority="high" />
          </div>
        )}
        <HeroSky />

        <div className="pgs-hero-inner">
          <Tiara className="pgs-tiara" />
          <p className="pgs-hero-eyebrow pgs-rise" style={{ animationDelay: '0.2s' }}>
            {site.organizer} presenta
          </p>
          <h1 id="pgs-title" className="pgs-title" style={titleFit}>
            {title.lead && (
              <span className="pgs-title-lead pgs-rise" style={{ animationDelay: '0.3s' }}>
                <span className="pgs-title-rule" aria-hidden="true" />
                {title.lead}
                <span className="pgs-title-rule" aria-hidden="true" />
              </span>
            )}
            <span className="pgs-title-main pgs-foil pgs-rise" style={{ animationDelay: '0.42s' }}>
              {title.main}
            </span>
            {title.edition && (
              <span className="pgs-title-edition pgs-rise" style={{ animationDelay: '0.56s' }}>
                {title.edition}
              </span>
            )}
          </h1>
          {site.tagline && (
            <p className="pgs-tagline pgs-rise" style={{ animationDelay: '0.66s' }}>
              {site.tagline}
            </p>
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

          <div className="pgs-hero-ctas pgs-rise" style={{ animationDelay: '0.96s' }}>
            {isSponsorView ? (
              <>
                {whatsappFloat ? (
                  <a className="pgs-btn is-gold" href={whatsappFloat.href} target="_blank" rel="noopener noreferrer">
                    <span>Quiero ser sponsor</span>
                    <Arrow className="pgs-btn-icon" />
                  </a>
                ) : (
                  site.sponsorLeadForm && (
                    <a className="pgs-btn is-gold" href="#formulario-sponsor">
                      <span>Quiero ser sponsor</span>
                      <Arrow className="pgs-btn-icon" />
                    </a>
                  )
                )}
                {site.packages.length > 0 && (
                  <a className="pgs-btn is-ghost" href="#auspicios">
                    <span>Ver los {site.packages.length} paquetes</span>
                  </a>
                )}
              </>
            ) : (
              site.registration && (
                <a className="pgs-btn is-gold" href="#postula">
                  <span>Quiero inscribirme</span>
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
          {!isSponsorView && view.registrationClosesLabel && (
            <p className="pgs-hero-note pgs-rise" style={{ animationDelay: '1.05s' }}>
              <span className="pgs-live-dot" aria-hidden="true" />
              Postulaciones abiertas hasta el {view.registrationClosesLabel}
            </p>
          )}
        </div>
        <a className="pgs-scroll-cue" href="#contenido" aria-label="Bajar al contenido">
          <span />
        </a>
      </section>

      {/* ── Cinta ──────────────────────────────────────────────────────── */}
      {ribbon.length > 0 && (
        <div className="pgs-ribbon" aria-hidden="true">
          <div className="pgs-ribbon-track">
            {[0, 1].map((copy) => (
              <span key={copy} className="pgs-ribbon-group">
                {[...ribbon, ...ribbon].map((item, i) => (
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

      <main id="contenido" tabIndex={-1}>
        {/* ── Resultados ───────────────────────────────────────────────── */}
        {shows('resultados') && winner && (
          <section id="resultados" className="pgs-section is-night pgs-results" aria-labelledby="pgs-results-title">
            <div className="pgs-wrap">
              <Kicker index={numberOf('resultados')}>Resultados oficiales</Kicker>
              <div className="pgs-winner" data-reveal>
                <div className="pgs-winner-photo">
                  <Portrait candidate={winner} eager />
                  <Crown className="pgs-winner-crown" />
                </div>
                <div className="pgs-winner-body">
                  <h2 id="pgs-results-title" className="pgs-h2">
                    Tenemos <em>nueva reina</em>
                  </h2>
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
        )}

        {/* ── El certamen ──────────────────────────────────────────────── */}
        {shows('certamen') && (
          <section id="certamen" className="pgs-section is-paper" aria-labelledby="pgs-about-title">
            <div className="pgs-wrap pgs-about">
              <div className="pgs-about-head" data-reveal>
                <Kicker index={numberOf('certamen')} tone="paper">
                  El certamen
                </Kicker>
                <h2 id="pgs-about-title" className="pgs-h2 is-ink">
                  {title.lead ? (
                    <>
                      {title.lead} <em>{title.main}</em>
                    </>
                  ) : (
                    <em>{title.main}</em>
                  )}
                </h2>
              </div>
              {site.description && (
                <div className="pgs-prose" data-reveal>
                  {site.description
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, i) => (
                      <p key={i} className={i === 0 ? 'is-lead' : undefined}>
                        {paragraph}
                      </p>
                    ))}
                </div>
              )}
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
        )}

        {/* ── El camino a la corona ───────────────────────────────────── */}
        {shows('camino') && (
        <section id="camino" className="pgs-section is-night" aria-labelledby="pgs-journey-title">
          <div className="pgs-wrap">
            <div className="pgs-section-head" data-reveal>
              <Kicker index={numberOf('camino')}>El camino a la corona</Kicker>
              <h2 id="pgs-journey-title" className="pgs-h2">
                De la postulación <em>a la corona</em>
              </h2>
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
        )}

        {/* ── Inscripción ──────────────────────────────────────────────── */}
        {shows('postula') && site.registration && (
          <section id="postula" className="pgs-section is-night is-deep" aria-labelledby="pgs-apply-title">
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
                <Kicker index={numberOf('postula')}>Tu camino a la corona</Kicker>
                <h2 id="pgs-apply-title" className="pgs-h2">
                  Así es <em>el proceso</em>
                </h2>
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
                  minAge={site.registration.minAge}
                  privacyHref={`/politica-privacidad?certamen=${encodeURIComponent(site.registration.token)}`}
                />
              </div>
            </div>
          </section>
        )}

        {/* ── Candidatas ───────────────────────────────────────────────── */}
        {site.candidates.length > 0 && (
          <section id="candidatas" className="pgs-section is-night" aria-labelledby="pgs-candidates-title">
            <div className="pgs-wrap">
              <div className="pgs-section-head is-split" data-reveal>
                <div>
                  <Kicker index={numberOf('candidatas')}>{site.candidates.length === 1 ? 'Candidata oficial' : `${site.candidates.length} candidatas oficiales`}</Kicker>
                  <h2 id="pgs-candidates-title" className="pgs-h2">
                    Conoce a <em>las candidatas</em>
                  </h2>
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
                          <span className="pgs-card-name">{c.name}</span>
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
        )}

        {/* ── Votación ─────────────────────────────────────────────────── */}
        {shows('votacion') && site.voteRanking && site.voteRanking.length > 0 && (
          <section id="votacion" className="pgs-section is-night is-deep" aria-labelledby="pgs-ranking-title">
            <div className="pgs-wrap pgs-vote">
              <div className="pgs-vote-head" data-reveal>
                <Kicker index={numberOf('votacion')}>Votación del público</Kicker>
                <h2 id="pgs-ranking-title" className="pgs-h2">
                  Ranking <em>en vivo</em>
                </h2>
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
        )}

        {/* ── La gala ──────────────────────────────────────────────────── */}
        {hasGala && (
          <section id="gala" className="pgs-section is-paper" aria-labelledby="pgs-gala-title">
            <div className="pgs-wrap pgs-gala">
              <div className="pgs-gala-date" data-reveal>
                <Kicker index={numberOf('gala')} tone="paper">
                  La gala final
                </Kicker>
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
                <h2 id="pgs-gala-title" className="pgs-h2 is-ink">
                  {site.venueName ? site.venueName : <>Una noche <em>para recordar</em></>}
                </h2>
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
        )}

        {/* ── Sponsors ─────────────────────────────────────────────────── */}
        {shows('auspicios') && (
          <section id="auspicios" className="pgs-section is-night" aria-label="Sponsors">
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
                  <div className="pgs-section-head is-center pgs-subhead" data-reveal>
                    <Kicker index={numberOf('auspicios')}>Patrocinios oficiales</Kicker>
                    <h2 className="pgs-h2">
                      Elige tu paquete <em>de patrocinio</em>
                    </h2>
                  </div>
                  <ul className="pgs-packages">
                    {site.packages.map((p, i) => {
                      const exclusive = packageBenefits.exclusive[p.id] ?? [];
                      const priceLabel = p.price != null ? `${formatCurrency(p.price)} + IVA` : null;
                      return (
                        <li key={p.id} className={`pgs-package${i === 0 ? ' is-featured' : ''}${p.slotsLeft === 0 ? ' is-soldout' : ''}`} data-reveal style={{ transitionDelay: `${i * 0.08}s` }}>
                          <p className="pgs-eyebrow">{i === 0 && site.packages.length > 1 ? 'Más exclusivo' : p.tierLabel}</p>
                          <p className="pgs-package-name">{p.name}</p>
                          {p.price != null && (
                            <p className="pgs-package-price">
                              {formatCurrency(p.price)} <span>+ IVA</span>
                            </p>
                          )}
                          {p.description && <p className="pgs-package-desc">{p.description}</p>}
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
        )}

        {/* ── Preguntas frecuentes ─────────────────────────────────────── */}
        {shows('preguntas') && (
          <section id="preguntas" className="pgs-section is-paper" aria-labelledby="pgs-faq-title">
            <div className="pgs-wrap pgs-faq">
              <div className="pgs-faq-head" data-reveal>
                <Kicker index={numberOf('preguntas')} tone="paper">
                  Dudas
                </Kicker>
                <h2 id="pgs-faq-title" className="pgs-h2 is-ink">
                  Preguntas <em>frecuentes</em>
                </h2>
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
        )}
      </main>

      {/* ── Pie ────────────────────────────────────────────────────────── */}
      <footer className="pgs-footer">
        {site.instagramHandle && (
          <a className="pgs-follow" href={`https://instagram.com/${site.instagramHandle}`} target="_blank" rel="noopener noreferrer" data-reveal>
            <span className="pgs-follow-label">
              <Instagram className="pgs-inline-icon" />
              Síguenos en Instagram
            </span>
            <span className="pgs-follow-handle">@{site.instagramHandle}</span>
          </a>
        )}
        <div className="pgs-wrap pgs-footer-grid">
          <div className="pgs-footer-brand">
            <Crown className="pgs-brand-mark" />
            <p className="pgs-footer-name">
              {shortName}
              {title.edition && <span className="pgs-footer-edition">{title.edition}</span>}
            </p>
            <p className="pgs-muted">Organiza {site.organizer}</p>
          </div>
          {navItems.length > 0 && (
            <nav className="pgs-footer-nav" aria-label="Secciones (pie)">
              {sections.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          <div className="pgs-footer-contact">
            {site.whatsapp && (
              <a href={site.whatsapp.href} target="_blank" rel="noopener noreferrer">
                <Whatsapp className="pgs-inline-icon" />
                {site.whatsapp.label}
              </a>
            )}
            {site.contactEmail && (
              <a href={`mailto:${site.contactEmail}`}>
                <Mail className="pgs-inline-icon" />
                {site.contactEmail}
              </a>
            )}
            {site.instagramHandle && (
              <a href={`https://instagram.com/${site.instagramHandle}`} target="_blank" rel="noopener noreferrer">
                <Instagram className="pgs-inline-icon" />@{site.instagramHandle}
              </a>
            )}
            {site.registration && <a href={site.registration.href}>Postula al certamen</a>}
          </div>
        </div>
        <p className="pgs-footer-word" aria-hidden="true">
          {title.main}
        </p>
        <div className="pgs-wrap pgs-footer-legal">
          <p>
            © {title.edition ?? ''} {site.organizer}
          </p>
          <p>
            <a href="/politica-privacidad">Privacidad</a> · Producción gestionada con Aether
          </p>
        </div>
      </footer>

      {whatsappFloat && <WhatsappFloat href={whatsappFloat.href} label={whatsappFloat.label} />}

      {selected !== null && site.candidates[selected] && (
        <CandidateDialog candidates={site.candidates} index={selected} voting={site.voting} onNavigate={setSelected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
