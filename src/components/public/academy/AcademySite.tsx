'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import type { PublicAcademySite } from '@/modules/academy/services/academy-site.service';
import { Arrow, Instagram, Mail, Pin, Whatsapp } from '@/components/public/pageant/icons';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { startReveal } from '@/components/public/pageant/reveal';
import { AcademyCarousel } from './AcademyCarousel';
import { ACADEMY_SITE_STYLES } from './styles';

/**
 * Micrositio público de la academia, con lenguaje editorial de moda: portada a
 * pantalla completa con cifras, cinta de disciplinas, quiénes somos con
 * collage, clases (con foto si la tienen), cómo funciona, horarios y
 * mensualidad, lo que recibe una alumna, galería con foto ampliada,
 * testimonios, historia con hitos y dirección, preguntas y cierre.
 *
 * Todo llega ya filtrado por `getPublicAcademySite` (campo por campo); este
 * componente solo presenta, y una sección aparece únicamente si la academia
 * escribió ese contenido: nada se rellena con datos inventados. El texto de la
 * academia nunca lleva tamaño fijo: se parte (`overflow-wrap`) y el nombre baja
 * de tamaño según su largo.
 */

function whatsappLink(href: string, name: string): string {
  return `${href}?text=${encodeURIComponent(`Hola, quiero información sobre ${name}`)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Pausa las animaciones continuas (portada, cinta) cuando salen de pantalla: atributo, no clase (React es dueño de `className`). */
function useOffscreenPause(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
    });
    root.querySelectorAll('.acs-hero, .acs-ribbon').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);
}

export function AcademySite({ site }: { site: PublicAcademySite }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    return root ? startReveal(root) : undefined;
  }, []);
  useOffscreenPause(rootRef);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const { contact } = site;
  const enrollHref = site.enrollmentHref;
  const waHref = contact.whatsapp ? whatsappLink(contact.whatsapp.href, site.name) : null;
  const hasFee = site.monthlyFee != null && site.monthlyFee > 0;
  const hasPlan = site.groups.length > 0 || hasFee;
  const hasSteps = site.steps.length > 0;
  const hasStory = Boolean(site.history.trim() || site.director || site.milestones.length > 0);
  const collage = site.gallery.slice(0, 2);
  const hasAbout = Boolean(site.intro.trim());
  const heroStats = [
    ...site.highlights,
    ...(site.studentCount != null ? [{ value: String(site.studentCount), label: site.studentCount === 1 ? 'alumna' : 'alumnas' }] : []),
  ].slice(0, 4);
  // La cinta repite las disciplinas hasta cubrir una pantalla ancha; es decorativa (las clases reales están más abajo).
  const ribbonItems = site.disciplines.length > 0 ? Array.from({ length: Math.max(2, Math.ceil(10 / site.disciplines.length)) }, () => site.disciplines.map((d) => d.title)).flat() : [];
  const nameLen = site.name.length > 48 ? 'lg' : site.name.length > 22 ? 'md' : 'sm';

  const nav: Array<{ id: string; label: string }> = [
    hasAbout ? { id: 'nosotros', label: 'Nosotros' } : null,
    site.disciplines.length > 0 ? { id: 'clases', label: 'Clases' } : null,
    hasSteps || hasPlan ? { id: 'como-funciona', label: 'Cómo funciona' } : null,
    site.gallery.length > 0 ? { id: 'galeria', label: 'Galería' } : null,
    hasStory ? { id: 'historia', label: 'Historia' } : null,
    site.faq.length > 0 ? { id: 'preguntas', label: 'Preguntas' } : null,
    { id: 'contacto', label: 'Contacto' },
  ].filter((item): item is { id: string; label: string } => item !== null);

  const primaryCta = enrollHref
    ? { href: enrollHref, label: 'Inscríbete', external: false }
    : waHref
      ? { href: waHref, label: 'Escríbenos', external: true }
      : null;
  const cta = (tone: 'acc' | 'ink' = 'acc') =>
    primaryCta ? (
      <a className={`acs-btn is-${tone}`} href={primaryCta.href} {...(primaryCta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {primaryCta.label} <Arrow className="acs-icon" />
      </a>
    ) : null;
  const firstInstagram = contact.instagrams[0] ?? null;

  return (
    <div ref={rootRef} className={`acs ${PAGEANT_FONT_CLASSES}`} data-accent={site.accent}>
      <style>{ACADEMY_SITE_STYLES}</style>
      <a className="acs-skip" href="#contenido">
        Saltar al contenido
      </a>

      {/* ── Barra superior ── */}
      <header className="acs-top" data-solid={solid || undefined}>
        <div className="acs-wrap acs-top-row">
          <a className="acs-brand" href="#inicio" aria-label={`${site.name}, inicio`}>
            {site.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.logoUrl} alt="" />
            )}
            <span className="acs-brand-name" title={site.name} data-truncate>
              {site.name}
            </span>
          </a>
          <nav className="acs-nav" aria-label="Secciones">
            {/* En la barra caben las secciones de contenido; «Nosotros» y «Contacto» quedan en el menú y el pie. */}
            {nav.filter((item) => item.id !== 'nosotros' && item.id !== 'contacto').map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="acs-top-actions">
            {primaryCta && (
              <a className="acs-btn is-acc" href={primaryCta.href} {...(primaryCta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {primaryCta.label}
              </a>
            )}
            <button type="button" className="acs-burger" aria-label="Abrir el menú" aria-expanded={menuOpen} aria-controls="acs-menu" onClick={() => setMenuOpen(true)}>
              <span />
            </button>
          </div>
        </div>
      </header>

      <div id="acs-menu" className="acs-menu" hidden={!menuOpen} role="dialog" aria-modal="true" aria-label="Menú">
        <div className="acs-wrap acs-menu-head">
          <span className="acs-brand-name" title={site.name} data-truncate>
            {site.name}
          </span>
          <button type="button" className="acs-menu-close" aria-label="Cerrar el menú" onClick={() => setMenuOpen(false)}>
            ×
          </button>
        </div>
        <nav className="acs-wrap acs-menu-links" aria-label="Secciones (menú)">
          {nav.map((item) => (
            <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="acs-wrap acs-menu-foot">{cta()}</div>
      </div>

      <main id="contenido">
        {/* ── Portada ── */}
        <section id="inicio" className={`acs-hero${site.heroImageUrl ? '' : ' no-photo'}`} aria-labelledby="acs-name">
          {site.heroImageUrl && (
            <div className="acs-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={site.heroImageUrl} alt="" fetchPriority="high" decoding="async" />
            </div>
          )}
          <div className="acs-wrap acs-hero-body">
            {site.promo.trim() && (
              <p className="acs-promo">
                <span className="acs-promo-tag">Promoción</span>
                {site.promo}
              </p>
            )}
            <h1 id="acs-name" className="acs-hero-name" data-len={nameLen}>
              {site.name}
            </h1>
            {site.tagline.trim() && <p className="acs-hero-tagline">{site.tagline}</p>}
            {(primaryCta || site.disciplines.length > 0) && (
              <div className="acs-actions">
                {cta()}
                {site.disciplines.length > 0 && (
                  <a className="acs-btn is-line" href="#clases">
                    Ver las clases
                  </a>
                )}
              </div>
            )}
          </div>
          {heroStats.length > 0 && (
            <div className="acs-wrap">
              <dl className="acs-hero-stats">
                {heroStats.map((stat, i) => (
                  <div key={`${stat.label}-${i}`} className="acs-hero-stat">
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        {/* ── Cinta de disciplinas (decorativa) ── */}
        {ribbonItems.length > 0 && (
          <div className="acs-ribbon" aria-hidden="true">
            <div className="acs-ribbon-track">
              {[0, 1].map((copy) => (
                <div key={copy} className="acs-ribbon-group">
                  {ribbonItems.map((title, i) => (
                    <span key={`${copy}-${i}`} className="acs-ribbon-item">
                      {title}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Quiénes somos ── */}
        {hasAbout && (
          <section id="nosotros" className="acs-section" aria-labelledby="acs-about-title">
            <div className={`acs-wrap acs-about${collage.length > 0 ? ' has-media' : ''}`}>
              <div data-reveal>
                <div className="acs-head">
                  <p className="acs-eyebrow">Quiénes somos</p>
                  <h2 id="acs-about-title" className="acs-title">
                    {site.aboutTitle}
                  </h2>
                </div>
                <p className="acs-prose is-lede">{site.intro}</p>
                {primaryCta && <div className="acs-actions" style={{ marginTop: '2rem' }}>{cta('ink')}</div>}
              </div>
              {collage.length > 0 && (
                <div className={`acs-collage${collage.length === 1 ? ' is-single' : ''}`} data-reveal>
                  {collage.map((photo, i) => (
                    <div key={`${photo.url}-${i}`} className={`acs-collage-photo ${i === 0 ? 'is-main' : 'is-side'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.caption || `${site.name}, foto ${i + 1}`} loading="lazy" decoding="async" />
                    </div>
                  ))}
                  {site.disciplines.length > 0 && (
                    <p className="acs-collage-badge">
                      <strong>{site.disciplines.length}</strong>
                      <span>{site.disciplines.length === 1 ? 'disciplina' : 'disciplinas'}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Clases ── */}
        {site.disciplines.length > 0 && (
          <section id="clases" className="acs-section is-ink" aria-labelledby="acs-clases-title">
            <div className="acs-wrap">
              <div className="acs-head" data-reveal>
                <p className="acs-eyebrow">Lo que aprenderás</p>
                <h2 id="acs-clases-title" className="acs-title">
                  Nuestras <em>clases</em>
                </h2>
              </div>
              <ul className="acs-classes">
                {site.disciplines.map((discipline, i) => (
                  <li key={`${discipline.title}-${i}`} className={`acs-class${discipline.photoUrl ? ' has-photo' : ''}`} data-reveal>
                    {discipline.photoUrl && (
                      <div className="acs-class-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={discipline.photoUrl} alt="" loading="lazy" decoding="async" />
                      </div>
                    )}
                    <span className="acs-class-index">{String(i + 1).padStart(2, '0')}</span>
                    <h3>{discipline.title}</h3>
                    {discipline.text.trim() && <p>{discipline.text}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Cómo funciona, horarios y mensualidad ── */}
        {(hasSteps || hasPlan) && (
          <section id="como-funciona" className="acs-section is-alt" aria-labelledby="acs-como-title">
            <div className="acs-wrap">
              <div className="acs-head is-center" data-reveal>
                <p className="acs-eyebrow">Paso a paso</p>
                <h2 id="acs-como-title" className="acs-title">
                  Cómo <em>funciona</em>
                </h2>
              </div>
              {hasSteps && (
                <ol className="acs-steps">
                  {site.steps.map((step, i) => (
                    <li key={`${step.title}-${i}`} className="acs-step" data-reveal>
                      <span className="acs-step-n">{i + 1}</span>
                      <h3>{step.title}</h3>
                      {step.text.trim() && <p>{step.text}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {hasPlan && (
                <div className={`acs-plan${site.groups.length > 0 && hasFee ? ' is-double' : ''}`}>
                  {site.groups.length > 0 && (
                    <div className="acs-box" data-reveal>
                      <h3>Grupos y horarios</h3>
                      <ul className="acs-schedule">
                        {site.groups.map((group, i) => (
                          <li key={`${group.name}-${i}`}>
                            <strong>{group.name}</strong>
                            {group.schedule && <span>{group.schedule}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {hasFee && (
                    <div className="acs-box is-fee" data-reveal>
                      <p className="acs-eyebrow">Mensualidad</p>
                      <p className="acs-price">
                        {formatCurrency(site.monthlyFee ?? 0)}
                        <small>al mes</small>
                      </p>
                      {site.feeNote.trim() && <p>{site.feeNote}</p>}
                      {cta()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Lo que recibes ── */}
        {site.benefits.length > 0 && (
          <section className="acs-section is-ink" aria-labelledby="acs-ben-title">
            <div className="acs-wrap acs-benefits-wrap">
              <div className="acs-head" data-reveal>
                <p className="acs-eyebrow">Al ser parte</p>
                <h2 id="acs-ben-title" className="acs-title">
                  Lo que <em>recibes</em>
                </h2>
                {primaryCta && <div className="acs-actions" style={{ marginTop: '1rem' }}>{cta()}</div>}
              </div>
              <ol className="acs-benefits">
                {site.benefits.map((benefit, i) => (
                  <li key={`${benefit}-${i}`} data-reveal>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* ── Galería ── */}
        {site.gallery.length > 0 && (
          <section id="galeria" className="acs-section" aria-labelledby="acs-gal-title">
            <div className="acs-wrap">
              <div className="acs-head" data-reveal>
                <p className="acs-eyebrow">Nuestra gente</p>
                <h2 id="acs-gal-title" className="acs-title">
                  Galería
                </h2>
              </div>
              <div data-reveal>
                <AcademyCarousel photos={site.gallery} label={`Fotos de ${site.name}`} />
              </div>
            </div>
          </section>
        )}

        {/* ── Testimonios ── */}
        {site.testimonials.length > 0 && (
          <section className="acs-section is-alt" aria-labelledby="acs-quotes-title">
            <div className="acs-wrap">
              <div className="acs-head is-center" data-reveal>
                <p className="acs-eyebrow">Testimonios</p>
                <h2 id="acs-quotes-title" className="acs-title">
                  Lo que dicen <em>de nosotros</em>
                </h2>
              </div>
              <div className="acs-quotes">
                {site.testimonials.map((t, i) => (
                  <figure key={`${t.name}-${i}`} className="acs-quote" data-reveal>
                    <blockquote>{t.text}</blockquote>
                    <figcaption>
                      <span className="acs-avatar" aria-hidden="true">
                        {t.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.photoUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          initials(t.name)
                        )}
                      </span>
                      <span className="acs-quote-who">
                        <strong>{t.name}</strong>
                        {t.role.trim() && <span>{t.role}</span>}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Historia, hitos y dirección ── */}
        {hasStory && (
          <section id="historia" className={`acs-section${site.testimonials.length > 0 ? '' : ' is-alt'}`} aria-labelledby="acs-hist-title">
            <div className={`acs-wrap acs-story${site.director ? ' has-side' : ''}`}>
              <div data-reveal>
                <div className="acs-head">
                  <p className="acs-eyebrow">Nuestra historia</p>
                  <h2 id="acs-hist-title" className="acs-title">
                    Cómo <em>empezamos</em>
                  </h2>
                </div>
                {site.history.trim() && <p className="acs-prose">{site.history}</p>}
                {site.milestones.length > 0 && (
                  <ol className="acs-timeline" aria-label="Hitos">
                    {site.milestones.map((m, i) => (
                      <li key={`${m.year}-${i}`}>
                        <strong>{m.year}</strong>
                        <span>{m.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {site.director && (
                <aside className="acs-director" data-reveal aria-label="Dirección de la academia">
                  {site.director.photoUrl && (
                    <div className="acs-director-photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={site.director.photoUrl} alt={site.director.name || 'Dirección de la academia'} loading="lazy" decoding="async" />
                    </div>
                  )}
                  <div className="acs-director-card">
                    {site.director.role.trim() && <p className="acs-director-role">{site.director.role}</p>}
                    {site.director.name.trim() && <h3>{site.director.name}</h3>}
                    {site.director.bio.trim() && <p>{site.director.bio}</p>}
                  </div>
                </aside>
              )}
            </div>
          </section>
        )}

        {/* ── Preguntas frecuentes ── */}
        {site.faq.length > 0 && (
          <section id="preguntas" className="acs-section" aria-labelledby="acs-faq-title">
            <div className="acs-wrap">
              <div className="acs-head is-center" data-reveal>
                <p className="acs-eyebrow">Resolvemos tus dudas</p>
                <h2 id="acs-faq-title" className="acs-title">
                  Preguntas <em>frecuentes</em>
                </h2>
              </div>
              <div className="acs-faq">
                {site.faq.map((item, i) => (
                  <details key={`${item.question}-${i}`} data-reveal>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Cierre ── */}
        {primaryCta && (
          <section className="acs-final" aria-labelledby="acs-final-title">
            {site.heroImageUrl && (
              <div className="acs-final-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={site.heroImageUrl} alt="" loading="lazy" decoding="async" />
              </div>
            )}
            <div className="acs-wrap" data-reveal>
              <p className="acs-eyebrow">Tu momento es ahora</p>
              <h2 id="acs-final-title" className="acs-title">
                Empieza tu camino <em>hoy</em>
              </h2>
              <div className="acs-actions">
                {cta()}
                {enrollHref && waHref && (
                  <a className="acs-btn is-line" href={waHref} target="_blank" rel="noopener noreferrer">
                    Escríbenos <Whatsapp className="acs-icon" />
                  </a>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ── Pie y contacto ── */}
      <footer id="contacto" className="acs-footer">
        <div className="acs-wrap">
          {firstInstagram && (
            <a className="acs-follow" href={firstInstagram.href} target="_blank" rel="noopener noreferrer">
              <span className="acs-follow-label">
                <Instagram className="acs-icon" />
                Síguenos en Instagram
              </span>
              <span className="acs-follow-handle">@{firstInstagram.handle}</span>
            </a>
          )}
          <div className="acs-footer-grid">
            <div className="acs-footer-brand">
              {site.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={site.logoUrl} alt={site.name} loading="lazy" />
              )}
              <p className="acs-footer-name">{site.name}</p>
              {site.tagline.trim() && <p className="acs-footer-tagline">{site.tagline}</p>}
            </div>
            <div>
              <p className="acs-footer-title">Secciones</p>
              <nav className="acs-footer-links" aria-label="Secciones (pie)">
                {nav.map((item) => (
                  <a key={item.id} href={`#${item.id}`}>
                    {item.label}
                  </a>
                ))}
                {enrollHref && <a href={enrollHref}>Inscripción</a>}
              </nav>
            </div>
            <div>
              <p className="acs-footer-title">Contacto</p>
              <div className="acs-contact">
                {contact.whatsapp && (
                  <a href={contact.whatsapp.href} target="_blank" rel="noopener noreferrer">
                    <Whatsapp className="acs-icon" />
                    {contact.whatsapp.label}
                  </a>
                )}
                {contact.email && (
                  <a href={`mailto:${contact.email}`}>
                    <Mail className="acs-icon" />
                    {contact.email}
                  </a>
                )}
                {contact.instagrams.map((instagram) => (
                  <a key={instagram.handle} href={instagram.href} target="_blank" rel="noopener noreferrer">
                    <Instagram className="acs-icon" />@{instagram.handle}
                  </a>
                ))}
                {contact.address && (
                  <span>
                    <Pin className="acs-icon" />
                    {contact.address}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="acs-legal">
            © {new Date().getFullYear()} {site.organizer}
          </p>
        </div>
      </footer>

      {waHref && (
        <a className="acs-wa" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" title="Escríbenos por WhatsApp">
          <Whatsapp />
        </a>
      )}
    </div>
  );
}
