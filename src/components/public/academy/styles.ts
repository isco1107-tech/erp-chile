/**
 * Hoja de estilos del micrositio de la academia. Identidad: tinta + dorado
 * champaña sobre papel marfil, con las mismas tipografías de los certámenes
 * (Italiana para títulos, Karla para texto, Cormorant para cursivas), de modo
 * que la academia y los certámenes de la misma productora se sientan una marca.
 *
 * Reglas de rendimiento y de diseño (ver CLAUDE.md): solo se anima `transform`
 * y `opacity`; nada de `filter: blur`, `mix-blend-mode` ni `clip-path` en capas
 * grandes; todo texto escrito por el usuario puede partirse (`overflow-wrap`)
 * y las cajas nunca se ensanchan por su contenido (`min-width: 0`). Dentro de
 * este template literal no se escriben acentos graves.
 */
export const ACADEMY_SITE_STYLES = `
.acs {
  --ink: #12161f;
  --ink-2: #1c2230;
  --paper: #fbf9f5;
  --paper-2: #f3eee5;
  --soft: #5b5f6b;
  --on-ink: #f5f1e8;
  --on-ink-dim: rgba(245, 241, 232, 0.72);
  --gold: #dbc076;
  --gold-deep: #8a6a1f;
  --line: rgba(18, 22, 31, 0.12);
  --line-ink: rgba(219, 192, 118, 0.22);
  --display: var(--pgs-display), 'Didot', 'Bodoni 72', Georgia, serif;
  --serif: var(--pgs-serif), 'Cormorant Garamond', Georgia, serif;
  --sans: var(--pgs-body), system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(1rem, 4vw, 3rem);
  position: relative;
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: lining-nums;
  overflow-x: clip;
}
.acs *, .acs *::before, .acs *::after { box-sizing: border-box; }
.acs ::selection { background: var(--gold); color: var(--ink); }
.acs a { color: inherit; }
.acs :focus-visible { outline: 2px solid var(--gold-deep); outline-offset: 3px; }
.acs .is-ink :focus-visible, .acs-top :focus-visible { outline-color: var(--gold); }
.acs h1, .acs h2, .acs h3, .acs p, .acs ul, .acs ol, .acs dl, .acs dd { margin: 0; }
.acs ul, .acs ol { padding: 0; list-style: none; }
.acs img { display: block; max-width: 100%; }
.acs em { font-family: var(--serif); font-style: italic; font-weight: 400; }
.acs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.acs-skip { position: absolute; left: 1rem; top: -4rem; z-index: 60; padding: 0.6rem 1rem; background: var(--gold); color: var(--ink); border-radius: 999px; font-weight: 600; text-decoration: none; }
.acs-skip:focus { top: 1rem; }
.acs-icon { width: 1.05em; height: 1.05em; flex: none; }
.acs-wrap { width: 100%; max-width: 72rem; margin: 0 auto; padding: 0 var(--gutter); min-width: 0; }
.acs-wrap > * { min-width: 0; }
.acs-eyebrow { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase; color: var(--gold-deep); overflow-wrap: anywhere; }
.is-ink .acs-eyebrow { color: var(--gold); }

/* Aparición al hacer scroll: el estado vive en data-in (reveal.ts), nunca en una clase. */
.acs[data-motion='on'] [data-reveal]:not([data-in]) { opacity: 0; transform: translateY(18px); }
.acs[data-motion='on'] [data-reveal] { transition: opacity 0.8s var(--ease), transform 0.8s var(--ease); }

/* Botones */
.acs-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; max-width: 100%;
  min-height: 3.1rem; padding: 0.8rem 1.5rem; border-radius: 999px;
  font: 600 0.8rem/1.2 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; text-align: center;
  border: 1px solid transparent; cursor: pointer; transition: transform 0.35s var(--ease), background-color 0.25s, color 0.25s, border-color 0.25s;
}
.acs-btn:hover { transform: translateY(-2px); }
.acs-btn.is-gold { background: var(--gold); color: var(--ink); }
.acs-btn.is-gold:hover { background: #ead59a; }
.acs-btn.is-line { border-color: currentColor; background: transparent; color: inherit; }
.acs-btn.is-ink { background: var(--ink); color: var(--on-ink); }

/* Barra superior */
.acs-top { position: fixed; inset: 0 0 auto 0; z-index: 40; background: rgba(18, 22, 31, 0.92); color: var(--on-ink); border-bottom: 1px solid var(--line-ink); }
.acs-top-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3.75rem; }
.acs-brand { flex: 0 1 18rem; font-family: var(--display); font-size: 1.15rem; letter-spacing: 0.04em; text-decoration: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acs-nav { display: none; gap: 1.4rem; min-width: 0; }
.acs-nav a { font-size: 0.74rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none; color: var(--on-ink-dim); transition: color 0.2s; }
.acs-nav a:hover { color: var(--gold); }
.acs-top .acs-btn { min-height: 2.5rem; padding: 0.55rem 1.1rem; font-size: 0.7rem; flex: none; }
@media (min-width: 1180px) { .acs-nav { display: flex; } }

/* Portada */
.acs-hero { position: relative; display: flex; align-items: flex-end; min-height: 100svh; background: var(--ink); color: var(--on-ink); overflow: hidden; isolation: isolate; }
.acs-hero-media, .acs-hero-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
.acs-hero::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(to top, rgba(18, 22, 31, 0.92) 0%, rgba(18, 22, 31, 0.55) 45%, rgba(18, 22, 31, 0.25) 100%); }
.acs-hero-body { display: flex; flex-direction: column; align-items: flex-start; gap: 1.1rem; padding-top: 6rem; padding-bottom: clamp(2.5rem, 8vh, 5rem); }
.acs-hero-name { display: block; width: 100%; max-width: 100%; font-family: var(--display); font-weight: 400; font-size: clamp(2.4rem, 9vw, 6.5rem); line-height: 1.04; letter-spacing: 0.01em; overflow-wrap: anywhere; text-wrap: balance; }
/* El tamaño del nombre baja con su largo: un nombre de 90 letras no puede medir lo mismo que "Academia CR". */
.acs-hero-name[data-len='md'] { font-size: clamp(2rem, 6.5vw, 4.5rem); }
.acs-hero-name[data-len='lg'] { font-size: clamp(1.6rem, 5vw, 3.2rem); }
.acs-hero-tagline { max-width: 40rem; font-family: var(--serif); font-style: italic; font-size: clamp(1.25rem, 3.2vw, 1.9rem); line-height: 1.3; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-promo { display: inline-block; max-width: 100%; padding: 0.5rem 1rem; border: 1px solid var(--gold); border-radius: 999px; background: rgba(18, 22, 31, 0.6); color: var(--gold); font-size: 0.82rem; font-weight: 600; letter-spacing: 0.05em; overflow-wrap: anywhere; }
.acs-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.4rem; }

/* Secciones */
.acs-section { padding: clamp(3.5rem, 9vw, 6.5rem) 0; scroll-margin-top: 3.75rem; }
.acs-section.is-ink { background: var(--ink); color: var(--on-ink); }
.acs-section.is-alt { background: var(--paper-2); }
.acs-head { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: clamp(1.75rem, 5vw, 3rem); max-width: 44rem; }
.acs-head.is-center { margin-left: auto; margin-right: auto; text-align: center; align-items: center; }
.acs-title { font-family: var(--display); font-weight: 400; font-size: clamp(1.9rem, 5vw, 3.2rem); line-height: 1.1; overflow-wrap: anywhere; }
.acs-lead { font-size: 1.05rem; color: var(--soft); overflow-wrap: anywhere; }
.is-ink .acs-lead { color: var(--on-ink-dim); }
.acs-prose { display: flex; flex-direction: column; gap: 1rem; font-size: 1.05rem; overflow-wrap: anywhere; white-space: pre-line; }

/* Presentación + cifras */
.acs-about { display: grid; gap: 2rem; }
@media (min-width: 860px) { .acs-about { grid-template-columns: 7fr 4fr; align-items: start; gap: 4rem; } }
.acs-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 1rem; }
.acs-stat { padding: 1.25rem 1rem; border: 1px solid var(--line); border-radius: 1rem; background: #fff; text-align: center; }
.acs-stat dt { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--soft); order: 2; }
.acs-stat { display: flex; flex-direction: column; }
.acs-stat dd { order: 1; font-family: var(--serif); font-size: 2.6rem; line-height: 1.1; color: var(--gold-deep); overflow-wrap: anywhere; }

/* Clases */
.acs-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
.acs-card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1.4rem 1.3rem; border: 1px solid var(--line-ink); border-radius: 1rem; background: var(--ink-2); min-width: 0; }
.acs-card-index { font-family: var(--serif); font-size: 1.1rem; color: var(--gold); }
.acs-card h3 { font-family: var(--display); font-weight: 400; font-size: 1.35rem; line-height: 1.2; overflow-wrap: anywhere; }
.acs-card p { font-size: 0.95rem; color: var(--on-ink-dim); overflow-wrap: anywhere; }

/* Cómo funciona */
.acs-steps { display: grid; gap: 1.25rem; counter-reset: step; }
@media (min-width: 760px) { .acs-steps { grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); } }
.acs-step { position: relative; display: flex; flex-direction: column; gap: 0.5rem; padding: 1.5rem 1.3rem; border: 1px solid var(--line); border-radius: 1rem; background: #fff; min-width: 0; }
.acs-step-n { font-family: var(--serif); font-size: 2.2rem; line-height: 1; color: var(--gold-deep); }
.acs-step h3 { font-family: var(--display); font-weight: 400; font-size: 1.3rem; line-height: 1.2; overflow-wrap: anywhere; }
.acs-step p { font-size: 0.95rem; color: var(--soft); overflow-wrap: anywhere; }

/* Horarios + mensualidad */
.acs-plan { display: grid; gap: 1.25rem; margin-top: clamp(2rem, 6vw, 3.5rem); }
@media (min-width: 860px) { .acs-plan { grid-template-columns: 1fr 1fr; } }
.acs-box { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.6rem 1.4rem; border-radius: 1.1rem; border: 1px solid var(--line); background: #fff; min-width: 0; }
.acs-box h3 { font-family: var(--display); font-weight: 400; font-size: 1.5rem; }
.acs-schedule li { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.7rem 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.acs-schedule li:first-child { border-top: 0; padding-top: 0; }
.acs-schedule strong { font-weight: 600; }
.acs-schedule span { font-size: 0.92rem; color: var(--soft); }
.acs-box.is-fee { background: var(--ink); color: var(--on-ink); border-color: var(--ink); }
.acs-price { font-family: var(--serif); font-size: clamp(2.6rem, 8vw, 3.8rem); line-height: 1; color: var(--gold); overflow-wrap: anywhere; }
.acs-price small { font-family: var(--sans); font-size: 0.85rem; letter-spacing: 0.1em; color: var(--on-ink-dim); margin-left: 0.35rem; }
.acs-box.is-fee p { color: var(--on-ink-dim); overflow-wrap: anywhere; }

/* Beneficios */
.acs-benefits { display: grid; gap: 0.9rem; max-width: 52rem; }
.acs-benefits li { display: flex; gap: 0.9rem; align-items: flex-start; padding: 1rem 1.1rem; border-radius: 0.9rem; border: 1px solid var(--line-ink); background: var(--ink-2); overflow-wrap: anywhere; }
.acs-benefits .acs-icon { margin-top: 0.3rem; color: var(--gold); width: 1.15em; height: 1.15em; }

/* Carrusel */
.acs-carousel { position: relative; }
.acs-track { display: flex; gap: 0.9rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 0.25rem; }
.acs-track::-webkit-scrollbar { display: none; }
.acs-slide { flex: 0 0 min(86%, 26rem); scroll-snap-align: center; margin: 0; min-width: 0; }
@media (min-width: 900px) { .acs-slide { flex-basis: min(32%, 26rem); scroll-snap-align: start; } }
.acs-slide-frame { aspect-ratio: 4 / 5; border-radius: 1.1rem; overflow: hidden; background: var(--paper-2); }
.acs-slide-frame img { width: 100%; height: 100%; object-fit: cover; }
.acs-slide figcaption { margin-top: 0.6rem; font-size: 0.9rem; color: var(--soft); overflow-wrap: anywhere; }
.acs-ctrl { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.25rem; }
.acs-dots { display: flex; flex-wrap: wrap; gap: 0.5rem; min-width: 0; }
.acs-dot { width: 0.65rem; height: 0.65rem; padding: 0; border-radius: 999px; border: 0; background: var(--line); cursor: pointer; transition: transform 0.25s var(--ease), background-color 0.25s; }
.acs-dot[aria-current='true'] { background: var(--gold-deep); transform: scale(1.35); }
.acs-arrows { display: flex; gap: 0.5rem; flex: none; }
.acs-arrow { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; transition: background-color 0.25s, color 0.25s; }
.acs-arrow:hover { background: var(--ink); color: var(--on-ink); }
.acs-arrow svg { width: 1.1rem; height: 1.1rem; }

/* Historia + directora */
.acs-story { display: grid; gap: 2.5rem; }
@media (min-width: 860px) { .acs-story.has-director { grid-template-columns: 7fr 4fr; align-items: start; gap: 4rem; } }
.acs-director { display: flex; flex-direction: column; gap: 0.9rem; padding: 1.4rem; border: 1px solid var(--line); border-radius: 1.1rem; background: #fff; min-width: 0; }
.acs-director-photo { aspect-ratio: 4 / 5; border-radius: 0.9rem; overflow: hidden; background: var(--paper-2); }
.acs-director-photo img { width: 100%; height: 100%; object-fit: cover; }
.acs-director h3 { font-family: var(--display); font-weight: 400; font-size: 1.6rem; line-height: 1.15; overflow-wrap: anywhere; }
.acs-director-role { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold-deep); overflow-wrap: anywhere; }
.acs-director p { font-size: 0.97rem; color: var(--soft); overflow-wrap: anywhere; white-space: pre-line; }

/* Preguntas */
.acs-faq { display: grid; gap: 0.75rem; max-width: 48rem; margin: 0 auto; }
.acs-faq details { border: 1px solid var(--line); border-radius: 0.9rem; background: #fff; }
.acs-faq summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.05rem 1.2rem; font-weight: 600; cursor: pointer; list-style: none; overflow-wrap: anywhere; }
.acs-faq summary::-webkit-details-marker { display: none; }
.acs-faq summary::after { content: '+'; font-family: var(--serif); font-size: 1.6rem; line-height: 1; color: var(--gold-deep); flex: none; transition: transform 0.25s var(--ease); }
.acs-faq details[open] summary::after { transform: rotate(45deg); }
.acs-faq details p { padding: 0 1.2rem 1.15rem; color: var(--soft); overflow-wrap: anywhere; white-space: pre-line; }

/* Cierre y pie */
.acs-cta { display: flex; flex-direction: column; align-items: center; gap: 1.25rem; text-align: center; }
.acs-cta .acs-actions { justify-content: center; }
.acs-footer { padding: clamp(2.5rem, 7vw, 4rem) 0 2rem; background: var(--ink); color: var(--on-ink); border-top: 1px solid var(--line-ink); }
.acs-footer-grid { display: grid; gap: 2rem; }
@media (min-width: 760px) { .acs-footer-grid { grid-template-columns: 1fr 1fr; } }
.acs-footer-name { font-family: var(--display); font-size: 1.6rem; overflow-wrap: anywhere; }
.acs-contact { display: flex; flex-direction: column; gap: 0.6rem; }
.acs-contact a, .acs-contact span { display: inline-flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--on-ink-dim); overflow-wrap: anywhere; min-width: 0; }
.acs-contact a:hover { color: var(--gold); }
.acs .acs-legal { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--line-ink); font-size: 0.8rem; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-wa { position: fixed; left: 1rem; bottom: 1rem; z-index: 45; display: inline-flex; align-items: center; justify-content: center; width: 3.4rem; height: 3.4rem; border-radius: 999px; background: #25d366; color: #fff; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28); transition: transform 0.3s var(--ease); }
.acs-wa:hover { transform: translateY(-3px); }
.acs-wa svg { width: 1.7rem; height: 1.7rem; }

@media (prefers-reduced-motion: reduce) {
  .acs *, .acs *::before, .acs *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .acs[data-motion='on'] [data-reveal]:not([data-in]) { opacity: 1; transform: none; }
}
`;
