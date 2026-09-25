/**
 * Hoja de estilos del micrositio del certamen. Paleta "gala nocturna": noche
 * índigo + papel marfil + un acento metálico que sale de `publicAccent`
 * (dorado champaña por defecto). Los colores son variables del contenedor
 * `.pgs`, así cada certamen puede tener su acento sin tocar el resto.
 */
export const PAGEANT_SITE_STYLES = `
.pgs {
  --night: #070a1c;
  --night-2: #0c1130;
  --night-3: #111841;
  --paper: #fbf9f5;
  --paper-2: #f3eee5;
  --ink: #171326;
  --ink-soft: #5b5468;
  --on-night: #f5f1e8;
  --on-night-dim: rgba(245, 241, 232, 0.68);
  --line-night: rgba(233, 210, 160, 0.16);
  --line-paper: rgba(23, 19, 38, 0.12);
  --copihue: #b3243f;
  --a: #e9d2a0;
  --a-bright: #f6e7c4;
  --a-mid: #a8823f;
  --a-deep: #7a5c22;
  --display: var(--pgs-display), 'Didot', 'Bodoni 72', Georgia, serif;
  --serif: var(--pgs-serif), 'Cormorant Garamond', Georgia, serif;
  /* Cifras: Italiana solo tiene números antiguos (el 0 parece una o). */
  --numeric: var(--pgs-serif), 'Cormorant Garamond', Georgia, serif;
  --sans: var(--pgs-body), system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(1rem, 4vw, 3rem);
  position: relative;
  min-height: 100vh;
  background: var(--night);
  color: var(--on-night);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  /* Cormorant trae números antiguos por defecto: en texto corrido se piden de caja alta. */
  font-variant-numeric: lining-nums;
  overflow-x: clip;
}
.pgs[data-accent='rose'] { --a: #f2c2cb; --a-bright: #fbe3e8; --a-mid: #b3243f; --a-deep: #8e1b32; }
.pgs[data-accent='violet'] { --a: #d8cbf7; --a-bright: #eee8fd; --a-mid: #7a5bc7; --a-deep: #5b3fa8; }
.pgs[data-accent='cyan'] { --a: #bde7ef; --a-bright: #e3f6f9; --a-mid: #2e8a9e; --a-deep: #1e6475; }
.pgs[data-accent='emerald'] { --a: #c4e6d2; --a-bright: #e6f5ec; --a-mid: #2f7d5b; --a-deep: #245f45; }
.pgs *, .pgs *::before, .pgs *::after { box-sizing: border-box; }
.pgs ::selection { background: var(--a); color: var(--ink); }
.pgs a { color: inherit; }
.pgs :focus-visible { outline: 2px solid var(--a); outline-offset: 3px; }
.pgs .is-paper :focus-visible { outline-color: var(--a-deep); }
.pgs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pgs-skip { position: absolute; left: 1rem; top: -4rem; z-index: 60; padding: 0.6rem 1rem; background: var(--a); color: var(--ink); border-radius: 999px; font-weight: 600; text-decoration: none; }
.pgs-skip:focus { top: 1rem; }
.pgs-inline-icon { width: 1.05em; height: 1.05em; flex: none; }
.pgs em { font-family: var(--serif); font-style: italic; font-weight: 400; }
.pgs-muted { color: var(--on-night-dim); }
.pgs-wrap { width: 100%; max-width: 76rem; margin: 0 auto; padding: 0 var(--gutter); }
.pgs-eyebrow { margin: 0; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase; color: var(--a); }

/* Texto metálico: degradado del acento que se desliza lento. */
.pgs-foil {
  background: linear-gradient(100deg, var(--a-mid) 0%, var(--a-bright) 22%, var(--a) 40%, var(--a-mid) 58%, var(--a-bright) 78%, var(--a) 100%);
  background-size: 220% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: pgs-foil 9s linear infinite;
}
@keyframes pgs-foil { to { background-position: -220% center; } }


/* ── Botones ── */
.pgs-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem;
  min-height: 3.2rem; padding: 0.85rem 1.6rem; border-radius: 999px; overflow: hidden;
  font: 600 0.82rem/1.1 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; white-space: nowrap;
  border: 1px solid transparent; cursor: pointer; transition: transform 0.4s var(--ease), box-shadow 0.4s var(--ease), background-color 0.3s, color 0.3s, border-color 0.3s;
}
.pgs-btn:hover { transform: translateY(-2px); }
.pgs-btn:disabled { opacity: 0.6; cursor: progress; transform: none; }
.pgs-btn.is-gold { background: linear-gradient(120deg, var(--a-bright), var(--a) 45%, var(--a-mid)); color: var(--ink); box-shadow: 0 14px 40px -16px var(--a); }
.pgs-btn.is-gold::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%); transform: translateX(-120%); transition: transform 0.9s var(--ease); }
.pgs-btn.is-gold:hover::after { transform: translateX(120%); }
.pgs-btn.is-gold:hover { box-shadow: 0 20px 50px -14px var(--a); }
.pgs-btn.is-ghost { background: rgba(7, 10, 28, 0.35); color: var(--on-night); border-color: color-mix(in srgb, var(--a) 55%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.pgs-btn.is-ghost:hover { border-color: var(--a); color: var(--a-bright); }
.pgs-btn.is-ink { background: var(--ink); color: var(--paper); }
.pgs-btn.is-ink:hover { background: var(--night-3); box-shadow: 0 18px 40px -18px rgba(23, 19, 38, 0.7); }
.pgs-btn.is-small { min-height: 2.5rem; padding: 0.55rem 1.15rem; font-size: 0.72rem; }
.pgs-btn-icon { width: 1.15rem; height: 1.15rem; transition: transform 0.4s var(--ease); }
.pgs-btn-icon.is-lead { margin-left: -0.2rem; }
.pgs-btn:hover .pgs-btn-icon:not(.is-lead) { transform: translateX(4px); }
.pgs-btn-note { font-weight: 500; letter-spacing: 0.06em; text-transform: none; opacity: 0.72; font-size: 0.78rem; }
.pgs-link { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; text-decoration: none; color: var(--a); border-bottom: 1px solid color-mix(in srgb, currentColor 40%, transparent); padding-bottom: 0.2rem; transition: border-color 0.3s, color 0.3s; }
.pgs-link:hover { border-color: currentColor; }
.pgs-link.is-ink { color: var(--ink); }
.pgs-link.is-light { color: var(--a); }

/* ── Barra superior ── */
.pgs-top {
  position: fixed; inset: 0 0 auto; z-index: 40; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem;
  padding: 1rem var(--gutter); transition: background-color 0.5s var(--ease), padding 0.5s var(--ease), border-color 0.5s;
  border-bottom: 1px solid transparent;
}
.pgs-top.is-solid { padding-top: 0.7rem; padding-bottom: 0.7rem; background: rgba(7, 10, 28, 0.82); border-bottom-color: var(--line-night); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); }
.pgs-brand { display: inline-flex; align-items: center; gap: 0.65rem; text-decoration: none; min-width: 0; }
.pgs-brand-mark { width: 1.6rem; height: 1.6rem; color: var(--a); flex: none; }
.pgs-brand-logo { height: 2rem; width: auto; max-width: 7rem; object-fit: contain; }
.pgs-brand-name { font-family: var(--display); font-size: 1.3rem; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pgs-nav { display: none; gap: 2rem; }
.pgs-nav a { position: relative; font-size: 0.74rem; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; text-decoration: none; color: var(--on-night-dim); transition: color 0.3s; padding: 0.3rem 0; }
.pgs-nav a::after { content: ''; position: absolute; left: 0; right: 0; bottom: -0.1rem; height: 1px; background: var(--a); transform: scaleX(0); transform-origin: left; transition: transform 0.5s var(--ease); }
.pgs-nav a:hover, .pgs-nav a[aria-current='true'] { color: var(--on-night); }
.pgs-nav a:hover::after, .pgs-nav a[aria-current='true']::after { transform: scaleX(1); }
.pgs-top-actions { display: flex; align-items: center; gap: 0.75rem; flex: none; }
.pgs-burger { position: relative; width: 2.75rem; height: 2.75rem; border-radius: 999px; border: 1px solid var(--line-night); background: rgba(7, 10, 28, 0.4); cursor: pointer; }
.pgs-burger span { position: absolute; left: 50%; width: 1.1rem; height: 1px; margin-left: -0.55rem; background: var(--on-night); transition: transform 0.4s var(--ease), top 0.4s var(--ease); }
.pgs-burger span:first-child { top: 1.15rem; }
.pgs-burger span:last-child { top: 1.55rem; }
.pgs-burger.is-open span:first-child { top: 1.35rem; transform: rotate(45deg); }
.pgs-burger.is-open span:last-child { top: 1.35rem; transform: rotate(-45deg); }
@media (min-width: 1100px) { .pgs-nav { display: flex; } .pgs-burger { display: none; } }
@media (max-width: 480px) { .pgs-brand-lead { display: none; } .pgs-kicker-rule { width: 1.5rem; } .pgs-top .pgs-btn.is-small { padding: 0.5rem 0.95rem; } }

.pgs-menu {
  position: fixed; inset: 0; z-index: 35; display: flex; flex-direction: column; justify-content: space-between;
  padding: 6.5rem var(--gutter) 2.5rem; background: radial-gradient(120% 80% at 80% 0%, var(--night-3), var(--night) 70%); overflow-y: auto;
}
.pgs-menu ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.pgs-menu li { opacity: 0; transform: translateY(14px); animation: pgs-rise 0.7s var(--ease) forwards; }
.pgs-menu ol a { display: flex; align-items: baseline; gap: 1rem; padding: 0.55rem 0; font-family: var(--display); font-size: clamp(2rem, 9vw, 3.2rem); line-height: 1.1; text-decoration: none; border-bottom: 1px solid var(--line-night); }
.pgs-menu-index { font-family: var(--sans); font-size: 0.72rem; letter-spacing: 0.2em; color: var(--a); }
.pgs-menu-foot { display: flex; flex-direction: column; gap: 0.8rem; margin-top: 2rem; }
.pgs-menu-foot a { display: inline-flex; align-items: center; gap: 0.6rem; color: var(--on-night-dim); text-decoration: none; font-size: 0.95rem; }

/* ── Hero ── */
.pgs-hero { position: relative; min-height: 100vh; min-height: 100svh; display: flex; align-items: center; justify-content: center; overflow: hidden; isolation: isolate; background: radial-gradient(120% 90% at 50% 0%, var(--night-3) 0%, var(--night-2) 40%, var(--night) 78%); }
.pgs-hero-cover { position: absolute; inset: 0; z-index: -2; }
.pgs-hero-cover img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; filter: saturate(0.9) contrast(1.05); animation: pgs-kenburns 22s ease-out both; }
.pgs-hero-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(7,10,28,0.72) 0%, rgba(7,10,28,0.45) 35%, rgba(7,10,28,0.7) 70%, var(--night) 100%), radial-gradient(60% 50% at 50% 50%, rgba(7,10,28,0.35), transparent 70%); }
@keyframes pgs-kenburns { from { transform: scale(1.12); } to { transform: scale(1); } }
.pgs-sky { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.pgs-hero.has-cover .pgs-sky { opacity: 0.55; }
.pgs-aurora { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.55; mix-blend-mode: screen; }
.pgs-aurora.is-one { width: 60vw; height: 38vw; left: -12vw; top: -10vw; background: radial-gradient(closest-side, color-mix(in srgb, var(--a) 45%, transparent), transparent); animation: pgs-drift 18s ease-in-out infinite alternate; }
.pgs-aurora.is-two { width: 52vw; height: 36vw; right: -14vw; top: 12vh; background: radial-gradient(closest-side, rgba(90, 80, 200, 0.45), transparent); animation: pgs-drift 22s ease-in-out infinite alternate-reverse; }
.pgs-aurora.is-three { width: 70vw; height: 30vw; left: 15vw; bottom: -16vw; background: radial-gradient(closest-side, rgba(179, 36, 63, 0.28), transparent); animation: pgs-drift 26s ease-in-out infinite alternate; }
@keyframes pgs-drift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(6vw, 4vh, 0) scale(1.12); } }
.pgs-star { position: absolute; border-radius: 50%; background: var(--a-bright); box-shadow: 0 0 6px var(--a-bright); animation: pgs-twinkle 4s ease-in-out infinite; opacity: 0.2; }
@keyframes pgs-twinkle { 0%, 100% { opacity: 0.15; transform: scale(0.8); } 50% { opacity: 0.95; transform: scale(1.15); } }
.pgs-grain { position: absolute; inset: 0; opacity: 0.08; mix-blend-mode: overlay; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.pgs-frame span { position: absolute; width: clamp(2.5rem, 6vw, 5rem); height: clamp(2.5rem, 6vw, 5rem); border-color: color-mix(in srgb, var(--a) 50%, transparent); border-style: solid; border-width: 0; opacity: 0; animation: pgs-fade 1.6s 1s var(--ease) forwards; }
.pgs-frame .is-tl { top: 5.5rem; left: var(--gutter); border-top-width: 1px; border-left-width: 1px; }
.pgs-frame .is-tr { top: 5.5rem; right: var(--gutter); border-top-width: 1px; border-right-width: 1px; }
.pgs-frame .is-bl { bottom: 2rem; left: var(--gutter); border-bottom-width: 1px; border-left-width: 1px; }
.pgs-frame .is-br { bottom: 2rem; right: var(--gutter); border-bottom-width: 1px; border-right-width: 1px; }
@keyframes pgs-fade { to { opacity: 1; } }
.pgs-hero-inner { position: relative; width: 100%; max-width: 64rem; padding: 6.5rem var(--gutter) 5rem; display: flex; flex-direction: column; align-items: center; text-align: center; }
.pgs-tiara { width: clamp(6rem, 10vw, 8.5rem); height: auto; margin-bottom: 1rem; filter: drop-shadow(0 0 18px color-mix(in srgb, var(--a) 45%, transparent)); }
.pgs-draw { stroke-dasharray: 420; stroke-dashoffset: 420; animation: pgs-draw 2.6s 0.1s var(--ease) forwards; }
.pgs-jewels { opacity: 0; animation: pgs-fade 1s 1.6s ease forwards; }
@keyframes pgs-draw { to { stroke-dashoffset: 0; } }
.pgs-rise { opacity: 0; animation: pgs-rise 1.1s var(--ease) forwards; }
@keyframes pgs-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.pgs-hero-eyebrow { margin: 0 0 1.1rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.34em; text-transform: uppercase; color: var(--a); }
.pgs-title { margin: 0; display: flex; flex-direction: column; align-items: center; font-weight: 400; }
.pgs-title-lead { display: inline-flex; align-items: center; gap: 1.1rem; font-family: var(--sans); font-size: clamp(0.8rem, 1.5vw, 1.05rem); font-weight: 500; letter-spacing: 0.55em; text-transform: uppercase; color: var(--on-night); margin-right: -0.55em; }
.pgs-title-rule { width: clamp(1.5rem, 6vw, 4.5rem); height: 1px; background: linear-gradient(90deg, transparent, var(--a)); }
.pgs-title-rule:last-child { background: linear-gradient(90deg, var(--a), transparent); margin-left: -0.55em; }
.pgs-title-main { display: block; font-family: var(--display); font-weight: 400; font-size: min(12rem, calc(90vw / var(--pgs-fit, 4)), 20vh); line-height: 0.92; letter-spacing: 0.01em; margin: 0.6rem 0 0.3rem; padding: 0 0.06em; white-space: nowrap; filter: drop-shadow(0 10px 40px rgba(0, 0, 0, 0.35)); }
.pgs-title-edition { display: inline-flex; align-items: center; gap: 1rem; font-family: var(--sans); font-size: clamp(0.8rem, 1.4vw, 1rem); font-weight: 600; letter-spacing: 0.6em; margin-right: -0.6em; color: var(--a); }
.pgs-title-edition::before, .pgs-title-edition::after { content: ''; width: 0.45rem; height: 0.45rem; transform: rotate(45deg); border: 1px solid var(--a); }
.pgs-title-edition::after { margin-left: -0.6em; }
.pgs-tagline { margin: 1.4rem 0 0; max-width: 38rem; font-family: var(--serif); font-style: italic; font-size: clamp(1.2rem, 2.3vw, 1.6rem); line-height: 1.45; color: var(--on-night); }
.pgs-hero-meta { margin: 1.2rem 0 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem 1.8rem; font-size: 0.9rem; letter-spacing: 0.04em; color: var(--on-night-dim); }
.pgs-hero-meta > span { display: inline-flex; align-items: center; gap: 0.5rem; }
.pgs-hero-meta .pgs-inline-icon { color: var(--a); }
.pgs-countdown { display: flex; justify-content: center; margin-top: 1.7rem; min-height: 4.8rem; }
.pgs-count { position: relative; min-width: clamp(4.4rem, 12vw, 7rem); padding: 0 clamp(0.4rem, 1.5vw, 1.2rem); display: flex; flex-direction: column; align-items: center; }
.pgs-count + .pgs-count::before { content: ''; position: absolute; left: 0; top: 12%; bottom: 22%; width: 1px; background: linear-gradient(180deg, transparent, var(--line-night) 20%, color-mix(in srgb, var(--a) 45%, transparent), var(--line-night) 80%, transparent); }
.pgs-count-value { font-size: clamp(2.4rem, 5.4vw, 3.6rem); font-weight: 400; line-height: 1; font-variant-numeric: tabular-nums; color: var(--on-night); }
.pgs-count-label { margin-top: 0.55rem; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--a); }
.pgs-hero-ctas { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.8rem; margin-top: 1.8rem; }
.pgs-hero-note { display: inline-flex; align-items: center; gap: 0.6rem; margin: 1.4rem 0 0; font-size: 0.82rem; letter-spacing: 0.04em; color: var(--on-night-dim); }
.pgs-live-dot { position: relative; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #e0455f; flex: none; }
.pgs-live-dot::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid #e0455f; animation: pgs-pulse 2s ease-out infinite; }
@keyframes pgs-pulse { from { transform: scale(0.6); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }
.pgs-scroll-cue { position: absolute; bottom: 1.6rem; left: 50%; width: 1.5rem; height: 2.4rem; margin-left: -0.75rem; border-radius: 999px; border: 1px solid var(--line-night); }
.pgs-scroll-cue span { position: absolute; left: 50%; top: 0.45rem; width: 2px; height: 0.5rem; margin-left: -1px; border-radius: 2px; background: var(--a); animation: pgs-scroll 2.2s var(--ease) infinite; }
@keyframes pgs-scroll { 0% { transform: translateY(0); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(0.9rem); opacity: 0; } }
/* Etiquetas largas/cortas según el ancho (la oculta sale también del árbol de accesibilidad). */
.pgs-sm { display: none; }
@media (max-width: 640px) {
  .pgs-hero-inner { padding-top: 5.6rem; padding-bottom: 3.5rem; }
  .pgs-tiara { width: 5rem; margin-bottom: 0.7rem; }
  .pgs-hero-eyebrow { margin-bottom: 0.8rem; font-size: 0.62rem; letter-spacing: 0.26em; }
  .pgs-title-lead { letter-spacing: 0.4em; margin-right: -0.4em; gap: 0.7rem; }
  .pgs-tagline { font-size: 1.12rem; margin-top: 1.1rem; }
  .pgs-hero-meta { flex-direction: column; align-items: center; gap: 0.4rem; font-size: 0.84rem; margin-top: 1rem; }
  .pgs-countdown { margin-top: 1.3rem; min-height: 4rem; }
  .pgs-count { min-width: 0; flex: 1; max-width: 5.2rem; padding: 0 0.25rem; }
  .pgs-count-value { font-size: clamp(2rem, 9vw, 2.3rem); }
  .pgs-count-label { font-size: 0.56rem; letter-spacing: 0.14em; }
  .pgs-hero-ctas { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; width: 100%; max-width: 24rem; margin-top: 1.5rem; }
  .pgs-hero-ctas > :first-child { grid-column: 1 / -1; }
  .pgs-hero-ctas > :only-child, .pgs-hero-ctas > :first-child:nth-last-child(2) ~ * { grid-column: 1 / -1; }
  .pgs-hero-ctas .pgs-btn.is-ghost { min-height: 2.9rem; padding: 0.7rem 0.8rem; font-size: 0.68rem; letter-spacing: 0.1em; }
  .pgs-lg { display: none; }
  .pgs-sm { display: inline; }
  .pgs-hero-note { margin-top: 1rem; font-size: 0.76rem; }
  .pgs-scroll-cue, .pgs-frame .is-bl, .pgs-frame .is-br { display: none; }
  .pgs-frame .is-tl, .pgs-frame .is-tr { top: 4.6rem; width: 2rem; height: 2rem; }
}

/* ── Cinta ── */
.pgs-ribbon { position: relative; overflow: hidden; padding: 1.05rem 0; background: linear-gradient(90deg, var(--night-2), var(--night-3), var(--night-2)); border-block: 1px solid var(--line-night); }
.pgs-ribbon-track { display: flex; width: max-content; animation: pgs-marquee 60s linear infinite; }
.pgs-ribbon:hover .pgs-ribbon-track { animation-play-state: paused; }
.pgs-ribbon-group { display: flex; flex: none; }
.pgs-ribbon-item { display: inline-flex; align-items: center; gap: 1.6rem; padding-right: 1.6rem; font-size: 0.74rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--on-night); white-space: nowrap; }
.pgs-ribbon-diamond { width: 0.55rem; height: 0.55rem; color: var(--a); }
@keyframes pgs-marquee { to { transform: translateX(-50%); } }

/* ── Secciones ── */
.pgs-section { position: relative; padding: clamp(5rem, 12vw, 9rem) 0; }
.pgs-section.is-night { background: var(--night); color: var(--on-night); }
.pgs-section.is-night + .pgs-section.is-night { border-top: 1px solid var(--line-night); }
.pgs-section.is-deep { background: radial-gradient(90% 70% at 85% 10%, var(--night-3), var(--night) 70%); }
.pgs-section.is-paper { background: var(--paper); color: var(--ink); }
.pgs-section-head { margin-bottom: clamp(2.5rem, 6vw, 4rem); max-width: 44rem; }
.pgs-section-head.is-split { max-width: none; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1.5rem 3rem; }
.pgs-section-head.is-center { margin-left: auto; margin-right: auto; text-align: center; display: flex; flex-direction: column; align-items: center; }
.pgs-kicker { display: inline-flex; align-items: center; gap: 0.9rem; margin: 0 0 1.4rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--a); }
.pgs-kicker.is-paper { color: var(--a-deep); }
.pgs-kicker-index { font-family: var(--display); font-size: 1.05rem; letter-spacing: 0.08em; }
.pgs-kicker-rule { width: 2.5rem; height: 1px; background: currentColor; opacity: 0.6; }
.pgs-h2 { margin: 0; font-family: var(--display); font-weight: 400; font-size: clamp(2.6rem, 6.4vw, 5rem); line-height: 1.02; letter-spacing: 0.005em; color: var(--on-night); }
.pgs-h2 em { color: var(--a); font-size: 1.04em; }
.pgs-h2.is-ink { color: var(--ink); }
.pgs-h2.is-ink em { color: var(--a-deep); }
.pgs-h3 { margin: clamp(3.5rem, 8vw, 5rem) 0 1.6rem; font-family: var(--display); font-weight: 400; font-size: clamp(1.8rem, 3.6vw, 2.6rem); line-height: 1.1; text-align: center; }
.pgs-h3 em { color: var(--a-deep); }
.pgs-note { margin: 2.5rem 0 0; text-align: center; color: var(--on-night-dim); }
.pgs-note a { color: var(--a); }
.pgs-fine { margin: 1.2rem 0 0; font-size: 0.82rem; color: var(--ink-soft); }
.pgs-ornament { display: flex; align-items: center; gap: 0.7rem; color: var(--a); }
.pgs-ornament span { width: 3rem; height: 1px; background: currentColor; opacity: 0.5; }
.pgs-ornament svg { width: 0.6rem; height: 0.6rem; }
.pgs-ornament.is-left { justify-content: flex-start; margin: 0.4rem 0; }

/* Entrada al hacer scroll (solo con JS: sin él, todo visible). */
.pgs[data-motion='on'] [data-reveal] { opacity: 0; transform: translateY(28px); transition: opacity 1s var(--ease), transform 1.1s var(--ease); }
.pgs[data-motion='on'] [data-reveal].is-in { opacity: 1; transform: none; }

/* ── El certamen ── */
.pgs-about { display: grid; gap: clamp(2rem, 5vw, 5rem); grid-template-columns: 1fr; }
@media (min-width: 900px) { .pgs-about { grid-template-columns: 5fr 7fr; align-items: start; } .pgs-about-head { position: sticky; top: 7rem; } }
.pgs-prose p { margin: 0 0 1.3rem; font-size: 1.08rem; line-height: 1.85; color: var(--ink-soft); }
.pgs-prose p.is-lead { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 1.8rem); line-height: 1.5; color: var(--ink); }
.pgs-prose p.is-lead::first-letter { float: left; font-family: var(--display); font-style: normal; font-size: 4.6em; line-height: 0.82; margin: 0.08em 0.12em 0 0; color: var(--a-deep); }
.pgs-stats { margin: clamp(3.5rem, 8vw, 6rem) 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); border-top: 1px solid var(--line-paper); }
.pgs-stat { display: flex; flex-direction: column-reverse; gap: 0.4rem; padding: 2rem 1.5rem 0 0; }
.pgs-stat + .pgs-stat { padding-left: 1.5rem; border-left: 1px solid var(--line-paper); }
.pgs-stat dd { margin: 0; font-family: var(--display); font-size: clamp(3rem, 6vw, 4.6rem); line-height: 1; color: var(--ink); }
.pgs-stat dt { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: var(--a-deep); }
@media (max-width: 560px) { .pgs-stats { grid-template-columns: 1fr 1fr; } .pgs-stat:nth-child(odd) { padding-left: 0; border-left: 0; } .pgs-stat { padding-bottom: 1.5rem; } }

/* ── El camino ── */
.pgs-journey { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.2rem; position: relative; }
.pgs-journey li { position: relative; display: grid; grid-template-columns: 3.2rem 1fr; column-gap: 1.1rem; row-gap: 0.25rem; align-items: start; }
.pgs-journey li::before { content: ''; position: absolute; left: 1.6rem; top: 3.2rem; bottom: -2.2rem; width: 1px; background: var(--line-night); }
.pgs-journey li:last-child::before { display: none; }
.pgs-journey li.is-done::before { background: linear-gradient(180deg, var(--a), color-mix(in srgb, var(--a) 30%, transparent)); }
.pgs-journey-node { grid-row: span 2; width: 3.2rem; height: 3.2rem; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line-night); font-family: var(--display); font-size: 1.2rem; color: var(--on-night-dim); background: var(--night); position: relative; z-index: 1; }
.pgs-journey-node svg { width: 1.3rem; height: 1.3rem; }
.pgs-journey li.is-done .pgs-journey-node { background: linear-gradient(135deg, var(--a-bright), var(--a-mid)); color: var(--ink); border-color: transparent; }
.pgs-journey li.is-current .pgs-journey-node { border-color: var(--a); color: var(--a); box-shadow: 0 0 0 6px color-mix(in srgb, var(--a) 12%, transparent), 0 0 30px color-mix(in srgb, var(--a) 40%, transparent); }
.pgs-journey-title { font-family: var(--display); font-size: 1.7rem; line-height: 1.15; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.7rem; padding-top: 0.3rem; }
.pgs-journey-now { font-family: var(--sans); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; padding: 0.3rem 0.6rem; border-radius: 999px; background: color-mix(in srgb, var(--a) 16%, transparent); color: var(--a); border: 1px solid color-mix(in srgb, var(--a) 40%, transparent); }
.pgs-journey-detail { font-size: 0.92rem; line-height: 1.55; color: var(--on-night-dim); }
.pgs-journey li.is-upcoming .pgs-journey-title { color: var(--on-night-dim); }
@media (min-width: 900px) {
  .pgs-journey { grid-template-columns: repeat(5, 1fr); gap: 1.5rem; }
  .pgs-journey li { grid-template-columns: 1fr; row-gap: 0.6rem; }
  .pgs-journey li::before { left: 3.2rem; right: -1.5rem; top: 1.6rem; bottom: auto; width: auto; height: 1px; }
  .pgs-journey li.is-done::before { background: linear-gradient(90deg, var(--a), color-mix(in srgb, var(--a) 30%, transparent)); }
  .pgs-journey-node { grid-row: auto; margin-bottom: 0.8rem; }
  .pgs-journey-title { padding-top: 0; }
}

/* ── Convocatoria ── */
.pgs-apply { position: relative; overflow: hidden; isolation: isolate; display: grid; gap: clamp(2rem, 5vw, 4rem); padding: clamp(2rem, 6vw, 4.5rem); border-radius: 28px; background: linear-gradient(145deg, var(--night-3), var(--night) 70%); color: var(--on-night); box-shadow: 0 50px 100px -40px rgba(23, 19, 38, 0.55); }
@media (min-width: 900px) { .pgs-apply { grid-template-columns: 7fr 5fr; align-items: center; } }
@media (min-width: 640px) and (max-width: 899px) { .pgs-apply-side { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 2rem; } }
.pgs-apply::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: linear-gradient(140deg, color-mix(in srgb, var(--a) 70%, transparent), transparent 40%, transparent 60%, color-mix(in srgb, var(--a) 40%, transparent)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.pgs-apply-glow { position: absolute; z-index: -1; width: 36rem; height: 36rem; right: -12rem; top: -14rem; border-radius: 50%; background: radial-gradient(closest-side, rgba(179, 36, 63, 0.45), transparent); filter: blur(30px); }
.pgs-apply .pgs-h2 { font-size: clamp(2.4rem, 5.4vw, 4.2rem); }
.pgs-apply-text { margin: 1.4rem 0 0; max-width: 34rem; font-size: 1.02rem; line-height: 1.75; color: var(--on-night-dim); }
.pgs-apply-ctas { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2rem 1.8rem; margin-top: 2.2rem; }
.pgs-apply-side { display: flex; flex-direction: column; gap: 1.8rem; }
.pgs-apply-countdown { padding: 1.4rem 1.6rem; border-radius: 18px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-night); }
.pgs-apply-countdown-label { margin: 0; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase; color: var(--a); }
.pgs-apply-countdown-value { margin: 0.6rem 0 0; display: flex; align-items: baseline; gap: 0.4rem; font-family: var(--display); }
.pgs-apply-countdown-value span { font-size: 3.4rem; line-height: 1; }
.pgs-apply-countdown-value small { font-family: var(--sans); font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--on-night-dim); margin-right: 0.9rem; }
.pgs-apply-countdown-date { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--on-night-dim); }
.pgs-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.95rem; }
.pgs-checklist li { display: flex; align-items: flex-start; gap: 0.85rem; font-size: 0.98rem; line-height: 1.5; }
.pgs-check { flex: none; width: 1.6rem; height: 1.6rem; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--a) 18%, transparent); color: var(--a); border: 1px solid color-mix(in srgb, var(--a) 40%, transparent); }
.pgs-check svg { width: 0.9rem; height: 0.9rem; }

/* ── Candidatas ── */
.pgs-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: clamp(0.9rem, 2vw, 1.6rem); grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 760px) { .pgs-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1100px) { .pgs-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.pgs-card { display: block; width: 100%; padding: 0; margin: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.pgs-card-photo { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 6px; background: var(--night-2); }
.pgs-card-photo::after { content: ''; position: absolute; inset: 0.6rem; border: 1px solid color-mix(in srgb, var(--a) 70%, transparent); border-radius: 3px; opacity: 0; transform: scale(1.03); transition: opacity 0.6s var(--ease), transform 0.8s var(--ease); pointer-events: none; }
.pgs-card:hover .pgs-card-photo::after, .pgs-card:focus-visible .pgs-card-photo::after { opacity: 1; transform: none; }
.pgs-card-photo > img, .pgs-card-photo > .pgs-monogram { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 1.2s var(--ease), filter 0.8s; }
.pgs-card:hover .pgs-card-photo > img, .pgs-card:hover .pgs-card-photo > .pgs-monogram { transform: scale(1.06); }
.pgs-card-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(7,10,28,0) 45%, rgba(7,10,28,0.55) 70%, rgba(7,10,28,0.95) 100%); }
.pgs-card-number { position: absolute; top: 0.9rem; left: 1rem; font-family: var(--display); font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1; color: transparent; -webkit-text-stroke: 1px var(--a-bright); }
.pgs-card-flag { position: absolute; top: 1rem; right: 1rem; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; background: linear-gradient(120deg, var(--a-bright), var(--a-mid)); color: var(--ink); }
.pgs-card-flag.is-soft { background: rgba(7, 10, 28, 0.7); color: var(--a); border: 1px solid color-mix(in srgb, var(--a) 50%, transparent); }
.pgs-badge-icon { width: 0.95rem; height: 0.95rem; }
.pgs-card-caption { position: absolute; left: 0; right: 0; bottom: 0; padding: 1rem 1.1rem 1.15rem; display: flex; flex-direction: column; gap: 0.2rem; }
.pgs-card-name { font-family: var(--display); font-size: clamp(1.3rem, 2.2vw, 1.75rem); line-height: 1.1; color: var(--on-night); }
.pgs-card-rep { font-size: 0.64rem; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase; color: var(--a); }
.pgs-card-more { display: inline-flex; align-items: center; gap: 0.4rem; max-height: 0; opacity: 0; overflow: hidden; font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--on-night-dim); transition: max-height 0.6s var(--ease), opacity 0.6s var(--ease), margin 0.6s var(--ease); }
.pgs-card-more svg { width: 0.9rem; height: 0.9rem; }
.pgs-card:hover .pgs-card-more, .pgs-card:focus-visible .pgs-card-more { max-height: 1.5rem; opacity: 1; margin-top: 0.5rem; }
.pgs-card.is-winner .pgs-card-photo { box-shadow: 0 0 0 1px var(--a), 0 30px 60px -30px var(--a); }
.pgs-monogram { display: grid; place-items: center; background: radial-gradient(120% 90% at 30% 10%, var(--night-3), var(--night) 80%); }
.pgs-monogram::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(color-mix(in srgb, var(--a) 22%, transparent) 1px, transparent 1px); background-size: 18px 18px; opacity: 0.35; -webkit-mask: radial-gradient(closest-side, #000, transparent); mask: radial-gradient(closest-side, #000, transparent); }
.pgs-monogram span { position: relative; font-family: var(--display); font-size: clamp(3rem, 8vw, 5rem); letter-spacing: 0.06em; color: transparent; -webkit-text-stroke: 1px color-mix(in srgb, var(--a) 80%, transparent); margin-bottom: 18%; }
@media (max-width: 560px) { .pgs-card-caption { padding: 0.8rem 0.8rem 0.9rem; } .pgs-card-rep { letter-spacing: 0.16em; } .pgs-card-number { top: 0.7rem; left: 0.75rem; } }

/* ── Ficha de candidata ── */
.pgs-dialog-overlay { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: clamp(0.75rem, 3vw, 2rem); background: rgba(4, 6, 18, 0.82); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); animation: pgs-fade 0.35s ease forwards; opacity: 0; }
.pgs-dialog { position: relative; display: grid; grid-template-columns: 1fr; width: min(100%, 60rem); max-height: calc(100dvh - 1.5rem); overflow: auto; border-radius: 20px; background: var(--night-2); border: 1px solid var(--line-night); box-shadow: 0 60px 120px -40px rgba(0, 0, 0, 0.8); animation: pgs-rise 0.6s var(--ease) both; color: var(--on-night); }
@media (min-width: 760px) { .pgs-dialog { grid-template-columns: 1fr 1.05fr; } }
.pgs-dialog-close { position: absolute; top: 0.8rem; right: 0.8rem; z-index: 2; width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line-night); background: rgba(7, 10, 28, 0.6); color: var(--on-night); cursor: pointer; }
.pgs-dialog-close svg { width: 1.1rem; height: 1.1rem; }
.pgs-dialog-photo { position: relative; aspect-ratio: 3 / 4; min-height: 100%; background: var(--night); }
.pgs-dialog-photo > img, .pgs-dialog-photo > .pgs-monogram { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pgs-dialog-number { position: absolute; left: 1.2rem; bottom: 0.6rem; font-family: var(--display); font-size: 5rem; line-height: 1; color: transparent; -webkit-text-stroke: 1px var(--a-bright); }
.pgs-dialog-body { padding: clamp(1.8rem, 4vw, 3rem); display: flex; flex-direction: column; justify-content: center; gap: 0.7rem; align-items: flex-start; }
.pgs-dialog-name { margin: 0.2rem 0 0; font-family: var(--display); font-weight: 400; font-size: clamp(2.3rem, 5vw, 3.4rem); line-height: 1.02; }
.pgs-dialog-rep { margin: 0; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.26em; text-transform: uppercase; color: var(--a); }
.pgs-dialog-bio { margin: 0.4rem 0 0.8rem; font-family: var(--serif); font-size: 1.25rem; line-height: 1.6; color: var(--on-night); white-space: pre-line; }
.pgs-dialog-bio.is-muted { color: var(--on-night-dim); }
.pgs-dialog-nav { display: flex; align-items: center; gap: 1rem; margin-top: 1.2rem; font-size: 0.78rem; letter-spacing: 0.2em; color: var(--on-night-dim); }
.pgs-dialog-nav button { width: 2.6rem; height: 2.6rem; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--line-night); background: none; color: var(--on-night); cursor: pointer; transition: border-color 0.3s, color 0.3s; }
.pgs-dialog-nav button:hover { border-color: var(--a); color: var(--a); }
.pgs-dialog-nav svg { width: 1.1rem; height: 1.1rem; }
.pgs-badge { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0.2rem 0 0; padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; background: linear-gradient(120deg, var(--a-bright), var(--a-mid)); color: var(--ink); }
.pgs-badge.is-soft { background: none; color: var(--a); border: 1px solid color-mix(in srgb, var(--a) 50%, transparent); }

/* ── Votación ── */
.pgs-vote { display: grid; gap: clamp(2.5rem, 6vw, 5rem); }
@media (min-width: 900px) { .pgs-vote { grid-template-columns: 5fr 7fr; align-items: start; } .pgs-vote-head { position: sticky; top: 7rem; } }
.pgs-vote-head .pgs-muted { margin: 1.3rem 0 2rem; max-width: 26rem; line-height: 1.7; }
.pgs-ranking { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pgs-ranking li { display: grid; grid-template-columns: 3rem 1fr auto; align-items: center; gap: 1.1rem; padding: 1.1rem 0; border-bottom: 1px solid var(--line-night); }
.pgs-ranking-pos { font-family: var(--display); font-size: 1.5rem; color: var(--on-night-dim); display: grid; place-items: center; }
.pgs-ranking-pos svg { width: 1.8rem; height: 1.8rem; color: var(--a); }
.pgs-ranking-body { display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; }
.pgs-ranking-name { font-family: var(--display); font-size: 1.35rem; line-height: 1.15; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; }
.pgs-ranking-num { font-family: var(--sans); font-size: 0.66rem; letter-spacing: 0.2em; color: var(--on-night-dim); }
.pgs-bar { position: relative; display: block; height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
.pgs-bar span { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: linear-gradient(90deg, var(--a-mid), var(--a-bright)); transform-origin: left; transition: transform 1.6s 0.2s var(--ease); }
.pgs[data-motion='on'] .pgs-ranking:not(.is-in) .pgs-bar span { transform: scaleX(0); }
.pgs-ranking-votes { text-align: right; font-family: var(--display); font-size: 1.5rem; line-height: 1; font-variant-numeric: tabular-nums; }
.pgs-ranking-votes small { display: block; margin-top: 0.3rem; font-family: var(--sans); font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--on-night-dim); }
.pgs-ranking li.is-first { padding: 1.5rem 0; }
.pgs-ranking li.is-first .pgs-ranking-name { font-size: 1.9rem; }
.pgs-ranking li.is-first .pgs-ranking-votes { font-size: 2rem; color: var(--a); }
.pgs-ranking li.is-first .pgs-bar { height: 4px; }

/* ── La gala ── */
.pgs-gala { display: grid; gap: clamp(2.5rem, 6vw, 5rem); }
@media (min-width: 900px) { .pgs-gala { grid-template-columns: 1fr 1fr; align-items: center; } }
.pgs-gala-day { margin: 0; display: flex; align-items: center; gap: clamp(1rem, 3vw, 2rem); }
.pgs-gala-num { font-family: var(--display); font-size: clamp(8rem, 22vw, 15rem); line-height: 0.8; color: var(--ink); letter-spacing: -0.02em; }
.pgs-gala-month { display: flex; flex-direction: column; gap: 0.6rem; padding-left: clamp(1rem, 3vw, 2rem); border-left: 1px solid var(--line-paper); }
.pgs-gala-month > span:first-child { font-family: var(--serif); font-style: italic; font-size: clamp(2rem, 4.5vw, 3.2rem); line-height: 1; color: var(--a-deep); text-transform: capitalize; }
.pgs-gala-month > span:last-child { font-size: 0.76rem; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-soft); }
.pgs-gala-tba { margin: 0; font-family: var(--serif); font-style: italic; font-size: 2.4rem; color: var(--a-deep); }
.pgs-gala-info .pgs-h2 { font-size: clamp(2.3rem, 4.8vw, 3.8rem); }
.pgs-gala-address { display: flex; align-items: center; gap: 0.5rem; margin: 1.2rem 0 0; font-size: 1rem; color: var(--ink-soft); }
.pgs-gala-address .pgs-inline-icon { color: var(--a-deep); }
.pgs-gala-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2rem 1.8rem; margin-top: 2.2rem; }

/* ── Auspicios ── */
.pgs-sponsors { display: flex; flex-direction: column; gap: clamp(2.5rem, 5vw, 3.5rem); }
.pgs-sponsor-tier { text-align: center; }
.pgs-sponsor-label { display: flex; align-items: center; justify-content: center; gap: 1rem; margin: 0 0 1.4rem; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.32em; text-transform: uppercase; color: var(--a); }
.pgs-sponsor-label span { width: 3rem; height: 1px; background: linear-gradient(90deg, transparent, var(--a)); }
.pgs-sponsor-label span:last-child { background: linear-gradient(90deg, var(--a), transparent); }
.pgs-sponsor-tier ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.8rem clamp(1.8rem, 5vw, 3.8rem); }
.pgs-sponsor-tier li { font-family: var(--display); font-size: clamp(1.4rem, 2.6vw, 2rem); line-height: 1.2; color: var(--on-night); }
.pgs-sponsor-tier.is-top li { font-size: clamp(2.2rem, 5vw, 3.6rem); }
.pgs-sponsor-tier:not(.is-top) li { color: var(--on-night-dim); }
.pgs-packages { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); }
@media (min-width: 640px) and (max-width: 1099px) {
  .pgs-packages { grid-template-columns: 1fr; }
  .pgs-packages > .pgs-package { display: grid; grid-template-columns: 1fr 1fr; column-gap: 2.5rem; align-content: start; }
  .pgs-packages > .pgs-package > :not(.pgs-benefits) { grid-column: 1; }
  .pgs-packages > .pgs-package > .pgs-benefits { grid-column: 2; grid-row: 1 / span 6; margin: 0; padding: 0 0 0 2.5rem; border-top: 0; border-left: 1px solid var(--line-night); align-self: center; }
  .pgs-packages > .pgs-package > .pgs-slots { margin-top: 0; }
}
@media (min-width: 1100px) { .pgs-packages { grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); } }
.pgs-package { position: relative; display: flex; flex-direction: column; padding: 2rem 1.8rem 1.8rem; border-radius: 20px; background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015)); border: 1px solid var(--line-night); transition: transform 0.6s var(--ease), border-color 0.4s; }
.pgs-package:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--a) 45%, transparent); }
.pgs-package.is-featured { border-color: color-mix(in srgb, var(--a) 60%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--a) 12%, transparent), rgba(255,255,255,0.02) 60%); box-shadow: 0 40px 80px -50px var(--a); }
.pgs-package.is-soldout { opacity: 0.6; }
.pgs-package-name { margin: 0.7rem 0 0; font-family: var(--display); font-size: 2rem; line-height: 1.1; }
.pgs-package-price { margin: 0.9rem 0 0; font-family: var(--display); font-size: 2.3rem; line-height: 1; color: var(--a); }
.pgs-package-price span { font-family: var(--sans); font-size: 0.75rem; letter-spacing: 0.1em; color: var(--on-night-dim); }
.pgs-package-desc { margin: 1rem 0 0; font-size: 0.92rem; line-height: 1.6; color: var(--on-night-dim); }
.pgs-benefits { list-style: none; margin: 1.3rem 0 0; padding: 1.3rem 0 0; border-top: 1px solid var(--line-night); display: flex; flex-direction: column; gap: 0.7rem; }
.pgs-benefits li { display: flex; align-items: flex-start; gap: 0.7rem; font-size: 0.92rem; line-height: 1.45; }
.pgs-benefit-mark { flex: none; width: 0.55rem; height: 0.55rem; margin-top: 0.4rem; color: var(--a); }
.pgs-slots { margin: auto 0 0; padding-top: 1.5rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--a); }
.pgs-lead { margin-top: clamp(3.5rem, 8vw, 5.5rem); display: grid; gap: 2rem; padding: clamp(1.8rem, 5vw, 3.5rem); border-radius: 24px; background: var(--paper); color: var(--ink); }
@media (min-width: 900px) { .pgs-lead { grid-template-columns: 4fr 7fr; gap: 4rem; } }
.pgs-lead .pgs-h3 { margin: 0; text-align: left; color: var(--ink); }
.pgs-lead-intro p { margin: 1rem 0 0; line-height: 1.7; color: var(--ink-soft); }

/* ── Formularios (sobre papel) ── */
.pgs-form { display: flex; flex-direction: column; gap: 1.1rem; }
.pgs-form-grid { display: grid; gap: 1.1rem; grid-template-columns: 1fr; }
@media (min-width: 640px) { .pgs-form-grid { grid-template-columns: 1fr 1fr; } }
.pgs-field { display: flex; flex-direction: column; gap: 0.45rem; }
.pgs-field label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink); }
.pgs-field label span { font-weight: 500; letter-spacing: 0.08em; text-transform: none; color: var(--ink-soft); }
.pgs-field input, .pgs-field select, .pgs-field textarea { width: 100%; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid var(--line-paper); background: #fff; color: var(--ink); font: 400 1rem/1.4 var(--sans); transition: border-color 0.3s, box-shadow 0.3s; }
.pgs-field textarea { resize: vertical; min-height: 7rem; }
.pgs-field input:focus, .pgs-field select:focus, .pgs-field textarea:focus { outline: none; border-color: var(--a-mid); box-shadow: 0 0 0 4px color-mix(in srgb, var(--a) 35%, transparent); }
.pgs-field.has-error input, .pgs-field.has-error textarea { border-color: var(--copihue); }
.pgs-field-error, .pgs-form-error { margin: 0; font-size: 0.82rem; color: var(--copihue); }
.pgs-form .pgs-btn { align-self: flex-start; margin-top: 0.4rem; }
.pgs-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.pgs-sent { display: flex; flex-direction: column; align-items: flex-start; gap: 0.7rem; }
.pgs-sent-mark { width: 3rem; height: 3rem; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, var(--a-bright), var(--a-mid)); color: var(--ink); }
.pgs-sent-mark svg { width: 1.4rem; height: 1.4rem; }
.pgs-sent h3 { margin: 0.3rem 0 0; font-family: var(--display); font-weight: 400; font-size: 2rem; }
.pgs-sent p { margin: 0; color: var(--ink-soft); line-height: 1.6; }

/* ── Preguntas ── */
.pgs-faq { display: grid; gap: clamp(2rem, 5vw, 5rem); }
@media (min-width: 900px) { .pgs-faq { grid-template-columns: 5fr 7fr; } .pgs-faq-head { position: sticky; top: 7rem; align-self: start; } }
.pgs-faq-contact { margin: 1.5rem 0 0; color: var(--ink-soft); line-height: 1.6; }
.pgs-faq-contact a { color: var(--a-deep); }
.pgs-faq-list { border-top: 1px solid var(--line-paper); }
.pgs-faq-item { border-bottom: 1px solid var(--line-paper); }
.pgs-faq-item summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 1.5rem 0; cursor: pointer; font-family: var(--display); font-size: clamp(1.3rem, 2.4vw, 1.65rem); line-height: 1.25; color: var(--ink); }
.pgs-faq-item summary::-webkit-details-marker { display: none; }
.pgs-faq-icon { flex: none; width: 1.5rem; height: 1.5rem; color: var(--a-deep); transition: transform 0.5s var(--ease); }
.pgs-faq-item[open] .pgs-faq-icon { transform: rotate(45deg); }
.pgs-faq-item p { margin: 0 0 1.6rem; max-width: 40rem; font-size: 1rem; line-height: 1.75; color: var(--ink-soft); }

/* ── Resultados ── */
.pgs-results { background: radial-gradient(80% 70% at 30% 20%, var(--night-3), var(--night) 70%); }
.pgs-winner { display: grid; gap: clamp(2rem, 5vw, 4rem); align-items: center; }
@media (min-width: 900px) { .pgs-winner { grid-template-columns: 5fr 7fr; } }
.pgs-winner-photo { position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: visible; }
.pgs-winner-photo > img, .pgs-winner-photo > .pgs-monogram { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 10px; box-shadow: 0 0 0 1px var(--a), 0 50px 100px -40px var(--a); }
.pgs-winner-crown { position: absolute; top: -1.6rem; left: 50%; width: 3.4rem; height: 3.4rem; margin-left: -1.7rem; color: var(--a); filter: drop-shadow(0 0 14px var(--a)); }
.pgs-winner-name { margin: 1.6rem 0 0.4rem; font-family: var(--display); font-size: clamp(3rem, 8vw, 6rem); line-height: 1; }
.pgs-winner-rep { margin: 0; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--a); }
.pgs-court { list-style: none; margin: 2.5rem 0 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); }
.pgs-court li { display: flex; flex-direction: column; gap: 0.2rem; padding: 1rem 1.2rem; border-radius: 14px; border: 1px solid var(--line-night); background: rgba(255,255,255,0.03); }
.pgs-court-rank { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--a); }
.pgs-court-name { font-family: var(--display); font-size: 1.35rem; }
.pgs-court-rep { font-size: 0.8rem; color: var(--on-night-dim); }

/* ── Pie ── */
.pgs-footer { position: relative; overflow: hidden; padding: clamp(4rem, 10vw, 7rem) 0 2rem; background: var(--night); border-top: 1px solid var(--line-night); }
.pgs-follow { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin: 0 auto clamp(4rem, 9vw, 6.5rem); padding: 0 var(--gutter); text-align: center; text-decoration: none; }
.pgs-follow-label { display: inline-flex; align-items: center; gap: 0.6rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: var(--a); }
.pgs-follow-handle { font-family: var(--serif); font-style: italic; font-size: clamp(2.2rem, 7vw, 5.4rem); line-height: 1.05; overflow-wrap: anywhere; transition: color 0.4s; }
.pgs-follow:hover .pgs-follow-handle { color: var(--a-bright); }
.pgs-footer-grid { display: grid; gap: 2.5rem; padding-top: 3rem; border-top: 1px solid var(--line-night); }
@media (min-width: 640px) and (max-width: 899px) { .pgs-footer-grid { grid-template-columns: 1fr 1fr; } .pgs-footer-brand { grid-column: 1 / -1; } }
@media (min-width: 900px) { .pgs-footer-grid { grid-template-columns: 5fr 4fr 3fr; } }
.pgs-footer-brand { display: flex; flex-direction: column; gap: 0.5rem; }
.pgs-footer-brand .pgs-muted { margin: 0; font-size: 0.9rem; }
.pgs-footer-name { margin: 0.6rem 0 0; font-family: var(--display); font-size: 2rem; line-height: 1.1; }
.pgs-footer-edition { margin-left: 0.5rem; font-size: 0.85em; color: var(--a); }
.pgs-footer-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem 1.5rem; align-content: start; }
.pgs-footer-nav a, .pgs-footer-contact a { font-size: 0.9rem; color: var(--on-night-dim); text-decoration: none; transition: color 0.3s; }
.pgs-footer-nav a:hover, .pgs-footer-contact a:hover { color: var(--a); }
.pgs-footer-contact { display: flex; flex-direction: column; gap: 0.8rem; }
.pgs-footer-contact a { display: inline-flex; align-items: center; gap: 0.55rem; overflow-wrap: anywhere; }
.pgs-footer-word { margin: clamp(3rem, 8vw, 5rem) 0 0; text-align: center; font-family: var(--display); font-size: min(26vw, 22rem); line-height: 0.8; letter-spacing: 0.02em; color: transparent; -webkit-text-stroke: 1px color-mix(in srgb, var(--a) 26%, transparent); white-space: nowrap; user-select: none; }
.pgs-footer-legal { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.6rem 2rem; margin-top: 2rem; font-size: 0.78rem; color: var(--on-night-dim); }
.pgs-footer-legal p { margin: 0; }
.pgs-footer-legal a { color: inherit; }

/* Cifras con números de caja alta (al final: gana a las familias de cada bloque). */
.pgs-kicker-index, .pgs-count-value, .pgs-stat dd, .pgs-journey-node, .pgs-apply-countdown-value, .pgs-card-number, .pgs-dialog-number, .pgs-ranking-pos, .pgs-ranking-votes, .pgs-gala-num, .pgs-package-price, .pgs-menu-index, .pgs-footer-edition { font-family: var(--numeric); font-style: normal; font-variant-numeric: lining-nums tabular-nums; font-feature-settings: 'lnum' 1, 'tnum' 1; }

.pgs ~ .aether-platform-badge { border-color: var(--line-night) !important; background: rgba(12, 17, 48, 0.72) !important; color: var(--on-night-dim) !important; backdrop-filter: blur(10px); }
.pgs ~ .aether-platform-badge:hover { background: rgba(17, 24, 65, 0.9) !important; }

@media (prefers-reduced-motion: reduce) {
  .pgs *, .pgs *::before, .pgs *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .pgs-rise, .pgs-jewels, .pgs-frame span, .pgs-menu li { opacity: 1; transform: none; }
  .pgs-draw { stroke-dashoffset: 0; }
  .pgs-ribbon-track { animation: none; }
}
`;
