'use client';

import { useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import type { PublicAcademySite } from '@/modules/academy/services/academy-site.service';
import { Arrow, Check, Instagram, Mail, Pin, Whatsapp } from '@/components/public/pageant/icons';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { startReveal } from '@/components/public/pageant/reveal';
import { AcademyCarousel } from './AcademyCarousel';
import { ACADEMY_SITE_STYLES } from './styles';

/**
 * Micrositio público de la academia: portada, quiénes somos, clases, cómo
 * funciona, horarios y mensualidad, carrusel de fotos, historia, preguntas y
 * contacto. Todo llega ya filtrado por `getPublicAcademySite` (campo por
 * campo); este componente solo presenta, y una sección aparece únicamente si
 * la academia escribió ese contenido. El texto que escribe la academia nunca
 * lleva tamaño fijo: se parte (`overflow-wrap`) o, el nombre, baja de tamaño según su largo.
 */

function whatsappLink(href: string, name: string): string {
  return `${href}?text=${encodeURIComponent(`Hola, quiero información sobre ${name}`)}`;
}

export function AcademySite({ site }: { site: PublicAcademySite }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    return root ? startReveal(root) : undefined;
  }, []);

  const { contact } = site;
  const enrollHref = site.enrollmentHref;
  const waHref = contact.whatsapp ? whatsappLink(contact.whatsapp.href, site.name) : null;
  const hasFee = site.monthlyFee != null && site.monthlyFee > 0;
  const hasPlan = site.groups.length > 0 || hasFee;
  const hasSteps = site.steps.length > 0;
  const hasStory = Boolean(site.history.trim() || site.director);
  const hasAbout = Boolean(site.intro.trim()) || site.studentCount != null || site.disciplines.length > 0;

  const nav: Array<{ id: string; label: string }> = [
    site.disciplines.length > 0 ? { id: 'clases', label: 'Clases' } : null,
    hasSteps || hasPlan ? { id: 'como-funciona', label: 'Cómo funciona' } : null,
    site.gallery.length > 0 ? { id: 'galeria', label: 'Galería' } : null,
    hasStory ? { id: 'historia', label: 'Historia' } : null,
    site.faq.length > 0 ? { id: 'preguntas', label: 'Preguntas' } : null,
    { id: 'contacto', label: 'Contacto' },
  ].filter((item): item is { id: string; label: string } => item !== null);

  const cta = enrollHref ? (
    <a className="acs-btn is-gold" href={enrollHref}>
      Inscríbete <Arrow className="acs-icon" />
    </a>
  ) : waHref ? (
    <a className="acs-btn is-gold" href={waHref} target="_blank" rel="noopener noreferrer">
      Escríbenos <Whatsapp className="acs-icon" />
    </a>
  ) : null;

  return (
    <div ref={rootRef} className={`acs ${PAGEANT_FONT_CLASSES}`}>
      <style>{ACADEMY_SITE_STYLES}</style>
      <a className="acs-skip" href="#contenido">
        Saltar al contenido
      </a>

      <header className="acs-top">
        <div className="acs-wrap acs-top-row">
          <a className="acs-brand" href="#inicio" aria-label={`${site.name}, inicio`} title={site.name} data-truncate>
            {site.name}
          </a>
          <nav className="acs-nav" aria-label="Secciones">
            {nav.map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
          </nav>
          {enrollHref ? (
            <a className="acs-btn is-gold" href={enrollHref}>
              Inscríbete
            </a>
          ) : waHref ? (
            <a className="acs-btn is-gold" href={waHref} target="_blank" rel="noopener noreferrer">
              Escríbenos
            </a>
          ) : null}
        </div>
      </header>

      <main id="contenido">
        {/* ── Portada ── */}
        <section id="inicio" className="acs-hero is-ink" aria-label={site.name}>
          {site.heroImageUrl && (
            <div className="acs-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={site.heroImageUrl} alt="" fetchPriority="high" decoding="async" />
            </div>
          )}
          <div className="acs-wrap acs-hero-body">
            {site.promo.trim() && <p className="acs-promo">{site.promo}</p>}
            <h1 className="acs-sr">{site.name}</h1>
            <p className="acs-hero-name" data-len={site.name.length > 48 ? 'lg' : site.name.length > 24 ? 'md' : 'sm'} aria-hidden="true">
              {site.name}
            </p>
            {site.tagline.trim() && <p className="acs-hero-tagline">{site.tagline}</p>}
            {cta && <div className="acs-actions">{cta}</div>}
          </div>
        </section>

        {/* ── Quiénes somos ── */}
        {hasAbout && (
          <section className="acs-section" aria-labelledby="acs-about-title">
            <div className="acs-wrap acs-about">
              <div data-reveal>
                <div className="acs-head">
                  <p className="acs-eyebrow">Quiénes somos</p>
                  <h2 id="acs-about-title" className="acs-title">
                    <em>Conócenos</em>
                  </h2>
                </div>
                {site.intro.trim() && <p className="acs-prose">{site.intro}</p>}
              </div>
              {(site.studentCount != null || site.disciplines.length > 0) && (
                <dl className="acs-stats" data-reveal>
                  {site.studentCount != null && (
                    <div className="acs-stat">
                      <dt>Alumnas</dt>
                      <dd>{site.studentCount}</dd>
                    </div>
                  )}
                  {site.disciplines.length > 0 && (
                    <div className="acs-stat">
                      <dt>{site.disciplines.length === 1 ? 'Clase' : 'Clases'}</dt>
                      <dd>{site.disciplines.length}</dd>
                    </div>
                  )}
                </dl>
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
                  Nuestras clases
                </h2>
              </div>
              <ul className="acs-grid">
                {site.disciplines.map((discipline, i) => (
                  <li key={`${discipline.title}-${i}`} className="acs-card" data-reveal>
                    <span className="acs-card-index">{String(i + 1).padStart(2, '0')}</span>
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
                  Cómo funciona
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
                <div className="acs-plan">
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
                      <h3>Mensualidad</h3>
                      <p className="acs-price">
                        {formatCurrency(site.monthlyFee ?? 0)}
                        <small>al mes</small>
                      </p>
                      {site.feeNote.trim() && <p>{site.feeNote}</p>}
                      {cta}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Beneficios ── */}
        {site.benefits.length > 0 && (
          <section className="acs-section is-ink" aria-labelledby="acs-ben-title">
            <div className="acs-wrap">
              <div className="acs-head" data-reveal>
                <p className="acs-eyebrow">Al ser parte</p>
                <h2 id="acs-ben-title" className="acs-title">
                  Lo que <em>recibes</em>
                </h2>
              </div>
              <ul className="acs-benefits">
                {site.benefits.map((benefit, i) => (
                  <li key={`${benefit}-${i}`} data-reveal>
                    <Check className="acs-icon" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
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

        {/* ── Historia y directora ── */}
        {hasStory && (
          <section id="historia" className="acs-section is-alt" aria-labelledby="acs-hist-title">
            <div className={`acs-wrap acs-story${site.director ? ' has-director' : ''}`}>
              {site.history.trim() && (
                <div data-reveal>
                  <div className="acs-head">
                    <p className="acs-eyebrow">Nuestra historia</p>
                    <h2 id="acs-hist-title" className="acs-title">
                      Cómo <em>empezamos</em>
                    </h2>
                  </div>
                  <p className="acs-prose">{site.history}</p>
                </div>
              )}
              {site.director && (
                <aside className="acs-director" data-reveal aria-label="Dirección de la academia">
                  {site.director.photoUrl && (
                    <div className="acs-director-photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={site.director.photoUrl} alt={site.director.name || 'Dirección de la academia'} loading="lazy" decoding="async" />
                    </div>
                  )}
                  {site.director.name.trim() && <h3>{site.director.name}</h3>}
                  {site.director.role.trim() && <p className="acs-director-role">{site.director.role}</p>}
                  {site.director.bio.trim() && <p>{site.director.bio}</p>}
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
                  Preguntas frecuentes
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
        {cta && (
          <section className="acs-section is-ink" aria-labelledby="acs-final-title">
            <div className="acs-wrap acs-cta" data-reveal>
              <h2 id="acs-final-title" className="acs-title">
                Empieza tu camino <em>hoy</em>
              </h2>
              <div className="acs-actions">
                {cta}
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
          <div className="acs-footer-grid">
            <p className="acs-footer-name">{site.name}</p>
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
          <p className="acs-legal">
            © {new Date().getFullYear()} {site.organizer}
          </p>
        </div>
      </footer>

      {contact.whatsapp && waHref && (
        <a className="acs-wa" href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" title="Escríbenos por WhatsApp">
          <Whatsapp />
        </a>
      )}
    </div>
  );
}
