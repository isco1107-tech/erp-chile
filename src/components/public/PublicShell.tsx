'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/**
 * ============================================================================
 * Sistema de diseño de las páginas públicas ("links" que la organización
 * reparte fuera del ERP: inscripción, entradas, votación, jurado, portal de
 * auspiciador).
 * ============================================================================
 *
 * Por qué existe: cada una de esas pantallas se había construido por su lado
 * — unas con primitivos shadcn del dashboard, otra con CSS propio — así que
 * un mismo certamen repartía cinco links que parecían de cinco productos
 * distintos. Este módulo les da una sola identidad (fondo aurora, vidrio,
 * tipografía y ritmo compartidos) con un color de acento por superficie para
 * que sigan siendo distinguibles entre sí.
 *
 * Por qué CSS propio y no Tailwind/shadcn: estas páginas son la cara pública
 * del certamen, no pantallas internas. Los tokens de shadcn (`--card`,
 * `--primary`…) los comparten el dashboard y el POS; cambiarlos para que el
 * público se vea bien arrastraría al resto de la app. El `<style>` inyectado
 * aquí es el mismo patrón que ya usaba `CandidateRegistrationClient`, y deja
 * el diseño público completamente aislado del tema interno.
 */

export type PublicAccent = 'gold' | 'violet' | 'rose' | 'cyan' | 'emerald';

/** Raíz de una página pública: pinta el fondo, fija el acento y aísla el tema. */
export function PublicPage({
  accent = 'cyan',
  children,
  className = '',
}: {
  accent?: PublicAccent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pub-root ${className}`} data-accent={accent}>
      <style>{PUBLIC_STYLES}</style>
      <PublicBackdrop />
      <div className="pub-layer">{children}</div>
    </div>
  );
}

/** Aurora + grano + viñeta. Puramente decorativo. */
function PublicBackdrop() {
  return (
    <div className="pub-backdrop" aria-hidden="true">
      <span className="pub-orb pub-orb-1" />
      <span className="pub-orb pub-orb-2" />
      <span className="pub-orb pub-orb-3" />
      <span className="pub-grid" />
      <span className="pub-grain" />
      <span className="pub-vignette" />
    </div>
  );
}

/** Barra superior discreta con la marca de la organización. */
export function PublicTopBar({ brand, right }: { brand: string; right?: ReactNode }) {
  return (
    <header className="pub-topbar">
      <span className="pub-topbar-brand">
        <span className="pub-topbar-mark" aria-hidden="true" />
        {brand}
      </span>
      {right && <span className="pub-topbar-right">{right}</span>}
    </header>
  );
}

/** Contenedor centrado con el ancho de lectura de estas páginas. */
export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={`pub-shell ${wide ? 'is-wide' : ''}`}>{children}</main>;
}

/** Tarjeta de vidrio: la superficie base de todo el sistema. */
export function PublicCard({
  children,
  className = '',
  glow = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Añade el halo de acento — reservado para la tarjeta principal de la pantalla. */
  glow?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={`pub-card ${glow ? 'is-glow' : ''} ${className}`} style={style}>
      {children}
    </section>
  );
}

/** Encabezado de una tarjeta: icono en medallón, eyebrow, título y bajada. */
export function PublicCardHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <div className={`pub-card-head ${align === 'start' ? 'is-start' : ''}`}>
      {icon && <span className="pub-medallion" aria-hidden="true">{icon}</span>}
      {eyebrow && <p className="pub-eyebrow">{eyebrow}</p>}
      <h1 className="pub-title">{title}</h1>
      {subtitle && <p className="pub-subtitle">{subtitle}</p>}
    </div>
  );
}

/** Campo de formulario: etiqueta, control, pista y error, con el mismo ritmo. */
export function PublicField({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pub-field ${error ? 'is-invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="pub-field-optional">opcional</span>}
      </label>
      {children}
      {hint && !error && <p className="pub-hint">{hint}</p>}
      {error && <p className="pub-error">{error}</p>}
    </div>
  );
}

/** Fila de resumen (etiqueta a la izquierda, valor a la derecha). */
export function PublicRow({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`pub-row ${strong ? 'is-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Panel de total/destaque, con el acento de la pantalla. */
export function PublicTotal({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="pub-total">
      <span className="pub-total-label">{label}</span>
      <span className="pub-total-value">{value}</span>
      {note && <span className="pub-total-note">{note}</span>}
    </div>
  );
}

/** Botón principal con barrido de brillo al pasar el cursor. */
export function PublicButton({
  children,
  variant = 'primary',
  full = false,
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  full?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`pub-btn ${variant === 'ghost' ? 'is-ghost' : 'is-primary'} ${full ? 'is-full' : ''} ${className}`}
    >
      <span>{children}</span>
    </button>
  );
}

export function PublicBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn';
}) {
  return <span className={`pub-badge is-${tone}`}>{children}</span>;
}

