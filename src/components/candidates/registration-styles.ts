/**
 * Estilos propios de la página de postulación (`/register/candidate/[token]`).
 * Se montan después de `PAGEANT_SITE_STYLES`: la página usa el sistema visual
 * del micrositio del certamen (noche índigo, papel marfil, acento metálico,
 * Italiana/Karla/Cormorant) y acá solo se agrega lo que el micrositio no
 * tiene — pantallas de estado, requisitos, pasos y el formulario por pasos.
 */
export const REGISTRATION_STYLES = `
.cand { --field-bg: #ffffff; }
.cand-scroll-progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: linear-gradient(90deg, var(--a-mid), var(--a-bright)); transform-origin: left; transform: scaleX(0); pointer-events: none; }
.cand-eyebrow-live { display: inline-flex; align-items: center; gap: 0.7rem; }
.cand-countdown { display: flex; flex-direction: column; align-items: center; margin-top: 1.7rem; }
.cand-countdown .pgs-countdown { margin-top: 0.6rem; }
.cand-countdown-label { margin: 0; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--on-night-dim); }

/* ── Contacto del certamen ── */
.cand-contact { display: inline-flex; flex-wrap: wrap; gap: 0.6rem; }
.cand-contact a { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 2.6rem; padding: 0.5rem 1.05rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--a) 40%, transparent); color: var(--on-night); font-size: 0.88rem; text-decoration: none; overflow-wrap: anywhere; transition: border-color 0.3s, background-color 0.3s; }
.cand-contact a:hover { border-color: var(--a); background: color-mix(in srgb, var(--a) 12%, transparent); }
.is-paper .cand-contact a { border-color: var(--line-paper); color: var(--ink); background: #fff; }
.is-paper .cand-contact a:hover { border-color: var(--a-mid); }
.is-paper .cand-contact .pgs-inline-icon { color: var(--a-deep); }

/* ── Pantallas de estado (cargando, link inválido, cerrada, enviada) ── */
.cand-screen { position: relative; isolation: isolate; overflow: hidden; min-height: 100vh; min-height: 100svh; display: grid; place-items: center; padding: 6rem var(--gutter) 5rem; text-align: center; background: radial-gradient(120% 90% at 50% 0%, var(--night-3) 0%, var(--night-2) 40%, var(--night) 78%); }
.cand-screen-inner { position: relative; width: 100%; max-width: 40rem; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
.cand-screen-title { margin: 0; font-family: var(--display); font-weight: 400; font-size: clamp(2.6rem, 7vw, 4.4rem); line-height: 1.05; }
.cand-screen-title em { color: var(--a); }
.cand-screen-text { margin: 0; max-width: 34rem; font-size: 1.02rem; line-height: 1.75; color: var(--on-night-dim); }
.cand-screen-text strong { color: var(--on-night); font-weight: 600; }
.cand-spinner { width: 2.6rem; height: 2.6rem; border-radius: 50%; border: 2px solid var(--line-night); border-top-color: var(--a); animation: cand-spin 0.9s linear infinite; margin: 0 auto 1rem; }
@keyframes cand-spin { to { transform: rotate(360deg); } }
.cand-success-mark { width: 4.2rem; height: 4.2rem; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, var(--a-bright), var(--a-mid)); color: var(--ink); box-shadow: 0 0 0 10px color-mix(in srgb, var(--a) 12%, transparent), 0 20px 60px -20px var(--a); animation: pgs-rise 0.9s var(--ease) both; }
.cand-success-mark svg { width: 1.9rem; height: 1.9rem; }
.cand-folio { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; margin: 0.6rem 0; padding: 1.2rem 2.4rem; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--a) 55%, transparent); background: rgba(255, 255, 255, 0.04); }
.cand-folio span { font-size: 0.66rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--a); }
.cand-folio strong { font-family: var(--numeric); font-weight: 500; font-size: clamp(2rem, 6vw, 2.8rem); letter-spacing: 0.06em; font-variant-numeric: lining-nums; font-feature-settings: 'lnum' 1; color: var(--on-night); }
.cand-success-steps { list-style: none; margin: 0.4rem 0 0.6rem; padding: 0; width: 100%; max-width: 32rem; text-align: left; display: flex; flex-direction: column; }
.cand-success-steps li { display: flex; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid var(--line-night); font-size: 0.95rem; line-height: 1.55; color: var(--on-night-dim); }
.cand-success-steps li span { flex: none; font-family: var(--numeric); font-size: 1.1rem; color: var(--a); font-feature-settings: 'lnum' 1; }

/* ── La convocatoria ── */
.cand-quote { margin: 1.8rem 0; padding: 0.2rem 0 0.2rem 1.4rem; border-left: 2px solid var(--a-mid); font-family: var(--serif); font-style: italic; font-size: clamp(1.3rem, 2.4vw, 1.6rem); line-height: 1.45; color: var(--ink); }
.pgs-stat dd.cand-stat-word { font-family: var(--serif); font-style: italic; font-size: clamp(2.2rem, 4.4vw, 3.2rem); }

/* ── Requisitos ── */
.cand-req { display: grid; gap: clamp(2.5rem, 6vw, 5rem); }
@media (min-width: 900px) { .cand-req { grid-template-columns: 5fr 7fr; align-items: start; } .cand-req-head { position: sticky; top: 7rem; } }
.cand-req-text { margin: 1.3rem 0 2rem; max-width: 28rem; line-height: 1.7; }
.cand-req-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line-night); }
.cand-req-list li { display: grid; grid-template-columns: 3rem 1fr auto; align-items: center; gap: 1.2rem; padding: 1.4rem 0; border-bottom: 1px solid var(--line-night); }
.cand-req-num { font-family: var(--numeric); font-size: 1.6rem; color: var(--a); font-variant-numeric: lining-nums; font-feature-settings: 'lnum' 1; }
.cand-req-body { font-family: var(--serif); font-size: clamp(1.25rem, 2.2vw, 1.55rem); line-height: 1.4; color: var(--on-night); }
@media (max-width: 560px) { .cand-req-list li { grid-template-columns: 2.2rem 1fr; } .cand-req-list .pgs-check { display: none; } }

/* ── Cómo inscribirte ── */
.pgs-section.is-warm { background: var(--paper-2); }
.pgs-section.is-warm + .pgs-section.is-paper { border-top: 1px solid var(--line-paper); }
.cand-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2rem 1.6rem; grid-template-columns: 1fr; counter-reset: step; }
@media (min-width: 620px) { .cand-steps { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1000px) { .cand-steps { grid-template-columns: repeat(4, 1fr); } }
.cand-steps li { position: relative; display: flex; flex-direction: column; gap: 0.6rem; padding-top: 1.4rem; border-top: 1px solid var(--line-paper); }
.cand-steps li::before { content: ''; position: absolute; top: -1px; left: 0; width: 3rem; height: 2px; background: var(--a-mid); }
.cand-steps-num { font-family: var(--numeric); font-size: clamp(2.6rem, 5vw, 3.6rem); line-height: 1; color: var(--a-deep); font-variant-numeric: lining-nums; font-feature-settings: 'lnum' 1; }
.cand-steps-title { font-family: var(--display); font-size: 1.7rem; line-height: 1.15; color: var(--ink); }
.cand-steps-desc { font-size: 0.95rem; line-height: 1.65; color: var(--ink-soft); }

/* ── Preguntas ── */
.cand-faq-contact { margin-top: 1.8rem; display: flex; flex-direction: column; gap: 0.8rem; }
.cand-faq-contact p { margin: 0; color: var(--ink-soft); }

/* ── Formulario ── */
.cand-form-lead { margin: 1.2rem 0 0; max-width: 32rem; line-height: 1.7; }
.cand-form-anchor { scroll-margin-top: 6rem; }
.cand-insc-form-card { position: relative; max-width: 54rem; margin: 0 auto; padding: clamp(1.4rem, 4.5vw, 3.2rem); border-radius: 28px; background: var(--paper); color: var(--ink); box-shadow: 0 60px 120px -50px rgba(0, 0, 0, 0.75), 0 0 0 1px color-mix(in srgb, var(--a) 30%, transparent); }
.cand-insc-form-card::before { content: ''; position: absolute; left: 50%; top: 0; width: 7rem; height: 2px; margin-left: -3.5rem; background: linear-gradient(90deg, transparent, var(--a-mid), transparent); }
.cand-insc-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.7rem; }
.cand-insc-progress-step { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--a-deep); }
.cand-insc-progress-name { font-family: var(--display); font-size: 1.15rem; color: var(--ink); }
.cand-insc-progress-bar { height: 3px; border-radius: 999px; background: rgba(23, 19, 38, 0.08); overflow: hidden; margin-bottom: 1.8rem; }
.cand-insc-progress-bar > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--a-mid), var(--a-bright)); transition: width 0.6s var(--ease); }
.cand-insc-progress { list-style: none; margin: 0 0 2.2rem; padding: 0; display: flex; justify-content: space-between; gap: 0.4rem; }
.cand-insc-progress li { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.55rem; text-align: center; font-size: 0.72rem; color: var(--ink-soft); }
.cand-insc-progress li::before { content: ''; position: absolute; top: 1.05rem; right: 50%; width: 100%; height: 1px; background: var(--line-paper); z-index: 0; }
.cand-insc-progress li:first-child::before { display: none; }
.cand-insc-progress li.is-done::before, .cand-insc-progress li.is-current::before { background: var(--a-mid); }
.cand-insc-progress-dot { position: relative; z-index: 1; width: 2.1rem; height: 2.1rem; border-radius: 50%; display: grid; place-items: center; background: var(--paper); border: 1px solid var(--line-paper); font-family: var(--numeric); font-size: 1rem; font-feature-settings: 'lnum' 1; color: var(--ink-soft); transition: all 0.4s var(--ease); }
.cand-insc-progress-dot svg { width: 0.95rem; height: 0.95rem; }
.cand-insc-progress li.is-current .cand-insc-progress-dot { border-color: var(--a-mid); color: var(--a-deep); box-shadow: 0 0 0 5px color-mix(in srgb, var(--a) 30%, transparent); }
.cand-insc-progress li.is-current { color: var(--ink); font-weight: 600; }
.cand-insc-progress li.is-done .cand-insc-progress-dot { background: linear-gradient(135deg, var(--a-bright), var(--a-mid)); border-color: transparent; color: var(--ink); }
.cand-insc-progress-label { max-width: 7rem; line-height: 1.35; }
@media (max-width: 560px) { .cand-insc-progress-label { display: none; } .cand-insc-progress { margin-bottom: 1.8rem; } }

.cand-insc-fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; grid-template-columns: 1fr; gap: 1.2rem 1.3rem; animation: cand-step-in 0.5s var(--ease) both; }
@media (min-width: 640px) { .cand-insc-fieldset { grid-template-columns: 1fr 1fr; } }
@keyframes cand-step-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.cand-insc-fieldset legend { float: left; grid-column: 1 / -1; width: 100%; margin: 0 0 0.4rem; padding: 0 0 1rem; border-bottom: 1px solid var(--line-paper); font-family: var(--display); font-size: clamp(1.7rem, 3.2vw, 2.2rem); line-height: 1.1; color: var(--ink); }
.cand-insc-fieldset > .cand-insc-field:has(textarea),
.cand-insc-fieldset > .cand-insc-field:has(.cand-insc-dropzone),
.cand-insc-fieldset > .cand-insc-hint,
.cand-insc-fieldset > .cand-insc-guardian-block,
.cand-insc-fieldset > .cand-insc-checkbox,
.cand-insc-fieldset > .cand-insc-error { grid-column: 1 / -1; }
.cand-insc-field { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
.cand-insc-field > label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink); }
.cand-insc-field input, .cand-insc-field select, .cand-insc-field textarea {
  width: 100%; min-height: 3.25rem; padding: 0.85rem 1rem; border-radius: 14px; border: 1px solid var(--line-paper); background: var(--field-bg); color: var(--ink);
  font: 400 1rem/1.4 var(--sans); transition: border-color 0.3s, box-shadow 0.3s; -webkit-appearance: none; appearance: none;
}
.cand-insc-field textarea { min-height: 7rem; line-height: 1.6; resize: vertical; }
.cand-insc-field input::placeholder, .cand-insc-field textarea::placeholder { color: rgba(91, 84, 104, 0.55); }
.cand-insc-field input:hover, .cand-insc-field select:hover, .cand-insc-field textarea:hover { border-color: rgba(23, 19, 38, 0.28); }
.cand-insc-field input:focus, .cand-insc-field select:focus, .cand-insc-field textarea:focus { outline: none; border-color: var(--a-mid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--a) 35%, transparent); }
.cand-insc-field input[aria-invalid='true'], .cand-insc-field:has(.cand-insc-error) input, .cand-insc-field:has(.cand-insc-error) select, .cand-insc-field:has(.cand-insc-error) textarea { border-color: var(--copihue); }
.cand-insc-field select { padding-right: 2.6rem; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%237a5c22' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 1rem center; }
.cand-insc-field input[type='date'] { min-height: 3.25rem; }
.cand-insc-hint { margin: 0; font-size: 0.82rem; line-height: 1.5; color: var(--ink-soft); }
.cand-insc-error { margin: 0; font-size: 0.82rem; font-weight: 600; color: var(--copihue); }
.cand-insc-error-form { margin: 1.4rem 0 0; padding: 0.9rem 1.1rem; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--copihue) 45%, transparent); background: color-mix(in srgb, var(--copihue) 7%, transparent); }
.cand-insc-guardian-block { display: grid; gap: 1.1rem 1.3rem; grid-template-columns: 1fr; padding: 1.3rem; border-radius: 18px; border: 1px dashed color-mix(in srgb, var(--a-mid) 70%, transparent); background: var(--paper-2); }
@media (min-width: 640px) { .cand-insc-guardian-block { grid-template-columns: 1fr 1fr; } .cand-insc-guardian-block > .cand-insc-hint { grid-column: 1 / -1; } }
.cand-insc-checkbox { display: flex; align-items: flex-start; gap: 0.9rem; padding: 1.05rem 1.15rem; border-radius: 16px; border: 1px solid var(--line-paper); background: var(--field-bg); font-size: 0.95rem; line-height: 1.55; cursor: pointer; transition: border-color 0.3s, background-color 0.3s; }
.cand-insc-checkbox:hover { border-color: color-mix(in srgb, var(--a-mid) 60%, transparent); }
.cand-insc-checkbox:has(input:checked) { border-color: var(--a-mid); background: color-mix(in srgb, var(--a) 14%, #fff); }
.cand-insc-checkbox input { flex: none; width: 1.15rem; height: 1.15rem; margin-top: 0.2rem; accent-color: var(--a-deep); }
.cand-insc-checkbox a { color: var(--a-deep); font-weight: 600; }
.cand-insc-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

.cand-insc-dropzone { position: relative; padding: 1.6rem 1.2rem; border-radius: 18px; border: 1.5px dashed color-mix(in srgb, var(--a-mid) 60%, transparent); background: var(--field-bg); text-align: center; cursor: pointer; transition: border-color 0.3s, background-color 0.3s; }
.cand-insc-dropzone:hover, .cand-insc-dropzone.is-dragover { border-style: solid; border-color: var(--a-mid); background: color-mix(in srgb, var(--a) 10%, #fff); }
.cand-insc-dropzone:focus-visible { outline: 2px solid var(--a-mid); outline-offset: 3px; }
.cand-insc-dropzone.is-invalid { border-color: var(--copihue); border-style: solid; background: color-mix(in srgb, var(--copihue) 5%, #fff); }
.cand-insc-dropzone-input { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.cand-insc-dropzone-empty { display: flex; flex-direction: column; align-items: center; gap: 0.45rem; color: var(--a-mid); }
.cand-insc-dropzone-empty svg { width: 1.9rem; height: 1.9rem; }
.cand-insc-dropzone-empty p { margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--ink); }
.cand-insc-dropzone-empty .cand-insc-hint { font-weight: 400; }
.cand-insc-dropzone-preview { display: flex; align-items: center; gap: 1rem; text-align: left; }
.cand-insc-dropzone-preview img { width: 4.5rem; height: 6rem; flex: none; object-fit: cover; border-radius: 10px; box-shadow: 0 0 0 1px var(--line-paper); }
.cand-insc-dropzone-filebadge { width: 3.5rem; height: 3.5rem; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--paper-2); color: var(--a-deep); }
.cand-insc-dropzone-preview-info { display: flex; flex-direction: column; align-items: flex-start; gap: 0.55rem; min-width: 0; }
.cand-insc-dropzone-preview-info > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 600; }
.cand-insc-dropzone-remove { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.8rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--copihue) 50%, transparent); background: none; color: var(--copihue); font: 600 0.78rem var(--sans); cursor: pointer; }
.cand-insc-dropzone-remove:hover { background: var(--copihue); color: #fff; }

.cand-insc-form-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--line-paper); }
.cand-insc-submit, .cand-insc-btn-ghost { display: inline-flex; align-items: center; justify-content: center; min-height: 3.2rem; padding: 0.85rem 1.8rem; border-radius: 999px; font: 600 0.8rem/1 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: transform 0.4s var(--ease), box-shadow 0.4s var(--ease), border-color 0.3s; }
.cand-insc-submit { border: 0; background: linear-gradient(120deg, var(--a-bright), var(--a) 45%, var(--a-mid)); color: var(--ink); box-shadow: 0 14px 34px -16px var(--a-mid); }
.cand-insc-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 20px 44px -16px var(--a-mid); }
.cand-insc-btn-ghost { border: 1px solid rgba(23, 19, 38, 0.2); background: none; color: var(--ink); }
.cand-insc-btn-ghost:hover:not(:disabled) { border-color: var(--ink); }
.cand-insc-submit:disabled, .cand-insc-btn-ghost:disabled { opacity: 0.55; cursor: not-allowed; }
@media (max-width: 480px) { .cand-insc-form-nav > * { flex: 1; } .cand-insc-form-nav > span:empty { display: none; } }

/* ── Barra fija en móvil ── */
.cand-sticky { position: fixed; left: 0.75rem; right: 0.75rem; bottom: max(0.75rem, env(safe-area-inset-bottom)); z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.55rem 0.55rem 0.55rem 1.1rem; border-radius: 999px; background: rgba(7, 10, 28, 0.9); border: 1px solid var(--line-night); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.8); transform: translateY(160%); transition: transform 0.6s var(--ease); }
.cand-sticky.is-visible { transform: none; }
.cand-sticky > span { display: flex; flex-direction: column; min-width: 0; font-size: 0.68rem; line-height: 1.3; color: var(--on-night-dim); }
.cand-sticky strong { font-family: var(--display); font-weight: 400; font-size: 1rem; color: var(--a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (min-width: 900px) { .cand-sticky { display: none; } }
@media (max-width: 899px) { .cand .pgs-footer { padding-bottom: calc(6.5rem + env(safe-area-inset-bottom)); } }

.pgs-menu-foot .cand-contact { flex-direction: column; align-items: flex-start; }
@media (prefers-reduced-motion: reduce) { .cand-spinner { animation-duration: 2.4s !important; animation-iteration-count: infinite !important; } }
`;
