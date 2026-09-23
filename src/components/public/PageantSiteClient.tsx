'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/chile/tax';
import { PublicButton, PublicField, PublicPage, IconCheck } from '@/components/public/PublicShell';
import { publicSponsorLeadSchema, SPONSOR_LEAD_HONEYPOT_FIELD } from '@/modules/crm/schema';
import type { PublicPageantCandidate, PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Micrositio público de un certamen: la cara del evento hacia el público,
 * las marcas y las postulantes. Reutiliza el sistema visual público
 * (`PublicShell`: fondo aurora, vidrio, acentos) con una capa propia de
 * landing (`pg-*`) — secciones anchas, galería de candidatas, podio.
 *
 * Todo lo que recibe ya viene filtrado por `getPublicPageantSite`: este
 * componente no decide qué es publicable, solo lo presenta.
 */

function useCountdown(target: string | null): { days: number; hours: number; minutes: number; seconds: number } | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!target || now === null) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return null;
  const total = Math.floor(diff / 1000);
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

function galaDateLabel(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

function CandidateModal({ candidate, voteHref, onClose }: { candidate: PublicPageantCandidate; voteHref: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="pub-dialog-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="pg-modal-title">
        <button type="button" className="pg-modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <div className="pg-modal-photo">
          {candidate.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={candidate.photoUrl} alt={candidate.name} />
          ) : (
            <span className="pg-initial" aria-hidden="true">{candidate.name.charAt(0)}</span>
          )}
        </div>
        <div className="pg-modal-body">
          {candidate.number != null && <p className="pub-eyebrow">Candidata N° {candidate.number}</p>}
          <h2 id="pg-modal-title" className="pg-modal-name">{candidate.name}</h2>
          {candidate.representing && <p className="pg-modal-rep">Representa a {candidate.representing}</p>}
          {candidate.isWinner && <p className="pg-crown-tag">Ganadora</p>}
          {!candidate.isWinner && candidate.isFinalist && <p className="pg-crown-tag is-soft">Finalista</p>}
          {candidate.bio && <p className="pg-modal-bio">{candidate.bio}</p>}
          {voteHref && (
            <a className="pub-btn is-primary pg-cta" href={`${voteHref}?candidata=${encodeURIComponent(candidate.id)}`}>
              <span>Votar por {candidate.name.split(' ')[0]}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SponsorLeadForm({ slug, packages }: { slug: string; packages: PublicPageantSite['packages'] }) {
  const [values, setValues] = useState({ companyName: '', contactName: '', jobTitle: '', email: '', phone: '', packageId: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [serverError, setServerError] = useState('');
  const honeypot = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');
    const payload = { ...values, [SPONSOR_LEAD_HONEYPOT_FIELD]: honeypot.current?.value ?? '' };
    const parsed = publicSponsorLeadSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setStatus('sending');
    try {
      const res = await fetch(`/api/public/pageants/${encodeURIComponent(slug)}/sponsor-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setServerError(json.error ?? 'No pudimos enviar tu solicitud');
        setStatus('idle');
        return;
      }
      setStatus('sent');
    } catch {
      setServerError('No pudimos enviar tu solicitud. Revisa tu conexión e intenta de nuevo.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="pg-sent">
        <span className="pub-status-mark is-success" aria-hidden="true">
          <IconCheck />
        </span>
        <h3>¡Gracias! Recibimos tu interés</h3>
        <p>El equipo comercial te contactará dentro de las próximas 24 horas hábiles con la propuesta.</p>
      </div>
    );
  }

  return (
    <form className="pub-form" onSubmit={submit} noValidate>
      <div className="pg-form-grid">
        <PublicField id="lead-company" label="Marca o empresa" error={errors.companyName}>
          <input id="lead-company" value={values.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" />
        </PublicField>
        <PublicField id="lead-name" label="Tu nombre" error={errors.contactName}>
          <input id="lead-name" value={values.contactName} onChange={(e) => set('contactName', e.target.value)} autoComplete="name" />
        </PublicField>
        <PublicField id="lead-title" label="Cargo" optional error={errors.jobTitle}>
          <input id="lead-title" value={values.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} autoComplete="organization-title" />
        </PublicField>
        <PublicField id="lead-email" label="Correo" error={errors.email}>
          <input id="lead-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
        </PublicField>
        <PublicField id="lead-phone" label="Teléfono / WhatsApp" optional error={errors.phone}>
          <input id="lead-phone" value={values.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="+56 9 …" />
        </PublicField>
        {packages.length > 0 && (
          <PublicField id="lead-package" label="Plan de interés" optional>
            <select id="lead-package" value={values.packageId} onChange={(e) => set('packageId', e.target.value)}>
              <option value="">Aún no lo sé</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id} disabled={p.slotsLeft === 0}>
                  {p.name}
                  {p.slotsLeft === 0 ? ' (agotado)' : ''}
                </option>
              ))}
            </select>
          </PublicField>
        )}
      </div>
      <PublicField id="lead-message" label="Cuéntanos qué buscas" optional error={errors.message}>
        <textarea id="lead-message" rows={4} value={values.message} onChange={(e) => set('message', e.target.value)} placeholder="Objetivos de tu marca, público al que quieres llegar, canje posible…" />
      </PublicField>
      <input ref={honeypot} type="text" name={SPONSOR_LEAD_HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" className="pg-hp" />
      {serverError && <p className="pub-error">{serverError}</p>}
      <PublicButton type="submit" disabled={status === 'sending'} full>
        {status === 'sending' ? 'Enviando…' : 'Quiero auspiciar'}
      </PublicButton>
    </form>
  );
}

export function PageantSiteClient({ site }: { site: PublicPageantSite }) {
  const countdown = useCountdown(site.galaDate);
  const [selected, setSelected] = useState<PublicPageantCandidate | null>(null);
  const hasSponsorSection = site.sponsorsByTier.length > 0 || site.packages.length > 0 || site.sponsorLeadForm;
  const maxVotes = Math.max(1, ...(site.voteRanking ?? []).map((r) => r.votes));
  const winner = site.results?.find((r) => r.rank === 1) ?? null;
  const court = site.results?.filter((r) => r.rank > 1) ?? [];

  const nav = [
    site.results ? { href: '#resultados', label: 'Resultados' } : null,
    site.candidates.length > 0 ? { href: '#candidatas', label: 'Candidatas' } : null,
    site.description ? { href: '#certamen', label: 'El certamen' } : null,
    hasSponsorSection ? { href: '#auspicios', label: 'Auspicios' } : null,
  ].filter((n): n is { href: string; label: string } => n !== null);

  return (
    <PublicPage accent={site.accent} className="pg-root">
      <style>{PAGEANT_STYLES}</style>
      <header className="pg-topbar">
        <span className="pg-brand">
          {site.organizerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.organizerLogoUrl} alt="" className="pg-brand-logo" />
          ) : (
            <span className="pub-topbar-mark" aria-hidden="true" />
          )}
          {site.organizer}
        </span>
        {nav.length > 0 && (
          <nav aria-label="Secciones" className="pg-nav">
            {nav.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <section className="pg-hero" aria-labelledby="pg-title">
        {site.coverImageUrl && (
          <div className="pg-hero-cover" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.coverImageUrl} alt="" />
          </div>
        )}
        <div className="pg-hero-inner">
          <p className="pub-eyebrow">{site.organizer} presenta</p>
          <h1 id="pg-title" className="pg-title">{site.name}</h1>
          {site.tagline && <p className="pg-tagline">{site.tagline}</p>}
          {(site.galaDate || site.venueName) && (
            <p className="pg-when">
              {site.galaDate && <span>{galaDateLabel(site.galaDate)}</span>}
              {site.venueName && (
                <span>
                  {site.venueName}
                  {site.venueAddress && ` · ${site.venueAddress}`}
                </span>
              )}
            </p>
          )}
          {countdown && (
            <div className="pg-countdown" role="timer" aria-label="Cuenta regresiva a la gala">
              {[
                ['Días', countdown.days],
                ['Horas', countdown.hours],
                ['Min', countdown.minutes],
                ['Seg', countdown.seconds],
              ].map(([label, value]) => (
                <div key={label as string} className="pg-count">
                  <span className="pg-count-value">{String(value).padStart(2, '0')}</span>
                  <span className="pg-count-label">{label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="pg-ctas">
            {site.tickets && (
              <a className="pub-btn is-primary pg-cta" href={site.tickets.href}>
                <span>Comprar entradas{site.tickets.fromPrice != null ? ` · desde ${formatCurrency(site.tickets.fromPrice)}` : ''}</span>
              </a>
            )}
            {site.voting && (
              <a className={`pub-btn ${site.tickets ? 'is-ghost' : 'is-primary'} pg-cta`} href={site.voting.href}>
                <span>Vota por tu favorita</span>
              </a>
            )}
            {site.registration && (
              <a className="pub-btn is-ghost pg-cta" href={site.registration.href}>
                <span>Postula al certamen</span>
              </a>
            )}
          </div>
          {site.registration?.closesAt && <p className="pg-note">Postulaciones abiertas hasta el {new Date(site.registration.closesAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' })}.</p>}
        </div>
      </section>

      <main className="pg-main">
        {winner && (
          <section id="resultados" className="pg-section" aria-labelledby="pg-results-title">
            <p className="pub-eyebrow">Resultados oficiales</p>
            <h2 id="pg-results-title" className="pg-h2">Tenemos nueva reina</h2>
            <div className="pg-winner">
              <div className="pg-winner-photo">
                {winner.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={winner.photoUrl} alt={winner.name} />
                ) : (
                  <span className="pg-initial" aria-hidden="true">{winner.name.charAt(0)}</span>
                )}
              </div>
              <div>
                <p className="pg-crown-tag">Ganadora</p>
                <p className="pg-winner-name">{winner.name}</p>
                {winner.representing && <p className="pg-modal-rep">{winner.representing}</p>}
              </div>
            </div>
            {court.length > 0 && (
              <ol className="pg-court">
                {court.map((r) => (
                  <li key={r.rank}>
                    <span className="pg-court-rank">{r.rank}° lugar</span>
                    <span className="pg-court-name">{r.name}</span>
                    {r.representing && <span className="pg-court-rep">{r.representing}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {site.candidates.length > 0 && (
          <section id="candidatas" className="pg-section" aria-labelledby="pg-candidates-title">
            <p className="pub-eyebrow">{site.candidates.length} candidatas oficiales</p>
            <h2 id="pg-candidates-title" className="pg-h2">Conoce a las candidatas</h2>
            <ul className="pg-grid">
              {site.candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" className={`pg-card ${c.isWinner ? 'is-winner' : ''}`} onClick={() => setSelected(c)}>
                    <span className="pg-card-photo">
                      {c.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photoUrl} alt={c.name} loading="lazy" />
                      ) : (
                        <span className="pg-initial" aria-hidden="true">{c.name.charAt(0)}</span>
                      )}
                      {c.number != null && <span className="pg-card-number">N° {c.number}</span>}
                      {c.isWinner && <span className="pg-card-flag">Ganadora</span>}
                      {!c.isWinner && c.isFinalist && <span className="pg-card-flag is-soft">Finalista</span>}
                    </span>
                    <span className="pg-card-name">{c.name}</span>
                    {c.representing && <span className="pg-card-rep">{c.representing}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {site.voteRanking && site.voteRanking.length > 0 && (
          <section className="pg-section pg-narrow" aria-labelledby="pg-ranking-title">
            <p className="pub-eyebrow">Votación del público</p>
            <h2 id="pg-ranking-title" className="pg-h2">Ranking en vivo</h2>
            <ol className="pg-ranking">
              {site.voteRanking.map((row, index) => (
                <li key={`${row.name}-${index}`}>
                  <span className="pg-ranking-pos">{index + 1}</span>
                  <span className="pg-ranking-body">
                    <span className="pg-ranking-name">
                      {row.name}
                      {row.number != null && <span className="pg-ranking-num"> · N° {row.number}</span>}
                    </span>
                    <span className="pub-progress-track">
                      <span className="pub-progress-fill" style={{ width: `${(row.votes / maxVotes) * 100}%` }} />
                    </span>
                  </span>
                  <span className="pg-ranking-votes">{row.votes.toLocaleString('es-CL')}</span>
                </li>
              ))}
            </ol>
            {site.voting && (
              <a className="pub-btn is-primary pg-cta" href={site.voting.href}>
                <span>Votar · {formatCurrency(site.voting.pricePerVote)} por voto</span>
              </a>
            )}
          </section>
        )}

        {site.description && (
          <section id="certamen" className="pg-section pg-narrow" aria-labelledby="pg-about-title">
            <p className="pub-eyebrow">El certamen</p>
            <h2 id="pg-about-title" className="pg-h2">Sobre {site.name}</h2>
            <p className="pg-prose">{site.description}</p>
          </section>
        )}

        {hasSponsorSection && (
          <section id="auspicios" className="pg-section" aria-labelledby="pg-sponsors-title">
            <p className="pub-eyebrow">Marcas que nos acompañan</p>
            <h2 id="pg-sponsors-title" className="pg-h2">Auspiciadores</h2>
            {site.sponsorsByTier.length > 0 && (
              <div className="pg-sponsors">
                {site.sponsorsByTier.map((group) => (
                  <div key={group.tier} className="pg-sponsor-tier">
                    <p className="pg-sponsor-tier-label">{group.label}</p>
                    <ul>
                      {group.names.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {site.packages.length > 0 && (
              <>
                <h3 className="pg-h3">Planes de auspicio</h3>
                <ul className="pg-packages">
                  {site.packages.map((p) => (
                    <li key={p.id} className="pub-card pg-package">
                      <p className="pub-eyebrow">{p.tierLabel}</p>
                      <p className="pg-package-name">{p.name}</p>
                      {p.price != null && <p className="pg-package-price">{formatCurrency(p.price)} <span>+ IVA</span></p>}
                      {p.description && <p className="pg-package-desc">{p.description}</p>}
                      {p.benefits.length > 0 && (
                        <ul className="pg-benefits">
                          {p.benefits.map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                        </ul>
                      )}
                      {p.slotsLeft != null && <p className="pg-slots">{p.slotsLeft === 0 ? 'Agotado' : `${p.slotsLeft} cupo${p.slotsLeft === 1 ? '' : 's'} disponible${p.slotsLeft === 1 ? '' : 's'}`}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {site.sponsorLeadForm && (
              <div className="pub-card is-glow pg-lead">
                <h3 className="pg-h3">¿Tu marca quiere estar aquí?</h3>
                <p className="pub-subtitle">Déjanos tus datos y te enviamos la propuesta comercial del certamen.</p>
                <SponsorLeadForm slug={site.slug} packages={site.packages} />
              </div>
            )}
            {!site.sponsorLeadForm && site.contactEmail && (
              <p className="pg-note">
                Para auspiciar escríbenos a <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
              </p>
            )}
          </section>
        )}
      </main>

      <footer className="pg-footer">
        <p>
          {site.organizer}
          {site.instagramHandle && (
            <>
              {' · '}
              <a href={`https://instagram.com/${site.instagramHandle}`} target="_blank" rel="noopener noreferrer">
                @{site.instagramHandle}
              </a>
            </>
          )}
          {site.contactEmail && (
            <>
              {' · '}
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </>
          )}
        </p>
        <p className="pg-powered">Producción gestionada con Aether</p>
      </footer>

      {selected && <CandidateModal candidate={selected} voteHref={site.voting?.href ?? null} onClose={() => setSelected(null)} />}
    </PublicPage>
  );
}

const PAGEANT_STYLES = `
.pg-root .pub-layer { display: block; }
.pg-topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.9rem clamp(1rem, 4vw, 2.5rem);
  background: color-mix(in oklab, var(--pub-bg) 70%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--pub-line-soft);
}
.pg-brand { display: inline-flex; align-items: center; gap: 0.6rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--pub-ink-dim); }
.pg-brand-logo { height: 1.6rem; width: auto; border-radius: 4px; }
.pg-nav { display: flex; gap: 1.1rem; flex-wrap: wrap; justify-content: flex-end; }
.pg-nav a { font-size: 0.8rem; color: var(--pub-ink-dim); text-decoration: none; }
.pg-nav a:hover { color: var(--pub-ink); }
@media (max-width: 640px) { .pg-nav { display: none; } }

.pg-hero { position: relative; min-height: min(88vh, 54rem); display: flex; align-items: flex-end; overflow: hidden; }
.pg-hero-cover { position: absolute; inset: 0; }
.pg-hero-cover img { width: 100%; height: 100%; object-fit: cover; }
.pg-hero-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in oklab, var(--pub-bg) 25%, transparent) 0%, color-mix(in oklab, var(--pub-bg) 55%, transparent) 45%, var(--pub-bg) 100%); }
.pg-hero-inner { position: relative; width: 100%; max-width: 72rem; margin: 0 auto; padding: clamp(5rem, 14vh, 9rem) clamp(1rem, 4vw, 2.5rem) clamp(3rem, 8vh, 5rem); }
.pg-title { margin: 0; font-size: clamp(2.4rem, 7vw, 5.2rem); line-height: 1.02; font-weight: 700; letter-spacing: -0.035em; max-width: 18ch;
  background: linear-gradient(180deg, var(--pub-ink) 30%, color-mix(in oklab, var(--pub-a) 70%, var(--pub-ink)) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.pg-tagline { margin: 1rem 0 0; max-width: 40rem; font-size: clamp(1rem, 2vw, 1.25rem); line-height: 1.5; color: var(--pub-ink-dim); }
.pg-when { margin: 1.25rem 0 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; font-size: 0.92rem; color: var(--pub-ink); text-transform: capitalize; }
.pg-when span + span::before { content: '·'; margin-right: 1.2rem; color: var(--pub-a); }
.pg-countdown { display: flex; gap: 0.65rem; margin-top: 1.75rem; flex-wrap: wrap; }
.pg-count { min-width: 4.6rem; padding: 0.75rem 0.6rem; text-align: center; border: 1px solid var(--pub-line); border-radius: 16px; background: var(--pub-glass); backdrop-filter: blur(16px); }
.pg-count-value { display: block; font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--pub-a); line-height: 1; }
.pg-count-label { display: block; margin-top: 0.35rem; font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pub-ink-dim); }
.pg-ctas { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2rem; }
.pg-cta { text-decoration: none; display: inline-flex; width: auto; }
.pg-note { margin: 0.9rem 0 0; font-size: 0.8rem; color: var(--pub-ink-dim); }
.pg-note a { color: var(--pub-a); }

.pg-main { max-width: 72rem; margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2.5rem); }
.pg-section { padding: clamp(3rem, 9vh, 6rem) 0 0; }
.pg-narrow { max-width: 46rem; }
.pg-h2 { margin: 0 0 1.75rem; font-size: clamp(1.7rem, 4vw, 2.6rem); font-weight: 700; letter-spacing: -0.025em; }
.pg-h3 { margin: 2.5rem 0 1rem; font-size: 1.25rem; font-weight: 600; }
.pg-prose { margin: 0; font-size: 1.02rem; line-height: 1.75; color: var(--pub-ink-dim); white-space: pre-line; }

.pg-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12.5rem), 1fr)); }
.pg-card { display: flex; flex-direction: column; width: 100%; padding: 0; text-align: left; background: none; border: 0; color: inherit; cursor: pointer; font: inherit; }
.pg-card-photo { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 18px; border: 1px solid var(--pub-line); background: var(--pub-glass); }
.pg-card-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
.pg-card:hover .pg-card-photo img, .pg-card:focus-visible .pg-card-photo img { transform: scale(1.05); }
.pg-card:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 4px; border-radius: 18px; }
.pg-card.is-winner .pg-card-photo { border-color: var(--pub-a); box-shadow: 0 0 40px -10px color-mix(in oklab, var(--pub-a) 70%, transparent); }
.pg-card-number { position: absolute; left: 0.6rem; top: 0.6rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; background: color-mix(in oklab, var(--pub-bg) 70%, transparent); color: var(--pub-a); backdrop-filter: blur(8px); }
.pg-card-flag { position: absolute; right: 0.6rem; top: 0.6rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: linear-gradient(135deg, var(--pub-a), var(--pub-b)); color: var(--pub-on-accent); }
.pg-card-flag.is-soft { background: color-mix(in oklab, var(--pub-bg) 70%, transparent); color: var(--pub-ink); }
.pg-card-name { margin-top: 0.7rem; font-weight: 600; font-size: 0.98rem; }
.pg-card-rep { font-size: 0.8rem; color: var(--pub-ink-dim); }
.pg-initial { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 3rem; font-weight: 700; color: var(--pub-a); }

.pg-modal { position: relative; display: grid; grid-template-columns: 1fr; width: min(100%, 52rem); max-height: 90dvh; overflow: auto; border-radius: 24px; border: 1px solid var(--pub-line); background: rgba(10,13,22,0.96); color: var(--pub-ink); }
@media (min-width: 720px) { .pg-modal { grid-template-columns: 1fr 1.1fr; } }
.pg-modal-close { position: absolute; top: 0.6rem; right: 0.8rem; z-index: 2; width: 2.2rem; height: 2.2rem; border-radius: 999px; border: 1px solid var(--pub-line); background: rgba(0,0,0,0.4); color: var(--pub-ink); font-size: 1.4rem; line-height: 1; cursor: pointer; }
.pg-modal-photo { aspect-ratio: 3 / 4; background: var(--pub-glass); }
.pg-modal-photo img { width: 100%; height: 100%; object-fit: cover; }
.pg-modal-body { padding: 2rem; display: flex; flex-direction: column; gap: 0.6rem; justify-content: center; }
.pg-modal-name { margin: 0; font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
.pg-modal-rep { margin: 0; color: var(--pub-ink-dim); }
.pg-modal-bio { margin: 0.6rem 0; line-height: 1.7; color: var(--pub-ink-dim); white-space: pre-line; }
.pg-crown-tag { align-self: flex-start; margin: 0; padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; background: linear-gradient(135deg, var(--pub-a), var(--pub-b)); color: var(--pub-on-accent); }
.pg-crown-tag.is-soft { background: var(--pub-glass); color: var(--pub-ink); border: 1px solid var(--pub-line); }

.pg-winner { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.75rem; }
.pg-winner-photo { width: min(100%, 20rem); aspect-ratio: 3 / 4; overflow: hidden; border-radius: 24px; border: 1px solid var(--pub-a); box-shadow: 0 30px 80px -30px color-mix(in oklab, var(--pub-a) 80%, transparent); background: var(--pub-glass); }
.pg-winner-photo img { width: 100%; height: 100%; object-fit: cover; }
.pg-winner-name { margin: 0.6rem 0 0.2rem; font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 700; letter-spacing: -0.03em; }
.pg-court { list-style: none; margin: 2rem 0 0; padding: 0; display: grid; gap: 0.7rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); }
.pg-court li { padding: 1rem 1.1rem; border-radius: 16px; border: 1px solid var(--pub-line); background: var(--pub-glass); display: flex; flex-direction: column; }
.pg-court-rank { font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--pub-a); font-weight: 600; }
.pg-court-name { font-weight: 600; margin-top: 0.2rem; }
.pg-court-rep { font-size: 0.8rem; color: var(--pub-ink-dim); }

.pg-ranking { list-style: none; margin: 0 0 1.5rem; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.pg-ranking li { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.8rem; align-items: center; }
.pg-ranking-pos { font-weight: 700; color: var(--pub-a); font-variant-numeric: tabular-nums; }
.pg-ranking-body { display: flex; flex-direction: column; gap: 0.35rem; }
.pg-ranking-name { font-size: 0.92rem; font-weight: 500; }
.pg-ranking-num { color: var(--pub-ink-dim); font-weight: 400; }
.pg-ranking-votes { font-variant-numeric: tabular-nums; font-weight: 600; }

.pg-sponsors { display: flex; flex-direction: column; gap: 1.5rem; }
.pg-sponsor-tier-label { margin: 0 0 0.6rem; font-size: 0.68rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--pub-a); font-weight: 600; }
.pg-sponsor-tier ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.6rem; }
.pg-sponsor-tier li { padding: 0.8rem 1.3rem; border-radius: 14px; border: 1px solid var(--pub-line); background: var(--pub-glass); font-weight: 600; letter-spacing: -0.01em; }
.pg-sponsor-tier:first-child li { font-size: 1.15rem; padding: 1.1rem 1.7rem; }

.pg-packages { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
.pg-package { display: flex; flex-direction: column; }
.pg-package-name { margin: 0; font-size: 1.2rem; font-weight: 700; }
.pg-package-price { margin: 0.4rem 0 0; font-size: 1.5rem; font-weight: 700; color: var(--pub-a); }
.pg-package-price span { font-size: 0.75rem; font-weight: 500; color: var(--pub-ink-dim); }
.pg-package-desc { margin: 0.6rem 0 0; font-size: 0.88rem; color: var(--pub-ink-dim); line-height: 1.55; }
.pg-benefits { margin: 0.9rem 0 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.86rem; color: var(--pub-ink); }
.pg-benefits li::marker { color: var(--pub-a); }
.pg-slots { margin: auto 0 0; padding-top: 1rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pub-a); }

.pg-lead { margin-top: 2.5rem; max-width: 46rem; }
.pg-lead .pg-h3 { margin-top: 0; }
.pg-form-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
@media (min-width: 640px) { .pg-form-grid { grid-template-columns: 1fr 1fr; } }
.pg-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.pg-sent { display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem; }
.pg-sent h3 { margin: 0.4rem 0 0; font-size: 1.2rem; }
.pg-sent p { margin: 0; color: var(--pub-ink-dim); }

.pg-footer { max-width: 72rem; margin: 0 auto; padding: 5rem clamp(1rem, 4vw, 2.5rem) 3rem; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem; font-size: 0.8rem; color: var(--pub-ink-dim); border-top: 1px solid var(--pub-line-soft); margin-top: 5rem; }
.pg-footer a { color: var(--pub-ink); text-decoration: none; }
.pg-footer a:hover { color: var(--pub-a); }
.pg-powered { margin: 0; opacity: 0.6; }
@media (prefers-reduced-motion: reduce) { .pg-card-photo img { transition: none; } }
`;
