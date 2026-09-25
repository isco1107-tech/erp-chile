'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { getCandidateRegistrationProjectAction } from '@/modules/candidates/actions/public-registration.actions';
import type { RegistrationProjectInfo } from '@/modules/candidates/services/candidates.service';
import { CONFIG } from '@/modules/candidates/registration-config';
import { galaDateParts, registrationProcess, shortDate, splitPageantTitle, whatsappGreeting, whatsappMessageUrl } from '@/lib/events/pageant-site';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { Arrow, Calendar, Check, Crown, Instagram, Mail, Tiara, Whatsapp } from '@/components/public/pageant/icons';
import { HeroSky, pad } from '@/components/public/pageant/parts';
import { PAGEANT_SITE_STYLES } from '@/components/public/pageant/styles';
import { CandidateApplicationForm } from '@/components/public/pageant/CandidateApplicationForm';
import { WhatsappFloat } from '@/components/public/pageant/WhatsappFloat';
import { REGISTRATION_STYLES } from './registration-styles';

/**
 * Página pública de inscripción de candidatas (`/register/candidate/[token]`),
 * con la identidad visual del micrositio del certamen. Estructura de la
 * convocatoria: preselección, "Así es el proceso", "Qué incluye tu
 * inscripción" y el formulario con solo 8 datos (nombre, RUT, edad, comuna,
 * teléfono, correo, Instagram y por qué quiere participar).
 *
 * Todo lo visible sale del certamen (nombre, cupo, beneficios, contacto):
 * nada fijo de la plataforma. El token aleatorio del link es la
 * autenticación de la página.
 */

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = target.getTime() - now;
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

/** Revelado al hacer scroll; sin IntersectionObserver o con movimiento reducido, todo se ve de inmediato. */
function useScrollReveal(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const root = document.querySelector<HTMLElement>('.pgs');
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (!root || nodes.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      for (const node of nodes) node.classList.add('is-in');
      return;
    }
    root.dataset.motion = 'on';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
}

