/**
 * Hoja de estilos del micrositio de la academia. Identidad editorial de moda:
 * tinta profunda + papel marfil + un acento elegible (dorado por defecto, o
 * rosa, violeta, esmeralda, rubí: `data-accent`), con las tipografías de los
 * certámenes (Italiana para títulos, Karla para texto, Cormorant para
 * cursivas y cifras), para que academia y certámenes de una misma productora
 * se sientan una sola marca.
 *
 * Reglas de rendimiento y de diseño (ver CLAUDE.md): solo se anima `transform`
 * y `opacity`; nada de `filter: blur`, `backdrop-filter`, `mix-blend-mode` ni
 * `clip-path` en capas grandes; las animaciones continuas (portada, cinta) se
 * pausan fuera de pantalla con `data-offscreen`; todo texto escrito por la
 * academia puede partirse (`overflow-wrap`) y las cajas nunca se ensanchan por
 * su contenido (`min-width: 0`). Dentro de este template literal no se
 * escriben acentos graves.
 */
export const ACADEMY_SITE_STYLES = `
.acs {
  --ink: #0f131b;
  --ink-2: #171c27;
  --ink-3: #202736;
  --paper: #fbf9f5;
  --paper-2: #f3eee5;
  --soft: #5b5f6b;
  --on-ink: #f6f2ea;
  --on-ink-dim: rgba(246, 242, 234, 0.72);
  --acc: #dbc076;
  --acc-soft: #f3e7c4;
  --acc-deep: #8a6a1f;
  --line: rgba(15, 19, 27, 0.12);
  --line-ink: rgba(246, 242, 234, 0.14);
  --display: var(--pgs-display), 'Didot', 'Bodoni 72', Georgia, serif;
  --serif: var(--pgs-serif), 'Cormorant Garamond', Georgia, serif;
  --sans: var(--pgs-body), system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(1rem, 4vw, 3rem);
  --radius: 1.25rem;
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
.acs[data-accent='rose'] { --acc: #e8a4b4; --acc-soft: #f8e1e7; --acc-deep: #9c3a55; }
.acs[data-accent='violet'] { --acc: #b9a3ec; --acc-soft: #ebe4fb; --acc-deep: #5d43a6; }
.acs[data-accent='emerald'] { --acc: #8fcfae; --acc-soft: #dff2e8; --acc-deep: #276b4c; }
.acs[data-accent='ruby'] { --acc: #e57f91; --acc-soft: #f6d6dc; --acc-deep: #8e1f35; }
.acs *, .acs *::before, .acs *::after { box-sizing: border-box; }
.acs ::selection { background: var(--acc); color: var(--ink); }
.acs a { color: inherit; }
.acs :focus-visible { outline: 2px solid var(--acc-deep); outline-offset: 3px; }
.acs .is-ink :focus-visible, .acs-top :focus-visible, .acs-hero :focus-visible, .acs-menu :focus-visible, .acs-footer :focus-visible, .acs-lightbox :focus-visible { outline-color: var(--acc); }
.acs h1, .acs h2, .acs h3, .acs p, .acs ul, .acs ol, .acs dl, .acs dd, .acs figure, .acs blockquote { margin: 0; }
.acs ul, .acs ol { padding: 0; list-style: none; }
.acs img { display: block; max-width: 100%; }
.acs em { font-family: var(--serif); font-style: italic; font-weight: 400; }
.acs button { font: inherit; color: inherit; }
.acs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.acs-skip { position: absolute; left: 1rem; top: -4rem; z-index: 80; padding: 0.6rem 1rem; background: var(--acc); color: var(--ink); border-radius: 999px; font-weight: 600; text-decoration: none; }
.acs-skip:focus { top: 1rem; }
.acs-icon { width: 1.05em; height: 1.05em; flex: none; }
.acs-wrap { width: 100%; max-width: 74rem; margin: 0 auto; padding: 0 var(--gutter); min-width: 0; }
.acs-wrap > * { min-width: 0; }
.acs-eyebrow { display: inline-flex; align-items: center; gap: 0.75rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--acc-deep); overflow-wrap: anywhere; }
.acs-eyebrow::before { content: ''; width: 2rem; height: 1px; background: currentColor; flex: none; }
.is-ink .acs-eyebrow, .acs-hero .acs-eyebrow { color: var(--acc); }

/* Aparición al hacer scroll: el estado vive en data-in (reveal.ts), nunca en una clase. */
.acs[data-motion='on'] [data-reveal]:not([data-in]) { opacity: 0; transform: translateY(22px); }
.acs[data-motion='on'] [data-reveal] { transition: opacity 0.9s var(--ease), transform 0.9s var(--ease); }

/* ── Botones ── */
.acs-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; max-width: 100%;
  min-height: 3.2rem; padding: 0.85rem 1.6rem; border-radius: 999px;
  font: 600 0.78rem/1.2 var(--sans); letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none; text-align: center;
  border: 1px solid transparent; cursor: pointer; transition: transform 0.35s var(--ease), background-color 0.25s, color 0.25s, border-color 0.25s;
}
.acs-btn:hover { transform: translateY(-2px); }
.acs-btn.is-acc { background: var(--acc); color: var(--ink); }
.acs-btn.is-acc:hover { background: var(--acc-soft); }
.acs-btn.is-line { border-color: currentColor; background: transparent; }
.acs-btn.is-ink { background: var(--ink); color: var(--on-ink); }
.acs-btn.is-ink:hover { background: var(--ink-3); }
.acs-btn .acs-icon { transition: transform 0.35s var(--ease); }
.acs-btn:hover .acs-icon { transform: translateX(3px); }

/* ── Barra superior: transparente sobre la portada, sólida al bajar ── */
.acs-top { position: fixed; inset: 0 0 auto 0; z-index: 50; color: var(--on-ink); transition: background-color 0.35s, border-color 0.35s; border-bottom: 1px solid transparent; }
.acs-top::before { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(to bottom, rgba(15, 19, 27, 0.55), rgba(15, 19, 27, 0)); transition: opacity 0.35s; }
.acs-top[data-solid] { background: var(--ink); border-bottom-color: var(--line-ink); }
.acs-top[data-solid]::before { opacity: 0; }
.acs-top-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 4.25rem; }
.acs-brand { display: flex; align-items: center; gap: 0.75rem; flex: 0 1 20rem; min-width: 0; text-decoration: none; }
.acs-brand img { height: 2.4rem; width: auto; max-width: 7rem; object-fit: contain; flex: none; }
.acs-brand-name { font-family: var(--display); font-size: 1.2rem; letter-spacing: 0.04em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acs-nav { display: none; flex: none; gap: 1.4rem; }
.acs-nav a { position: relative; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; color: var(--on-ink-dim); transition: color 0.2s; white-space: nowrap; }
.acs-nav a::after { content: ''; position: absolute; left: 0; right: 0; bottom: -0.35rem; height: 1px; background: var(--acc); transform: scaleX(0); transform-origin: left; transition: transform 0.35s var(--ease); }
.acs-nav a:hover { color: var(--on-ink); }
.acs-nav a:hover::after { transform: scaleX(1); }
.acs-top-actions { display: flex; align-items: center; gap: 0.5rem; flex: none; }
.acs-top .acs-btn { min-height: 2.6rem; padding: 0.55rem 1.15rem; font-size: 0.7rem; }
.acs-burger { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 1px solid var(--line-ink); background: transparent; cursor: pointer; }
.acs-burger span { position: relative; display: block; width: 1.1rem; height: 1px; background: currentColor; }
.acs-burger span::before, .acs-burger span::after { content: ''; position: absolute; left: 0; width: 100%; height: 1px; background: currentColor; }
.acs-burger span::before { top: -0.35rem; }
.acs-burger span::after { top: 0.35rem; }
@media (min-width: 1180px) { .acs-nav { display: flex; } .acs-burger { display: none; } }
@media (max-width: 420px) { .acs-top .acs-btn { display: none; } }

/* Menú en teléfonos y tabletas */
.acs-menu { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: var(--ink); color: var(--on-ink); overflow-y: auto; }
.acs-menu[hidden] { display: none; }
.acs-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 4.25rem; }
.acs-menu-close { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 1px solid var(--line-ink); background: transparent; cursor: pointer; font-size: 1.6rem; line-height: 1; flex: none; }
.acs-menu-links { display: flex; flex-direction: column; gap: 0.25rem; padding: 2rem 0; }
.acs-menu-links a { padding: 0.6rem 0; font-family: var(--display); font-size: clamp(1.8rem, 8vw, 2.6rem); line-height: 1.15; text-decoration: none; border-bottom: 1px solid var(--line-ink); overflow-wrap: anywhere; }
.acs-menu-foot { display: flex; flex-direction: column; gap: 1rem; padding-bottom: 2rem; margin-top: auto; }

/* ── Portada ── */
.acs-hero { position: relative; display: flex; flex-direction: column; justify-content: flex-end; min-height: 100svh; background: var(--ink); color: var(--on-ink); overflow: hidden; isolation: isolate; }
.acs-hero-media { position: absolute; inset: 0; z-index: -2; overflow: hidden; }
.acs-hero-media img { width: 100%; height: 100%; object-fit: cover; transform-origin: 60% 40%; animation: acs-kenburns 22s ease-in-out infinite alternate; will-change: transform; }
.acs-hero[data-offscreen] .acs-hero-media img { animation-play-state: paused; }
@keyframes acs-kenburns { from { transform: scale(1); } to { transform: scale(1.09) translate3d(-1.5%, -1%, 0); } }
.acs-hero::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(to top, rgba(15, 19, 27, 0.96) 0%, rgba(15, 19, 27, 0.62) 38%, rgba(15, 19, 27, 0.2) 70%, rgba(15, 19, 27, 0.35) 100%); }
.acs-hero.no-photo { background: radial-gradient(120% 90% at 80% 0%, var(--ink-3) 0%, var(--ink) 60%); }
.acs-hero-body { display: flex; flex-direction: column; align-items: flex-start; gap: 1.25rem; padding-top: 7rem; padding-bottom: clamp(2rem, 6vh, 3.5rem); }
.acs-hero-name { width: 100%; max-width: 100%; font-family: var(--display); font-weight: 400; font-size: clamp(2.6rem, 9.5vw, 7.5rem); line-height: 0.98; letter-spacing: 0.005em; overflow-wrap: anywhere; text-wrap: balance; }
/* El tamaño del nombre baja con su largo: un nombre de 90 letras no puede medir lo mismo que "Academia CR". */
.acs-hero-name[data-len='md'] { font-size: clamp(2.1rem, 6.8vw, 5.2rem); }
.acs-hero-name[data-len='lg'] { font-size: clamp(1.7rem, 5vw, 3.4rem); }
.acs-hero-tagline { max-width: 42rem; font-family: var(--serif); font-style: italic; font-size: clamp(1.3rem, 3.2vw, 2rem); line-height: 1.3; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-promo { display: inline-flex; align-items: center; gap: 0.6rem; max-width: 100%; padding: 0.5rem 1.1rem 0.5rem 0.6rem; border: 1px solid var(--acc); border-radius: 999px; background: rgba(15, 19, 27, 0.55); color: var(--acc-soft); font-size: 0.82rem; font-weight: 600; letter-spacing: 0.03em; overflow-wrap: anywhere; }
.acs-promo-tag { flex: none; padding: 0.2rem 0.55rem; border-radius: 999px; background: var(--acc); color: var(--ink); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; }
.acs-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.acs-hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); border-top: 1px solid var(--line-ink); }
.acs-hero-stat { display: flex; flex-direction: column; gap: 0.15rem; padding: 1.25rem 1rem 1.5rem 0; min-width: 0; }
.acs-hero-stat dd { order: 1; font-family: var(--serif); font-size: clamp(2rem, 5vw, 3rem); line-height: 1; color: var(--acc); overflow-wrap: anywhere; }
.acs-hero-stat dt { order: 2; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--on-ink-dim); overflow-wrap: anywhere; }

/* ── Cinta de disciplinas (decorativa: el contenido real está en «Clases») ── */
.acs-ribbon { position: relative; overflow: hidden; padding: 1.1rem 0; background: var(--acc); color: var(--ink); border-block: 1px solid var(--acc-deep); }
.acs-ribbon-track { display: flex; width: max-content; animation: acs-marquee 46s linear infinite; will-change: transform; }
.acs-ribbon[data-offscreen] .acs-ribbon-track { animation-play-state: paused; }
.acs-ribbon-group { display: flex; flex: none; align-items: center; min-width: 100vw; }
.acs-ribbon-item { display: inline-flex; align-items: center; gap: 1.5rem; padding-right: 1.5rem; font-family: var(--display); font-size: clamp(1.3rem, 3vw, 1.9rem); white-space: nowrap; }
.acs-ribbon-item::after { content: '\\2726'; font-size: 0.8em; color: var(--acc-deep); }
@keyframes acs-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ── Secciones ── */
.acs-section { position: relative; padding: clamp(4rem, 10vw, 7.5rem) 0; scroll-margin-top: 4rem; }
.acs-section.is-ink { background: var(--ink); color: var(--on-ink); }
.acs-section.is-alt { background: var(--paper-2); }
.acs-head { display: flex; flex-direction: column; gap: 0.9rem; margin-bottom: clamp(2rem, 5vw, 3.5rem); max-width: 46rem; }
.acs-head.is-center { margin-left: auto; margin-right: auto; text-align: center; align-items: center; }
.acs-head.is-center .acs-eyebrow::after { content: ''; width: 2rem; height: 1px; background: currentColor; flex: none; }
.acs-title { font-family: var(--display); font-weight: 400; font-size: clamp(2.1rem, 5.4vw, 3.8rem); line-height: 1.05; overflow-wrap: anywhere; text-wrap: balance; }
.acs-lead { font-size: 1.08rem; color: var(--soft); overflow-wrap: anywhere; }
.is-ink .acs-lead { color: var(--on-ink-dim); }
.acs-prose { font-size: 1.07rem; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-line; }
.acs-prose.is-lede::first-letter { float: left; margin: 0.08em 0.12em 0 0; font-family: var(--display); font-size: 3.4em; line-height: 0.8; color: var(--acc-deep); }

/* ── Quiénes somos ── */
.acs-about { display: grid; gap: clamp(2.5rem, 6vw, 4.5rem); align-items: center; }
@media (min-width: 900px) { .acs-about.has-media { grid-template-columns: 6fr 5fr; } }
.acs-collage { position: relative; display: grid; grid-template-columns: 1fr 0.8fr; gap: 1rem; align-items: end; }
.acs-collage-photo { border-radius: var(--radius); overflow: hidden; background: var(--paper-2); }
.acs-collage-photo img { width: 100%; height: 100%; object-fit: cover; }
.acs-collage-photo.is-main { aspect-ratio: 4 / 5; }
.acs-collage-photo.is-side { aspect-ratio: 3 / 4; transform: translateY(-2.5rem); }
.acs-collage.is-single { grid-template-columns: 1fr; }
.acs-collage-badge { position: absolute; left: -0.5rem; bottom: -1.25rem; display: flex; flex-direction: column; padding: 1rem 1.25rem; border-radius: 1rem; background: var(--ink); color: var(--on-ink); box-shadow: 0 18px 40px rgba(15, 19, 27, 0.25); max-width: 70%; }
.acs-collage-badge strong { font-family: var(--serif); font-size: 2.2rem; line-height: 1; color: var(--acc); }
.acs-collage-badge span { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--on-ink-dim); overflow-wrap: anywhere; }
@media (max-width: 520px) { .acs-collage-badge { left: 0.75rem; } }

/* ── Clases ── */
.acs-classes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr)); }
.acs-class { position: relative; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.5rem; min-height: 13rem; padding: 1.5rem 1.4rem; border: 1px solid var(--line-ink); border-radius: var(--radius); background: var(--ink-2); overflow: hidden; isolation: isolate; min-width: 0; transition: transform 0.45s var(--ease), border-color 0.3s; }
.acs-class:hover { transform: translateY(-4px); border-color: var(--acc); }
.acs-class-index { position: absolute; top: 1.2rem; right: 1.3rem; font-family: var(--serif); font-size: 1.05rem; color: var(--acc); }
.acs-class h3 { font-family: var(--display); font-weight: 400; font-size: 1.55rem; line-height: 1.15; overflow-wrap: anywhere; }
.acs-class p { font-size: 0.95rem; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-class.has-photo { min-height: 22rem; border-color: transparent; }
@media (max-width: 640px) { .acs-class { min-height: 8.5rem; } .acs-class.has-photo { min-height: 18rem; } }
.acs-class-photo { position: absolute; inset: 0; z-index: -2; overflow: hidden; }
.acs-class-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.9s var(--ease); }
.acs-class.has-photo:hover .acs-class-photo img { transform: scale(1.06); }
.acs-class.has-photo::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(to top, rgba(15, 19, 27, 0.94) 0%, rgba(15, 19, 27, 0.45) 55%, rgba(15, 19, 27, 0.05) 100%); }
.acs-class.has-photo .acs-class-index { color: var(--on-ink); }

/* ── Cómo funciona ── */
.acs-steps { position: relative; display: grid; gap: 1.25rem; }
@media (min-width: 900px) {
  .acs-steps { grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 2rem; }
  .acs-steps::before { content: ''; position: absolute; top: 1.6rem; left: 1.6rem; right: 1.6rem; height: 1px; background: var(--line); }
}
.acs-step { position: relative; display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
.acs-step-n { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 3.2rem; height: 3.2rem; border-radius: 999px; background: var(--ink); color: var(--acc); font-family: var(--serif); font-size: 1.4rem; flex: none; box-shadow: 0 0 0 6px var(--paper-2); }
@media (max-width: 899px) { .acs-step { padding-left: 4.5rem; min-height: 3.2rem; } .acs-step-n { position: absolute; left: 0; top: 0; } }
.acs-step h3 { font-family: var(--display); font-weight: 400; font-size: 1.45rem; line-height: 1.2; overflow-wrap: anywhere; }
.acs-step p { font-size: 0.97rem; color: var(--soft); overflow-wrap: anywhere; }

/* ── Horarios y mensualidad ── */
.acs-plan { display: grid; gap: 1.25rem; margin-top: clamp(2.5rem, 7vw, 4.5rem); }
@media (min-width: 900px) { .acs-plan.is-double { grid-template-columns: 7fr 5fr; } }
.acs-box { display: flex; flex-direction: column; gap: 1rem; padding: clamp(1.5rem, 4vw, 2.25rem); border-radius: var(--radius); border: 1px solid var(--line); background: #fff; min-width: 0; }
.acs-box h3 { font-family: var(--display); font-weight: 400; font-size: 1.7rem; line-height: 1.15; }
.acs-schedule { display: grid; gap: 0; }
.acs-schedule li { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 1rem; padding: 0.9rem 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.acs-schedule li:first-child { border-top: 0; padding-top: 0; }
.acs-schedule strong { font-weight: 600; min-width: 0; }
.acs-schedule span { font-size: 0.92rem; color: var(--soft); min-width: 0; }
.acs-box.is-fee { position: relative; overflow: hidden; background: var(--ink); color: var(--on-ink); border-color: var(--acc); }
.acs-box.is-fee::before { content: ''; position: absolute; top: -40%; right: -30%; width: 70%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, var(--acc) 0%, rgba(0, 0, 0, 0) 70%); opacity: 0.18; }
.acs-box.is-fee > * { position: relative; }
.acs-price { font-family: var(--serif); font-size: clamp(3rem, 9vw, 4.4rem); line-height: 1; color: var(--acc); overflow-wrap: anywhere; }
.acs-price small { font-family: var(--sans); font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--on-ink-dim); margin-left: 0.4rem; }
.acs-box.is-fee p:not(.acs-price):not(.acs-eyebrow) { color: var(--on-ink-dim); overflow-wrap: anywhere; }

/* ── Beneficios ── */
.acs-benefits-wrap { display: grid; gap: clamp(2rem, 5vw, 4rem); }
@media (min-width: 900px) { .acs-benefits-wrap { grid-template-columns: 5fr 7fr; align-items: start; } .acs-benefits-wrap .acs-head { position: sticky; top: 6rem; } }
.acs-benefits { display: grid; gap: 0; counter-reset: ben; }
.acs-benefits li { display: grid; grid-template-columns: auto 1fr; gap: 1.25rem; align-items: start; padding: 1.5rem 0; border-top: 1px solid var(--line-ink); overflow-wrap: anywhere; font-size: 1.08rem; }
.acs-benefits li:last-child { border-bottom: 1px solid var(--line-ink); }
.acs-benefits li::before { counter-increment: ben; content: counter(ben, decimal-leading-zero); font-family: var(--serif); font-size: 1.5rem; line-height: 1.1; color: var(--acc); }

/* ── Galería ── */
.acs-carousel { position: relative; }
.acs-track { display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 0.25rem; }
.acs-track::-webkit-scrollbar { display: none; }
.acs-slide { flex: 0 0 min(84%, 26rem); scroll-snap-align: center; min-width: 0; }
@media (min-width: 900px) { .acs-slide { flex-basis: min(31%, 26rem); scroll-snap-align: start; } }
.acs-slide-btn { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: var(--radius); }
.acs-slide-frame { position: relative; aspect-ratio: 4 / 5; border-radius: var(--radius); overflow: hidden; background: var(--paper-2); }
.acs-slide-frame img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s var(--ease); }
.acs-slide-btn:hover .acs-slide-frame img { transform: scale(1.04); }
.acs-slide figcaption { margin-top: 0.7rem; font-size: 0.92rem; color: var(--soft); overflow-wrap: anywhere; }
.acs-ctrl { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; }
.acs-dots { display: flex; flex-wrap: wrap; gap: 0.55rem; min-width: 0; }
.acs-dot { width: 0.65rem; height: 0.65rem; padding: 0; border-radius: 999px; border: 0; background: var(--line); cursor: pointer; transition: transform 0.25s var(--ease), background-color 0.25s; }
.acs-dot[aria-current='true'] { background: var(--acc-deep); transform: scale(1.4); }
.acs-arrows { display: flex; gap: 0.5rem; flex: none; }
.acs-arrow { display: inline-flex; align-items: center; justify-content: center; width: 3rem; height: 3rem; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; transition: background-color 0.25s, color 0.25s; }
.acs-arrow:hover { background: var(--ink); color: var(--on-ink); }
.acs-arrow svg { width: 1.1rem; height: 1.1rem; }

/* Foto ampliada */
.acs-lightbox { width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: rgba(8, 10, 15, 0.94); color: var(--on-ink); }
.acs-lightbox::backdrop { background: rgba(8, 10, 15, 0.94); }
.acs-lightbox-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; width: 100%; height: 100%; padding: 4.5rem 1rem 1.5rem; }
.acs-lightbox img { max-width: min(100%, 70rem); max-height: calc(100dvh - 10rem); width: auto; height: auto; object-fit: contain; border-radius: 0.75rem; }
.acs-lightbox p { max-width: 40rem; text-align: center; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-lightbox-bar { position: absolute; top: 1rem; left: 1rem; right: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.acs-lightbox .acs-arrow { background: transparent; color: var(--on-ink); border-color: var(--line-ink); }
.acs-lightbox .acs-arrow:hover { background: var(--on-ink); color: var(--ink); }
.acs-lightbox-count { font-size: 0.8rem; letter-spacing: 0.16em; color: var(--on-ink-dim); }

/* ── Testimonios ── */
.acs-quotes { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
.acs-quote { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 1.5rem; padding: 2rem 1.75rem 1.75rem; border-radius: var(--radius); border: 1px solid var(--line); background: #fff; min-width: 0; }
.acs-quote::before { content: '\\201C'; position: absolute; top: 0.4rem; right: 1.2rem; font-family: var(--serif); font-size: 5rem; line-height: 1; color: var(--acc); opacity: 0.55; }
.acs-quote blockquote { font-family: var(--serif); font-style: italic; font-size: 1.3rem; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-line; }
.acs-quote figcaption { display: flex; align-items: center; gap: 0.85rem; min-width: 0; }
.acs-avatar { flex: none; width: 3rem; height: 3rem; border-radius: 999px; overflow: hidden; background: var(--acc-soft); color: var(--acc-deep); display: inline-flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 1.25rem; }
.acs-avatar img { width: 100%; height: 100%; object-fit: cover; }
.acs-quote-who { display: flex; flex-direction: column; min-width: 0; }
.acs-quote-who strong { font-weight: 600; overflow-wrap: anywhere; }
.acs-quote-who span { font-size: 0.85rem; color: var(--soft); overflow-wrap: anywhere; }

/* ── Historia, hitos y dirección ── */
.acs-story { display: grid; gap: clamp(2.5rem, 6vw, 4.5rem); }
@media (min-width: 900px) { .acs-story.has-side { grid-template-columns: 7fr 5fr; align-items: start; } }
.acs .acs-timeline { position: relative; display: grid; gap: 1.5rem; margin-top: 2.5rem; padding-left: 1.75rem; }
.acs-timeline::before { content: ''; position: absolute; left: 0.3rem; top: 0.4rem; bottom: 0.4rem; width: 1px; background: var(--line); }
.acs-timeline li { position: relative; display: flex; flex-direction: column; gap: 0.2rem; overflow-wrap: anywhere; }
.acs-timeline li::before { content: ''; position: absolute; left: -1.75rem; top: 0.45rem; width: 0.65rem; height: 0.65rem; border-radius: 999px; background: var(--acc); box-shadow: 0 0 0 4px var(--paper-2); }
.acs-timeline strong { font-family: var(--serif); font-size: 1.5rem; line-height: 1.1; color: var(--acc-deep); }
.acs-timeline span { color: var(--soft); }
.acs-director { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.acs-director-photo { position: relative; aspect-ratio: 4 / 5; border-radius: var(--radius); overflow: hidden; background: var(--paper); }
.acs-director-photo img { width: 100%; height: 100%; object-fit: cover; }
.acs-director-card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; border-radius: var(--radius); background: var(--ink); color: var(--on-ink); }
.acs-director-photo + .acs-director-card { margin: -4rem 1rem 0; position: relative; }
.acs-director h3 { font-family: var(--display); font-weight: 400; font-size: 1.9rem; line-height: 1.1; overflow-wrap: anywhere; }
.acs-director-role { font-size: 0.74rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--acc); overflow-wrap: anywhere; }
.acs-director-card p:not(.acs-director-role) { font-size: 0.97rem; color: var(--on-ink-dim); overflow-wrap: anywhere; white-space: pre-line; }

/* ── Preguntas ── */
.acs-faq { display: grid; gap: 0; max-width: 52rem; margin: 0 auto; border-top: 1px solid var(--line); }
.acs-faq details { border-bottom: 1px solid var(--line); }
.acs-faq summary { display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; padding: 1.4rem 0.25rem; font-family: var(--display); font-size: clamp(1.2rem, 2.6vw, 1.5rem); line-height: 1.25; cursor: pointer; list-style: none; overflow-wrap: anywhere; }
.acs-faq summary::-webkit-details-marker { display: none; }
.acs-faq summary::after { content: '+'; display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border-radius: 999px; border: 1px solid var(--line); font-family: var(--sans); font-size: 1.3rem; line-height: 1; color: var(--acc-deep); flex: none; transition: transform 0.3s var(--ease), background-color 0.3s; }
.acs-faq details[open] summary::after { transform: rotate(45deg); background: var(--acc-soft); }
.acs-faq details p { padding: 0 0.25rem 1.5rem; color: var(--soft); overflow-wrap: anywhere; white-space: pre-line; max-width: 44rem; }

/* ── Cierre ── */
.acs-final { position: relative; overflow: hidden; isolation: isolate; padding: clamp(5rem, 14vw, 9rem) 0; background: var(--ink); color: var(--on-ink); text-align: center; }
.acs-final-media { position: absolute; inset: 0; z-index: -2; }
.acs-final-media img { width: 100%; height: 100%; object-fit: cover; }
.acs-final::after { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(15, 19, 27, 0.78); }
.acs-final .acs-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
.acs-final .acs-title { font-size: clamp(2.4rem, 7vw, 5rem); }
.acs-final .acs-actions { justify-content: center; }

/* ── Pie ── */
.acs-footer { padding: clamp(3.5rem, 8vw, 5.5rem) 0 2rem; background: var(--ink); color: var(--on-ink); border-top: 1px solid var(--line-ink); }
.acs-follow { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; margin-bottom: clamp(3rem, 7vw, 4.5rem); text-align: center; text-decoration: none; }
.acs-follow-label { display: inline-flex; align-items: center; gap: 0.6rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--acc); }
.acs-follow-handle { max-width: 100%; font-family: var(--serif); font-style: italic; font-size: clamp(2rem, 7vw, 4.6rem); line-height: 1.05; overflow-wrap: anywhere; transition: color 0.3s; }
.acs-follow:hover .acs-follow-handle { color: var(--acc); }
.acs-footer-grid { display: grid; gap: 2.5rem; padding-top: 2.5rem; border-top: 1px solid var(--line-ink); }
@media (min-width: 760px) { .acs-footer-grid { grid-template-columns: 5fr 3fr 4fr; } }
.acs-footer-brand { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.acs-footer-brand img { height: 3rem; width: auto; max-width: 9rem; object-fit: contain; }
.acs-footer-name { font-family: var(--display); font-size: 1.8rem; line-height: 1.15; overflow-wrap: anywhere; }
.acs-footer-tagline { color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs .acs-footer-title { margin-bottom: 0.9rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: var(--acc); }
.acs-footer-links { display: flex; flex-direction: column; gap: 0.55rem; }
.acs-footer-links a { color: var(--on-ink-dim); text-decoration: none; }
.acs-footer-links a:hover { color: var(--on-ink); }
.acs-contact { display: flex; flex-direction: column; gap: 0.7rem; }
.acs-contact a, .acs-contact span { display: inline-flex; align-items: flex-start; gap: 0.6rem; text-decoration: none; color: var(--on-ink-dim); overflow-wrap: anywhere; min-width: 0; }
.acs-contact .acs-icon { margin-top: 0.3em; }
.acs-contact a:hover { color: var(--acc); }
.acs .acs-legal { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line-ink); font-size: 0.8rem; color: var(--on-ink-dim); overflow-wrap: anywhere; }
.acs-wa { position: fixed; left: 1rem; bottom: 1rem; z-index: 45; display: inline-flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem; border-radius: 999px; background: #25d366; color: #fff; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28); transition: transform 0.3s var(--ease); }
.acs-wa:hover { transform: translateY(-3px) scale(1.04); }
.acs-wa svg { width: 1.75rem; height: 1.75rem; }

@media (prefers-reduced-motion: reduce) {
  .acs *, .acs *::before, .acs *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .acs[data-motion='on'] [data-reveal]:not([data-in]) { opacity: 1; transform: none; }
}
`;