/** Barra de progreso fina con relleno de acento. */
export function PublicProgress({ percent, label }: { percent: number; label?: ReactNode }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="pub-progress">
      <div className="pub-progress-head">
        {label && <span>{label}</span>}
        <strong>{safe}%</strong>
      </div>
      <div className="pub-progress-track">
        <div className="pub-progress-fill" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

/** Pantalla completa de estado: cargando, link inválido o confirmación. */
export function PublicStatus({
  accent = 'cyan',
  variant,
  title,
  message,
  children,
}: {
  accent?: PublicAccent;
  variant: 'loading' | 'error' | 'success';
  title?: string;
  message?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PublicPage accent={accent}>
      <PublicShell>
        <div className="pub-status">
          {variant === 'loading' && <span className="pub-spinner" aria-hidden="true" />}
          {variant === 'error' && (
            <span className="pub-status-mark is-error" aria-hidden="true">
              <IconAlert />
            </span>
          )}
          {variant === 'success' && (
            <span className="pub-status-mark is-success" aria-hidden="true">
              <IconCheck />
            </span>
          )}
          {title && <h1 className="pub-status-title">{title}</h1>}
          {message && <p className="pub-status-message">{message}</p>}
          {children}
        </div>
      </PublicShell>
    </PublicPage>
  );
}

export function PublicFooter({ children }: { children: ReactNode }) {
  return <footer className="pub-footer">{children}</footer>;
}

/**
 * Diálogo de confirmación propio del sistema público — reemplaza al
 * `confirm()` nativo del navegador, que rompe la estética cuidada de estas
 * pantallas con el cuadro gris del sistema operativo. `role="alertdialog"` +
 * el foco inicial en el botón de cancelar (la acción reversible) siguen el
 * mismo criterio que los diálogos de shadcn del dashboard.
 */
export function PublicConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="pub-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="pub-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pub-dialog-title">
        <h2 id="pub-dialog-title" className="pub-dialog-title">{title}</h2>
        <div className="pub-dialog-message">{message}</div>
        <div className="pub-dialog-actions">
          <PublicButton type="button" variant="ghost" onClick={onCancel} disabled={busy} autoFocus>
            {cancelLabel}
          </PublicButton>
          <PublicButton type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Enviando…' : confirmLabel}
          </PublicButton>
        </div>
      </div>
    </div>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M12 8.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const PUBLIC_STYLES = `
.pub-root {
  --pub-bg: #05060b;
  --pub-ink: #eef2f8;
  --pub-ink-dim: #94a1b6;
  --pub-line: rgba(255,255,255,0.10);
  --pub-line-soft: rgba(255,255,255,0.06);
  --pub-glass: rgba(255,255,255,0.045);
  --pub-glass-2: rgba(255,255,255,0.028);
  --pub-danger: #fb7185;
  --pub-ok: #34d399;
  --pub-radius: 20px;
  position: relative;
  min-height: 100dvh;
  background: var(--pub-bg);
  color: var(--pub-ink);
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
.pub-root[data-accent="gold"]    { --pub-a: #e7cd97; --pub-b: #a8823f; --pub-on-accent: #1b1407; }
.pub-root[data-accent="violet"]  { --pub-a: #b39bff; --pub-b: #6d28d9; --pub-on-accent: #120a26; }
.pub-root[data-accent="rose"]    { --pub-a: #fda4b4; --pub-b: #be123c; --pub-on-accent: #2a0512; }
.pub-root[data-accent="cyan"]    { --pub-a: #67e8f9; --pub-b: #0e7490; --pub-on-accent: #04171c; }
.pub-root[data-accent="emerald"] { --pub-a: #6ee7b7; --pub-b: #047857; --pub-on-accent: #032018; }

/* ── Fondo ────────────────────────────────────────────────────────────── */
.pub-backdrop { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.pub-orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.5; }
.pub-orb-1 {
  width: 46rem; height: 46rem; top: -18rem; left: -12rem;
  background: radial-gradient(circle, color-mix(in oklab, var(--pub-a) 55%, transparent) 0%, transparent 70%);
  animation: pub-drift-a 26s ease-in-out infinite alternate;
}
.pub-orb-2 {
  width: 40rem; height: 40rem; top: -10rem; right: -14rem;
  background: radial-gradient(circle, color-mix(in oklab, var(--pub-b) 70%, transparent) 0%, transparent 70%);
  animation: pub-drift-b 32s ease-in-out infinite alternate;
}
.pub-orb-3 {
  width: 52rem; height: 52rem; bottom: -30rem; left: 30%;
  background: radial-gradient(circle, color-mix(in oklab, var(--pub-a) 30%, transparent) 0%, transparent 70%);
  opacity: 0.3;
  animation: pub-drift-a 38s ease-in-out infinite alternate-reverse;
}
@keyframes pub-drift-a { to { transform: translate3d(5rem, 3rem, 0) scale(1.12); } }
@keyframes pub-drift-b { to { transform: translate3d(-4rem, 4rem, 0) scale(1.08); } }
.pub-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 72px 72px;
  -webkit-mask-image: radial-gradient(ellipse 70% 55% at 50% 0%, #000 20%, transparent 78%);
  mask-image: radial-gradient(ellipse 70% 55% at 50% 0%, #000 20%, transparent 78%);
}
.pub-grain {
  position: absolute; inset: -50%;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}
.pub-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 90% 70% at 50% 30%, transparent 30%, var(--pub-bg) 100%);
}
@media (prefers-reduced-motion: reduce) { .pub-orb { animation: none; } }

.pub-layer { position: relative; z-index: 1; display: flex; min-height: 100dvh; flex-direction: column; }

/* ── Barra superior ───────────────────────────────────────────────────── */
.pub-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  max-width: 64rem; width: 100%; margin: 0 auto;
  padding: 1.35rem 1.5rem 0.5rem;
}
.pub-topbar-brand {
  display: inline-flex; align-items: center; gap: 0.6rem;
  font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--pub-ink-dim);
}
.pub-topbar-mark {
  width: 0.55rem; height: 0.55rem; border-radius: 2px;
  background: linear-gradient(135deg, var(--pub-a), var(--pub-b));
  box-shadow: 0 0 12px color-mix(in oklab, var(--pub-a) 60%, transparent);
}
.pub-topbar-right { font-size: 0.72rem; color: var(--pub-ink-dim); }

/* ── Contenedor ───────────────────────────────────────────────────────── */
.pub-shell {
  flex: 1;
  width: 100%;
  max-width: 32rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3.5rem;
  display: flex; flex-direction: column; gap: 1rem;
  justify-content: center;
}
.pub-shell.is-wide { max-width: 46rem; }
@media (min-width: 640px) { .pub-shell { padding: 2rem 1.5rem 4rem; } }

/* ── Tarjeta ──────────────────────────────────────────────────────────── */
.pub-card {
  position: relative;
  border: 1px solid var(--pub-line);
  border-radius: var(--pub-radius);
  background: linear-gradient(180deg, var(--pub-glass) 0%, var(--pub-glass-2) 100%), rgba(10,13,22,0.72);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  padding: 1.5rem;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -24px rgba(0,0,0,0.9);
  animation: pub-rise 0.55s cubic-bezier(0.16,1,0.3,1) both;
}
.pub-card::before {
  content: '';
  position: absolute; top: 0; left: 12%; right: 12%; height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--pub-a) 70%, transparent), transparent);
}
.pub-card.is-glow::after {
  content: '';
  position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
  box-shadow: 0 0 60px -12px color-mix(in oklab, var(--pub-a) 32%, transparent);
}
@media (min-width: 640px) { .pub-card { padding: 2rem; } }
@keyframes pub-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .pub-card { animation: none; } }

.pub-card-head { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 1.5rem; }
.pub-card-head.is-start { align-items: flex-start; text-align: left; }
.pub-medallion {
  display: inline-flex; align-items: center; justify-content: center;
  width: 3rem; height: 3rem; margin-bottom: 1rem;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--pub-a) 35%, transparent);
  background: linear-gradient(160deg, color-mix(in oklab, var(--pub-a) 18%, transparent), transparent);
  color: var(--pub-a);
  box-shadow: 0 8px 24px -12px color-mix(in oklab, var(--pub-a) 70%, transparent);
}
.pub-eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.66rem; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--pub-a);
}
.pub-title { margin: 0; font-size: 1.5rem; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; }
.pub-subtitle { margin: 0.55rem 0 0; font-size: 0.9rem; line-height: 1.55; color: var(--pub-ink-dim); }

/* ── Formulario ───────────────────────────────────────────────────────── */
.pub-form { display: flex; flex-direction: column; gap: 1.05rem; }
.pub-field { display: flex; flex-direction: column; gap: 0.4rem; }
.pub-field > label {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 600; color: var(--pub-ink);
}
.pub-field-optional {
  font-size: 0.6rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--pub-ink-dim); border: 1px solid var(--pub-line-soft); border-radius: 999px; padding: 0.1rem 0.42rem;
}
.pub-field input, .pub-field select, .pub-field textarea {
  width: 100%;
  min-height: 2.85rem;
  border-radius: 12px;
  border: 1px solid var(--pub-line);
  background: rgba(255,255,255,0.035);
  color: var(--pub-ink);
  padding: 0.65rem 0.85rem;
  font: inherit;
  font-size: 0.95rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.pub-field textarea { min-height: 6rem; resize: vertical; line-height: 1.55; }
.pub-field input::placeholder, .pub-field textarea::placeholder { color: color-mix(in oklab, var(--pub-ink-dim) 75%, transparent); }
.pub-field input:hover, .pub-field select:hover, .pub-field textarea:hover { border-color: rgba(255,255,255,0.18); }
.pub-field input:focus-visible, .pub-field select:focus-visible, .pub-field textarea:focus-visible {
  outline: none;
  border-color: color-mix(in oklab, var(--pub-a) 70%, transparent);
  background: rgba(255,255,255,0.06);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--pub-a) 18%, transparent);
}
.pub-field select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5l5 5 5-5' stroke='%2394a1b6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
  background-size: 1.1rem;
  padding-right: 2.4rem;
}
.pub-field.is-invalid input, .pub-field.is-invalid select, .pub-field.is-invalid textarea {
  border-color: color-mix(in oklab, var(--pub-danger) 65%, transparent);
}
.pub-hint { margin: 0; font-size: 0.75rem; line-height: 1.45; color: var(--pub-ink-dim); }
.pub-error { margin: 0; font-size: 0.76rem; font-weight: 600; color: var(--pub-danger); }
.pub-error-form {
  border: 1px solid color-mix(in oklab, var(--pub-danger) 40%, transparent);
  background: color-mix(in oklab, var(--pub-danger) 12%, transparent);
  border-radius: 12px; padding: 0.7rem 0.9rem;
  font-size: 0.85rem; color: var(--pub-danger); font-weight: 600; margin: 0;
}
.pub-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

/* ── Campo con botón al costado (mostrar/ocultar contraseña) ──────────── */
.pub-input-affix { position: relative; display: flex; }
.pub-input-affix > input { padding-right: 3rem; }
.pub-input-affix > button {
  position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem;
  border: 0; border-radius: 9px; background: transparent;
  color: var(--pub-ink-dim); cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}
.pub-input-affix > button:hover { color: var(--pub-ink); background: rgba(255,255,255,0.07); }
.pub-input-affix > button:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 2px; }

/* ── Medidor de fuerza de contraseña ──────────────────────────────────── */
.pub-strength { display: flex; align-items: center; gap: 0.3rem; margin-top: 0.15rem; }
.pub-strength > span { height: 3px; flex: 1; border-radius: 999px; background: rgba(255,255,255,0.1); transition: background 0.25s ease; }
.pub-strength > em { font-style: normal; font-size: 0.72rem; font-weight: 600; color: var(--pub-ink-dim); margin-left: 0.35rem; white-space: nowrap; }
.pub-strength[data-score="0"] > span:nth-child(1),
.pub-strength[data-score="1"] > span:nth-child(1) { background: var(--pub-danger); }
.pub-strength[data-score="2"] > span:nth-child(-n+2) { background: #fbbf24; }
.pub-strength[data-score="3"] > span { background: var(--pub-ok); }
.pub-strength[data-score="0"] > em { color: var(--pub-ink-dim); }
.pub-strength[data-score="1"] > em { color: var(--pub-danger); }
.pub-strength[data-score="2"] > em { color: #fbbf24; }
.pub-strength[data-score="3"] > em { color: var(--pub-ok); }

/* ── Títulos de sección dentro de una tarjeta ─────────────────────────── */
.pub-section-title {
  margin: 0 0 0.9rem;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--pub-ink-dim);
  display: flex; align-items: center; gap: 0.65rem;
}
.pub-section-title::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, var(--pub-line), transparent);
}

/* ── Checklist ────────────────────────────────────────────────────────── */
.pub-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.pub-checklist > li {
  display: flex; align-items: flex-start; gap: 0.75rem;
  border: 1px solid var(--pub-line-soft);
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  padding: 0.7rem 0.85rem;
}
.pub-checklist-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.35rem; height: 1.35rem; flex-shrink: 0; margin-top: 0.1rem;
  border-radius: 6px;
  border: 1px solid var(--pub-line);
  color: transparent;
}
.pub-checklist-mark svg { width: 14px; height: 14px; }
.pub-checklist > li.is-done .pub-checklist-mark {
  color: var(--pub-on-accent);
  background: var(--pub-ok);
  border-color: var(--pub-ok);
}
.pub-checklist-body { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.pub-checklist-title { font-size: 0.88rem; font-weight: 600; }
.pub-checklist > li.is-done .pub-checklist-title { color: var(--pub-ink-dim); text-decoration: line-through; }
.pub-checklist-meta { font-size: 0.74rem; color: var(--pub-ink-dim); }

/* ── Tarjetas de opción (reemplazan al <select> cuando cada opción trae
      precio/estado propio: un desplegable nativo esconde esa información) ── */
.pub-optionset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.pub-optionset > legend { font-size: 0.8rem; font-weight: 600; color: var(--pub-ink); padding: 0; margin-bottom: 0.15rem; }
.pub-option {
  position: relative;
  display: flex; align-items: center; gap: 0.9rem;
  border: 1px solid var(--pub-line);
  border-radius: 14px;
  background: rgba(255,255,255,0.03);
  padding: 0.85rem 1rem;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.14s ease;
}
.pub-option:hover:not(.is-disabled) { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.055); }
.pub-option.is-selected {
  border-color: color-mix(in oklab, var(--pub-a) 65%, transparent);
  background: color-mix(in oklab, var(--pub-a) 10%, rgba(255,255,255,0.03));
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--pub-a) 14%, transparent);
}
.pub-option.is-disabled { opacity: 0.45; cursor: not-allowed; }
.pub-option > input {
  appearance: none;
  width: 1.15rem; height: 1.15rem; flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--pub-line);
  background: transparent;
  margin: 0;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.pub-option.is-selected > input {
  border-color: var(--pub-a);
  box-shadow: inset 0 0 0 4px color-mix(in oklab, var(--pub-a) 90%, transparent);
}
.pub-option > input:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 2px; }
.pub-option-body { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.pub-option-name { font-size: 0.93rem; font-weight: 600; }
.pub-option-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.pub-option-price { font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pub-option-avatar {
  width: 2.5rem; height: 2.5rem; flex-shrink: 0;
  border-radius: 50%; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.07);
  border: 1px solid var(--pub-line);
  font-size: 0.9rem; font-weight: 700; color: var(--pub-a);
}
.pub-option-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* ── Stepper numérico ─────────────────────────────────────────────────── */
.pub-stepper {
  display: flex; align-items: stretch;
  border: 1px solid var(--pub-line);
  border-radius: 12px;
  background: rgba(255,255,255,0.035);
  overflow: hidden;
  width: fit-content;
}
.pub-stepper > button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2.85rem; min-height: 2.85rem;
  border: 0; background: transparent; color: var(--pub-ink-dim); cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}
.pub-stepper > button:hover { background: rgba(255,255,255,0.07); color: var(--pub-ink); }
.pub-stepper > button:focus-visible { outline: 2px solid var(--pub-a); outline-offset: -2px; }
.pub-stepper > input {
  width: 4.5rem;
  min-height: 2.85rem;
  border: 0; border-left: 1px solid var(--pub-line); border-right: 1px solid var(--pub-line);
  border-radius: 0;
  background: transparent;
  text-align: center;
  font-size: 1rem; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--pub-ink);
  -moz-appearance: textfield;
}
.pub-stepper > input::-webkit-outer-spin-button,
.pub-stepper > input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pub-stepper > input:focus-visible { outline: none; background: rgba(255,255,255,0.05); box-shadow: none; }

/* ── Atajos de cantidad ───────────────────────────────────────────────── */
.pub-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pub-chip {
  border: 1px solid var(--pub-line);
  background: rgba(255,255,255,0.035);
  color: var(--pub-ink-dim);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font: inherit; font-size: 0.8rem; font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}
.pub-chip:hover { color: var(--pub-ink); border-color: rgba(255,255,255,0.2); }
.pub-chip.is-active {
  color: var(--pub-a);
  border-color: color-mix(in oklab, var(--pub-a) 55%, transparent);
  background: color-mix(in oklab, var(--pub-a) 14%, transparent);
}
.pub-chip:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 2px; }

/* ── Panel de jurado (objetivos táctiles grandes: se usa en un tablet) ── */
.pub-judge-list { display: flex; flex-direction: column; gap: 0.75rem; }
.pub-judge-card { padding: 1rem 1.1rem; animation: none; }
.pub-judge-head { display: flex; align-items: center; gap: 0.85rem; }
.pub-judge-name { display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start; min-width: 0; }
.pub-judge-name > span:first-child { font-size: 1rem; font-weight: 600; }
.pub-judge-actions {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 0.75rem;
  margin-top: 0.9rem; flex-wrap: wrap;
}
.pub-judge-score {
  display: flex; align-items: center; gap: 0.5rem;
  border: 1px solid var(--pub-line);
  border-radius: 12px;
  background: rgba(255,255,255,0.035);
  padding: 0.3rem 0.75rem 0.3rem 0.85rem;
}
.pub-judge-score > span:first-child {
  font-size: 0.68rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pub-ink-dim);
}
.pub-judge-score input {
  width: 3.75rem; min-height: 2.6rem;
  border: 0; background: transparent; color: var(--pub-ink);
  text-align: center; font: inherit; font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.pub-judge-score input::-webkit-outer-spin-button,
.pub-judge-score input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.pub-judge-score input:focus-visible { outline: none; }
.pub-judge-score:focus-within { border-color: color-mix(in oklab, var(--pub-a) 70%, transparent); box-shadow: 0 0 0 3px color-mix(in oklab, var(--pub-a) 18%, transparent); }
.pub-judge-max { font-size: 0.85rem; color: var(--pub-ink-dim); }
.pub-judge-buttons { display: flex; gap: 0.5rem; flex: 1; justify-content: flex-end; }
@media (max-width: 520px) {
  .pub-judge-actions { flex-direction: column; align-items: stretch; }
  .pub-judge-buttons > .pub-btn { flex: 1; }
}

/* ── Filas / totales ──────────────────────────────────────────────────── */
.pub-panel {
  border: 1px solid var(--pub-line-soft);
  border-radius: 14px;
  background: rgba(255,255,255,0.028);
  padding: 0.9rem 1rem;
}
.pub-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; font-size: 0.88rem; }
.pub-row > span:first-child { color: var(--pub-ink-dim); }
.pub-row > span:last-child { font-variant-numeric: tabular-nums; text-align: right; }
.pub-row.is-strong { font-weight: 700; border-top: 1px solid var(--pub-line-soft); margin-top: 0.3rem; padding-top: 0.6rem; }
.pub-row.is-strong > span:first-child { color: var(--pub-ink); }

.pub-total {
  display: flex; flex-direction: column; gap: 0.15rem;
  border: 1px solid color-mix(in oklab, var(--pub-a) 26%, transparent);
  border-radius: 16px;
  background: linear-gradient(160deg, color-mix(in oklab, var(--pub-a) 12%, transparent), transparent 65%);
  padding: 0.95rem 1.1rem;
}
.pub-total-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--pub-a); }
.pub-total-value { font-size: 1.55rem; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pub-total-note { font-size: 0.75rem; color: var(--pub-ink-dim); }

.pub-transfer {
  white-space: pre-line;
  border: 1px dashed color-mix(in oklab, var(--pub-a) 32%, transparent);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  font-size: 0.85rem; line-height: 1.6;
  color: var(--pub-ink);
  background: rgba(255,255,255,0.02);
  margin: 0;
}

/* ── Botones ──────────────────────────────────────────────────────────── */
.pub-btn {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  min-height: 2.95rem;
  padding: 0.7rem 1.45rem;
  border-radius: 12px;
  font: inherit; font-size: 0.95rem; font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.14s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}
.pub-btn.is-full { width: 100%; }
.pub-btn.is-primary {
  color: var(--pub-on-accent);
  background: linear-gradient(135deg, var(--pub-a) 0%, color-mix(in oklab, var(--pub-a) 55%, var(--pub-b)) 100%);
  box-shadow: 0 10px 30px -14px color-mix(in oklab, var(--pub-a) 85%, transparent);
}
.pub-btn.is-primary::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}
.pub-btn.is-primary:hover:not(:disabled)::after { transform: translateX(120%); }
.pub-btn.is-ghost {
  color: var(--pub-ink);
  background: rgba(255,255,255,0.04);
  border-color: var(--pub-line);
}
.pub-btn.is-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
.pub-btn:active:not(:disabled) { transform: translateY(1px) scale(0.995); }
.pub-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pub-btn:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 2px; }
.pub-btn > span { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 0.5rem; }

/* ── Insignias ────────────────────────────────────────────────────────── */
.pub-badge {
  display: inline-flex; align-items: center; gap: 0.35rem;
  border-radius: 999px; padding: 0.22rem 0.68rem;
  font-size: 0.72rem; font-weight: 600;
  border: 1px solid var(--pub-line);
  background: rgba(255,255,255,0.05);
  color: var(--pub-ink-dim);
  white-space: nowrap;
}
.pub-badge.is-accent { color: var(--pub-a); border-color: color-mix(in oklab, var(--pub-a) 35%, transparent); background: color-mix(in oklab, var(--pub-a) 12%, transparent); }
.pub-badge.is-ok { color: var(--pub-ok); border-color: color-mix(in oklab, var(--pub-ok) 35%, transparent); background: color-mix(in oklab, var(--pub-ok) 12%, transparent); }
.pub-badge.is-warn { color: #fbbf24; border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.12); }

/* ── Progreso ─────────────────────────────────────────────────────────── */
.pub-progress { display: flex; flex-direction: column; gap: 0.45rem; }
.pub-progress-head { display: flex; align-items: baseline; justify-content: space-between; font-size: 0.82rem; color: var(--pub-ink-dim); }
.pub-progress-head strong { color: var(--pub-ink); font-variant-numeric: tabular-nums; }
.pub-progress-track { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
.pub-progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in oklab, var(--pub-a) 60%, var(--pub-b)), var(--pub-a));
  box-shadow: 0 0 16px -2px color-mix(in oklab, var(--pub-a) 70%, transparent);
  transition: width 0.6s cubic-bezier(0.16,1,0.3,1);
}

/* ── Estados ──────────────────────────────────────────────────────────── */
.pub-status {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 0.85rem; padding: 2rem 0;
}
.pub-status-title { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.01em; }
.pub-status-message { margin: 0; max-width: 30rem; font-size: 0.9rem; line-height: 1.6; color: var(--pub-ink-dim); }
.pub-status-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 3.25rem; height: 3.25rem; border-radius: 50%;
  border: 1px solid currentColor;
}
.pub-status-mark.is-success { color: var(--pub-ok); box-shadow: 0 0 40px -12px var(--pub-ok); animation: pub-pop 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.pub-status-mark.is-error { color: var(--pub-danger); }
@keyframes pub-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: none; } }
.pub-spinner {
  width: 2.25rem; height: 2.25rem; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.12);
  border-top-color: var(--pub-a);
  animation: pub-spin 0.75s linear infinite;
}
@keyframes pub-spin { to { transform: rotate(360deg); } }

.pub-skeleton {
  border-radius: var(--pub-radius);
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%);
  background-size: 400% 100%;
  animation: pub-shimmer 1.4s ease infinite;
}
@keyframes pub-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

/* ── Pie ──────────────────────────────────────────────────────────────── */
.pub-footer {
  max-width: 64rem; width: 100%; margin: 0 auto;
  padding: 1.5rem; text-align: center;
  font-size: 0.75rem; line-height: 1.6; color: var(--pub-ink-dim);
  border-top: 1px solid var(--pub-line-soft);
}
.pub-footer a { color: var(--pub-a); text-decoration: none; }
.pub-footer a:hover { text-decoration: underline; }

/* ── Marca de plataforma (AetherBadge, montada en el layout raíz) ───────
   Su estilo por defecto es un pill claro pensado para el dashboard/login;
   sobre el fondo casi negro de estas páginas se ve como un elemento roto de
   otro producto. Esta regla solo existe mientras una página pública está
   montada (este bloque style lo inyecta PublicPage), y el combinador de
   hermano general (~) alcanza al badge porque en app/layout.tsx es hermano
   posterior del contenido de la página dentro de <body>. */
.pub-root ~ .aether-platform-badge {
  border-color: var(--pub-line) !important;
  background: rgba(255,255,255,0.06) !important;
  color: var(--pub-ink-dim) !important;
  backdrop-filter: blur(10px);
}
.pub-root ~ .aether-platform-badge:hover { background: rgba(255,255,255,0.1) !important; }

/* ── Diálogo de confirmación ──────────────────────────────────────────── */
.pub-dialog-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  padding: 1.25rem;
  background: rgba(2,3,8,0.72);
  backdrop-filter: blur(4px);
  animation: pub-fade 0.18s ease both;
}
@keyframes pub-fade { from { opacity: 0; } to { opacity: 1; } }
.pub-dialog {
  width: 100%; max-width: 24rem;
  border: 1px solid var(--pub-line);
  border-radius: var(--pub-radius);
  background: linear-gradient(180deg, var(--pub-glass) 0%, var(--pub-glass-2) 100%), rgba(10,13,22,0.94);
  backdrop-filter: blur(22px) saturate(140%);
  box-shadow: 0 24px 60px -24px rgba(0,0,0,0.9);
  padding: 1.5rem;
  animation: pub-rise 0.22s cubic-bezier(0.16,1,0.3,1) both;
}
.pub-dialog-title { margin: 0 0 0.6rem; font-size: 1.1rem; font-weight: 700; letter-spacing: -0.01em; }
.pub-dialog-message { margin: 0 0 1.5rem; font-size: 0.88rem; line-height: 1.55; color: var(--pub-ink-dim); }
.pub-dialog-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }
.pub-dialog-actions > .pub-btn { min-height: 2.6rem; padding: 0.6rem 1.1rem; }
@media (max-width: 420px) { .pub-dialog-actions { flex-direction: column-reverse; } .pub-dialog-actions > .pub-btn { width: 100%; } }
`;