export default function CandidateRegistrationClient({ token }: { token: string }) {
  const [project, setProject] = useState<RegistrationProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getCandidateRegistrationProjectAction(token);
      if (result.success) setProject(result.data);
      else setNotFound(true);
      setLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closesAt = useMemo(() => (project?.registrationClosesAt ? new Date(project.registrationClosesAt) : null), [project]);
  const countdown = useCountdown(closesAt);
  useScrollReveal(!loading && Boolean(project?.isOpen));

  const accent = project?.accent ?? 'gold';

  if (loading) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen" role="status">
          <span className="cand-spinner" aria-hidden="true" />
          <p className="cand-screen-text">Cargando la convocatoria…</p>
        </main>
      </RegistrationShell>
    );
  }

  if (notFound || !project) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen">
          <HeroSky />
          <div className="cand-screen-inner">
            <Tiara className="pgs-tiara" />
            <h1 className="cand-screen-title">Link no disponible</h1>
            <p className="cand-screen-text">Este link de inscripción no existe o ya no está vigente. Pide uno nuevo a la organización del certamen.</p>
          </div>
        </main>
      </RegistrationShell>
    );
  }

  const privacyHref = `${CONFIG.privacidadUrl}?certamen=${encodeURIComponent(token)}`;
  const contact = project.contact;
  const hasContact = Boolean(contact.email || contact.whatsapp || contact.instagram);
  const title = splitPageantTitle(project.projectName);
  const shortName = [title.lead, title.main].filter(Boolean).join(' ');
  const titleFit = { '--pgs-fit': Math.max(title.main.length, 6) * 0.64 } as CSSProperties;
  const whatsappFloat = contact.whatsapp ? <WhatsappFloat href={whatsappMessageUrl(contact.whatsapp.href, whatsappGreeting('candidata', project.projectName))} label="Escríbenos por WhatsApp" /> : null;

  if (!project.isOpen) {
    return (
      <RegistrationShell accent={accent}>
        <main className="cand-screen">
          <HeroSky />
          <div className="cand-screen-inner">
            <Tiara className="pgs-tiara" />
            <p className="pgs-eyebrow">{shortName}</p>
            <h1 className="cand-screen-title">Convocatoria cerrada</h1>
            <p className="cand-screen-text">{project.closedReason ?? 'Esta convocatoria no está recibiendo postulaciones por el momento.'}</p>
            {hasContact && <ContactLinks contact={contact} />}
          </div>
        </main>
        {whatsappFloat}
      </RegistrationShell>
    );
  }

  const gala = project.galaDate ? galaDateParts(new Date(project.galaDate).toISOString()) : null;
  const closesLabel = project.registrationClosesAt ? shortDate(new Date(project.registrationClosesAt).toISOString()) : null;
  const steps = registrationProcess({ name: project.projectName, maxCandidates: project.maxCandidates });

  return (
    <RegistrationShell accent={accent}>
      <a className="pgs-skip" href="#inscripcion">
        Ir al formulario
      </a>

      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header className={`pgs-top${navScrolled ? ' is-solid' : ''}`}>
        <a className="pgs-brand" href="#top" aria-label={`${project.projectName}, inicio`}>
          <Crown className="pgs-brand-mark" />
          <span className="pgs-brand-name">
            {title.lead && <span className="pgs-brand-lead">{title.lead} </span>}
            {title.main}
          </span>
        </a>
        <div className="pgs-top-actions">
          <a className="pgs-btn is-gold is-small" href="#inscripcion">
            <span>Inscribirme</span>
          </a>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section id="top" className="pgs-hero" aria-labelledby="cand-title">
        <HeroSky />
        <div className="pgs-hero-inner">
          <Tiara className="pgs-tiara" />
          <p className="pgs-hero-eyebrow pgs-rise cand-eyebrow-live" style={{ animationDelay: '0.2s' }}>
            <span className="pgs-live-dot" aria-hidden="true" />
            Convocatoria abierta
          </p>
          <h1 id="cand-title" className="pgs-title" style={titleFit}>
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
          <p className="pgs-tagline pgs-rise" style={{ animationDelay: '0.66s' }}>
            {project.tagline ?? CONFIG.heroBajada}
          </p>
          {(closesLabel || gala) && (
            <p className="pgs-hero-meta pgs-rise" style={{ animationDelay: '0.76s' }}>
              {closesLabel && (
                <span>
                  <Calendar className="pgs-inline-icon" />
                  Inscripciones hasta el {closesLabel}
                </span>
              )}
              {gala && (
                <span>
                  <Crown className="pgs-inline-icon" />
                  Gala · {gala.short}
                  {project.venueName && <span className="pgs-lg"> · {project.venueName}</span>}
                </span>
              )}
            </p>
          )}
          {countdown && (
            <div className="cand-countdown pgs-rise" style={{ animationDelay: '0.86s' }}>
              <p className="cand-countdown-label">Las inscripciones cierran en</p>
              <div className="pgs-countdown" role="timer" aria-label="Tiempo para el cierre de inscripciones">
                {(
                  [
                    ['Días', 'Días', countdown.days],
                    ['Horas', 'Hrs', countdown.hours],
                    ['Minutos', 'Min', countdown.minutes],
                    ['Segundos', 'Seg', countdown.seconds],
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
            </div>
          )}
          <div className="pgs-hero-ctas pgs-rise" style={{ animationDelay: '0.96s' }}>
            <a className="pgs-btn is-gold" href="#inscripcion">
              <span>Quiero inscribirme</span>
              <Arrow className="pgs-btn-icon" />
            </a>
          </div>
        </div>
      </section>

      <main>
        <section className="pgs-section is-night is-deep" aria-labelledby="cand-process-title">
          <div className="pgs-wrap">
            {/* ── Preselección ─────────────────────────────────────────── */}
            <div className="pgs-callout" data-reveal>
              <span className="pgs-callout-mark" aria-hidden="true">
                <Crown />
              </span>
              <div>
                <p className="pgs-callout-title">Preselección</p>
                <p>
                  {project.maxCandidates ? (
                    <>
                      Solo <strong>{project.maxCandidates} candidatas</strong> serán escogidas.{' '}
                    </>
                  ) : null}
                  Inscríbete en el formulario y espera el llamado, correo o WhatsApp de la organización con el resultado de tu preselección.
                </p>
              </div>
            </div>

            {/* ── Así es el proceso ────────────────────────────────────── */}
            <div className="pgs-section-head is-center pgs-subhead" data-reveal>
              <p className="pgs-eyebrow">Tu camino a la corona</p>
              <h2 id="cand-process-title" className="pgs-h2">
                Así es <em>el proceso</em>
              </h2>
            </div>
            <ol className="pgs-steps" data-reveal>
              {steps.map((step, i) => (
                <li key={step.title}>
                  <span className="pgs-steps-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pgs-steps-title">{step.title}</span>
                  <span className="pgs-steps-detail">{step.detail}</span>
                </li>
              ))}
            </ol>

            {/* ── Qué incluye ──────────────────────────────────────────── */}
            {project.benefits.length > 0 && (
              <>
                <div className="pgs-section-head is-center pgs-subhead" data-reveal>
                  <p className="pgs-eyebrow">Qué incluye tu inscripción</p>
                  <h2 className="pgs-h2">
                    Formación profesional <em>antes de tu competencia</em>
                  </h2>
                </div>
                <ul className="pgs-includes" data-reveal>
                  {project.benefits.map((benefit) => (
                    <li key={benefit}>
                      <span className="pgs-check" aria-hidden="true">
                        <Check />
                      </span>
                      {benefit}
                    </li>
                  ))}
                </ul>
                {project.classesNote && (
                  <p className="pgs-note" data-reveal>
                    <strong>Lugar y horario de clases:</strong> {project.classesNote}
                  </p>
                )}
              </>
            )}

            {/* ── Formulario ───────────────────────────────────────────── */}
            <div id="inscripcion" className="pgs-lead" data-reveal>
              <div className="pgs-lead-intro">
                <p className="pgs-eyebrow is-ink">Postula ahora</p>
                <h2 className="pgs-h3 is-ink">
                  Formulario de <em>inscripción</em>
                </h2>
                <p>
                  Completa tus datos y espera el llamado, correo o WhatsApp de la organización con el resultado de tu preselección
                  {project.maxCandidates ? ` (solo ${project.maxCandidates} candidatas)` : ''}.
                </p>
              </div>
              <CandidateApplicationForm token={token} minAge={project.minCandidateAge} privacyHref={privacyHref} />
            </div>
          </div>
        </section>
      </main>

      {/* ── Pie ────────────────────────────────────────────────────────── */}
      <footer className="pgs-footer">
        {contact.instagram && (
          <a className="pgs-follow" href={contact.instagram.href} target="_blank" rel="noopener noreferrer">
            <span className="pgs-follow-label">
              <Instagram className="pgs-inline-icon" />
              Síguenos en Instagram
            </span>
            <span className="pgs-follow-handle">@{contact.instagram.handle}</span>
          </a>
        )}
        <div className="pgs-wrap pgs-footer-grid">
          <div className="pgs-footer-brand">
            <Crown className="pgs-brand-mark" />
            <p className="pgs-footer-name">
              {shortName}
              {title.edition && <span className="pgs-footer-edition">{title.edition}</span>}
            </p>
            <p className="pgs-muted">Convocatoria oficial de inscripción</p>
          </div>
          <div className="pgs-footer-contact">
            {contact.whatsapp && (
              <a href={contact.whatsapp.href} target="_blank" rel="noopener noreferrer">
                <Whatsapp className="pgs-inline-icon" />
                {contact.whatsapp.label}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`}>
                <Mail className="pgs-inline-icon" />
                {contact.email}
              </a>
            )}
            {CONFIG.basesUrl && (
              <a href={CONFIG.basesUrl} target="_blank" rel="noopener noreferrer">
                Bases del certamen
              </a>
            )}
            <a href={privacyHref} target="_blank" rel="noopener noreferrer">
              Política de privacidad
            </a>
          </div>
        </div>
        <p className="pgs-footer-word" aria-hidden="true">
          {title.main}
        </p>
        <div className="pgs-wrap pgs-footer-legal">
          <p>
            © {title.edition ?? ''} {shortName}
          </p>
          <p>
            <a href={privacyHref}>Privacidad</a>
          </p>
        </div>
      </footer>

      {whatsappFloat}
    </RegistrationShell>
  );
}

/** Contenedor con la identidad del certamen (mismas fuentes y estilos que su micrositio). */
function RegistrationShell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div className={`pgs cand ${PAGEANT_FONT_CLASSES}`} data-accent={accent}>
      <style>{PAGEANT_SITE_STYLES}</style>
      <style>{REGISTRATION_STYLES}</style>
      {children}
    </div>
  );
}

/** Contacto del certamen (configurado en la convocatoria): solo los canales que existen. */
function ContactLinks({ contact }: { contact: RegistrationProjectInfo['contact'] }) {
  return (
    <span className="cand-contact">
      {contact.whatsapp && (
        <a href={contact.whatsapp.href} target="_blank" rel="noreferrer">
          <Whatsapp className="pgs-inline-icon" /> WhatsApp
        </a>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`}>
          <Mail className="pgs-inline-icon" /> {contact.email}
        </a>
      )}
      {contact.instagram && (
        <a href={contact.instagram.href} target="_blank" rel="noreferrer">
          <Instagram className="pgs-inline-icon" /> @{contact.instagram.handle}
        </a>
      )}
    </span>
  );
}
