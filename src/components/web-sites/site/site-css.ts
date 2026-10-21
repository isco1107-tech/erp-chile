/**
 * CSS estático del renderizador de sitios. Va en un <style> con contenido
 * CONSTANTE: nada del usuario entra acá (los colores y medidas del tema llegan
 * como variables `--ws-*` validadas en el atributo `style` del contenedor raíz).
 *
 * Solo lo que Tailwind no expresa bien: tonos de franja (variables locales
 * `--s-*`), estilos de botón según el tema, animaciones al bajar con
 * `animation-timeline: view()` y el espaciado por sección. El resto de la
 * maquetación va con utilidades de Tailwind y container queries (`@2xl:`…), de
 * modo que la vista "celular" del editor se ve como un celular real.
 *
 * Sin comillas, `>` ni `&` a propósito: React pinta el texto de un <style> tal
 * cual y así el contenido es idéntico en servidor y navegador.
 */
export const SITE_CSS = `
.ws-root{font-family:var(--ws-font);background-color:var(--ws-bg);color:var(--ws-text);font-feature-settings:normal;line-height:1.65;overflow-x:clip;overflow-wrap:break-word;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
.ws-root :focus-visible{outline:2px solid var(--s-mark,var(--ws-accent));outline-offset:3px}

.ws-tone-default{--s-bg:var(--ws-bg);--s-fg:var(--ws-text);--s-muted:var(--ws-muted);--s-line:var(--ws-border);--s-card:color-mix(in srgb,var(--ws-text) 4%,var(--ws-bg));--s-mark:var(--ws-mark-default);--s-btn:var(--ws-btn-default);--s-btn-fg:var(--ws-btn-default-fg);color:var(--s-fg)}
.ws-tone-muted{--s-bg:color-mix(in srgb,var(--ws-text) 5%,var(--ws-bg));--s-fg:var(--ws-text);--s-muted:var(--ws-muted);--s-line:var(--ws-border);--s-card:var(--ws-bg);--s-mark:var(--ws-mark-default);--s-btn:var(--ws-btn-default);--s-btn-fg:var(--ws-btn-default-fg);color:var(--s-fg)}
.ws-tone-primary{--s-bg:var(--ws-primary);--s-fg:var(--ws-on-primary);--s-muted:color-mix(in srgb,var(--ws-on-primary) 78%,transparent);--s-line:color-mix(in srgb,var(--ws-on-primary) 24%,transparent);--s-card:color-mix(in srgb,var(--ws-on-primary) 8%,var(--ws-primary));--s-mark:var(--ws-mark-primary);--s-btn:var(--ws-btn-primary);--s-btn-fg:var(--ws-btn-primary-fg);color:var(--s-fg)}
.ws-tone-accent{--s-bg:var(--ws-accent);--s-fg:var(--ws-on-accent);--s-muted:color-mix(in srgb,var(--ws-on-accent) 80%,transparent);--s-line:color-mix(in srgb,var(--ws-on-accent) 26%,transparent);--s-card:color-mix(in srgb,var(--ws-on-accent) 10%,var(--ws-accent));--s-mark:var(--ws-on-accent);--s-btn:var(--ws-btn-accent);--s-btn-fg:var(--ws-btn-accent-fg);color:var(--s-fg)}
.ws-tone-dark{--s-bg:var(--ws-dark);--s-fg:var(--ws-on-dark);--s-muted:color-mix(in srgb,var(--ws-on-dark) 74%,transparent);--s-line:color-mix(in srgb,var(--ws-on-dark) 20%,transparent);--s-card:color-mix(in srgb,var(--ws-on-dark) 7%,var(--ws-dark));--s-mark:var(--ws-mark-dark);--s-btn:var(--ws-btn-dark);--s-btn-fg:var(--ws-btn-dark-fg);color:var(--s-fg)}
.ws-bg{background-color:var(--s-bg)}
.ws-glass{background-color:color-mix(in srgb,var(--ws-bg) 86%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px)}
.ws-scrim{background-color:var(--ws-dark)}

.ws-section{position:relative;scroll-margin-top:5rem;padding-top:var(--ws-py,0px);padding-bottom:calc(var(--ws-py,0px) + var(--ws-shape-pad,0px))}
.ws-sp-none{--ws-py:0px}
.ws-sp-xs{--ws-py:1.1rem}
.ws-sp-sm{--ws-py:calc(var(--ws-section-y) * .5)}
.ws-sp-md{--ws-py:var(--ws-section-y)}
.ws-sp-lg{--ws-py:calc(var(--ws-section-y) * 1.6)}
.ws-sp-hero{--ws-py:calc(var(--ws-section-y) * 1.5)}
@container (min-width:42rem){
.ws-sp-sm{--ws-py:calc(var(--ws-section-y-lg) * .5)}
.ws-sp-md{--ws-py:var(--ws-section-y-lg)}
.ws-sp-lg{--ws-py:calc(var(--ws-section-y-lg) * 1.6)}
.ws-sp-hero{--ws-py:calc(var(--ws-section-y-lg) * 1.5)}
}
.ws-under-header{padding-top:calc(var(--ws-section-y) * 1.5 + 4.5rem)}
@container (min-width:42rem){
.ws-under-header{padding-top:calc(var(--ws-section-y-lg) * 1.5 + 5rem)}
}
.ws-has-shape{--ws-shape-pad:2.5rem}
@container (min-width:42rem){
.ws-has-shape{--ws-shape-pad:4.5rem}
}

.ws-h{font-family:var(--ws-heading-font);text-transform:var(--ws-heading-case);letter-spacing:var(--ws-heading-spacing);line-height:1.12;font-weight:var(--ws-heading-weight,700);text-wrap:balance}
.ws-root .truncate{white-space:nowrap}
.ws-root .grid{grid-auto-columns:minmax(0,1fr)}
.ws-fit{container-type:inline-size}
.ws-t-hero{font-size:clamp(calc(1.4rem * min(1, var(--ws-fit,1))),calc(10.5cqi * var(--ws-fit,1)),4.4rem)}
.ws-t-xl{font-size:clamp(1.5rem,calc(10cqi * var(--ws-fit,1)),7.25rem);line-height:1.02}
.ws-t-lg{font-size:clamp(1.35rem,calc(9.5cqi * var(--ws-fit,1)),3.1rem)}
.ws-t-2{font-size:clamp(1.3rem,calc(8.5cqi * var(--ws-fit,1)),2.5rem)}
.ws-t-quote{font-size:clamp(1.25rem,calc(7cqi * var(--ws-fit,1)),2.9rem);line-height:1.2}
.ws-t-price{font-size:clamp(1.25rem,calc(16cqi * var(--ws-fit,1)),3rem);line-height:1.05}
.ws-t-price-inline{font-size:calc(1.75rem * min(1,var(--ws-fit,1)))}
@container (min-width:672px){.ws-t-price-inline{font-size:calc(1.875rem * min(1,var(--ws-fit,1)))}}
.ws-t-stat{font-size:clamp(1.25rem,calc(19cqi * var(--ws-fit,1)),3.9rem);line-height:1}
.ws-eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--s-mark)}
.ws-muted{color:var(--s-muted)}
.ws-card{background-color:var(--s-card);border:1px solid var(--s-line);border-radius:var(--ws-radius);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.ws-card-hover:hover{transform:translateY(-3px);box-shadow:0 18px 40px -24px rgb(0 0 0 / .5);border-color:color-mix(in srgb,var(--s-mark) 55%,var(--s-line))}
.ws-pill{display:inline-flex;align-items:center;padding:.1rem .6rem;border-radius:999px;font-size:.72rem;font-weight:700;letter-spacing:.03em;line-height:1.5;color:var(--s-fg);background-color:color-mix(in srgb,var(--s-mark) 16%,transparent);border:1px solid color-mix(in srgb,var(--s-mark) 40%,transparent)}
.ws-icon-tile{display:inline-flex;align-items:center;justify-content:center;width:3rem;height:3rem;border-radius:var(--ws-radius);color:var(--s-mark);background-color:color-mix(in srgb,var(--s-mark) 14%,transparent)}
.ws-star{color:var(--s-mark)}
.ws-star-off{color:color-mix(in srgb,var(--s-fg) 25%,transparent)}
.ws-logo{filter:grayscale(1);opacity:.65;transition:filter .2s ease,opacity .2s ease}
.ws-logo-link:hover .ws-logo,.ws-logo-link:focus-visible .ws-logo,.ws-logo:hover{filter:none;opacity:1}
.ws-carousel{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--s-fg) 35%,transparent) transparent}

.ws-root[data-card=shadow] .ws-card{border-color:transparent;box-shadow:0 1px 2px rgb(0 0 0 / .06),0 14px 34px -16px rgb(0 0 0 / .3)}
.ws-root[data-card=flat] .ws-card{border-color:transparent;box-shadow:none}
.ws-root[data-card=brutal] .ws-card{border:2px solid var(--s-fg);box-shadow:5px 5px 0 var(--s-fg)}
.ws-root[data-card=brutal] .ws-card-hover:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--s-fg)}
.ws-root[data-card=glass] .ws-card{background-color:color-mix(in srgb,var(--s-fg) 6%,transparent);border-color:color-mix(in srgb,var(--s-fg) 16%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--s-fg) 10%,transparent)}

.ws-fx{position:absolute;inset:0;pointer-events:none}
.ws-fx-gradient{background-image:radial-gradient(55% 75% at 0% 0%,color-mix(in srgb,var(--ws-accent) 34%,transparent),transparent 70%),radial-gradient(50% 70% at 100% 100%,color-mix(in srgb,var(--ws-accent) 26%,transparent),transparent 70%),linear-gradient(140deg,color-mix(in oklab,var(--s-bg) 88%,var(--ws-accent)),var(--s-bg) 60%)}
.ws-fx-soft{background-image:radial-gradient(65% 85% at 8% 0%,color-mix(in srgb,var(--ws-accent) 13%,transparent),transparent 70%),radial-gradient(55% 75% at 100% 100%,color-mix(in srgb,var(--ws-primary) 10%,transparent),transparent 70%)}
.ws-pattern{position:absolute;inset:0;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,#000 30%,transparent 80%);mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,#000 30%,transparent 80%)}
.ws-pat-dots{background-image:radial-gradient(color-mix(in srgb,var(--s-fg) 22%,transparent) 1.2px,transparent 1.6px);background-size:22px 22px}
.ws-pat-grid{background-image:linear-gradient(color-mix(in srgb,var(--s-fg) 9%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--s-fg) 9%,transparent) 1px,transparent 1px);background-size:44px 44px}
.ws-pat-diagonal{background-image:repeating-linear-gradient(45deg,color-mix(in srgb,var(--s-fg) 8%,transparent) 0 1px,transparent 1px 14px)}
.ws-pat-rings{background-image:repeating-radial-gradient(circle at 100% 0%,transparent 0 26px,color-mix(in srgb,var(--s-fg) 9%,transparent) 26px 27px)}
.ws-shape{position:absolute;left:0;right:0;bottom:-1px;height:2.6rem;line-height:0;pointer-events:none;z-index:1}
.ws-shape svg{display:block;width:100%;height:100%;fill:var(--s-bg)}
@container (min-width:42rem){
.ws-shape{height:4.6rem}
}
.ws-ph{display:flex;align-items:center;justify-content:center;background-image:linear-gradient(135deg,color-mix(in srgb,var(--s-fg) 12%,transparent),color-mix(in srgb,var(--s-mark) 24%,transparent));color:color-mix(in srgb,var(--s-fg) 45%,transparent)}

.ws-polaroid{background-color:#fff;color:#1f2933;padding:.7rem .7rem 0;border-radius:3px;box-shadow:0 18px 40px -22px rgb(0 0 0 / .55)}
.ws-arch{border-radius:9999px 9999px var(--ws-radius) var(--ws-radius)}
.ws-frame{padding:.6rem;border:1px solid var(--s-mark);border-radius:calc(var(--ws-radius) * 1.3)}
.ws-offset{position:absolute;inset:0;transform:translate(1rem,1rem);border-radius:calc(var(--ws-radius) * 1.4);background-color:var(--s-mark);opacity:.9}
.ws-rule{height:1px;background-image:linear-gradient(90deg,transparent,var(--s-mark),transparent)}
.ws-num{font-variant-numeric:tabular-nums;color:var(--s-mark)}
.ws-outline-text{color:transparent;-webkit-text-stroke:1.5px currentColor}
@supports not (-webkit-text-stroke:1px) {
.ws-outline-text{color:inherit}
}

.ws-marquee{position:relative;overflow:hidden}
.ws-marquee-track{display:flex;width:max-content;animation:ws-marquee var(--ws-mq,38s) linear infinite}
.ws-marquee:hover .ws-marquee-track,.ws-marquee[data-offscreen] .ws-marquee-track{animation-play-state:paused}
.ws-marquee-fade{position:absolute;top:0;bottom:0;width:12%;pointer-events:none;z-index:1}
.ws-marquee-fade-l{left:0;background-image:linear-gradient(90deg,var(--s-bg),transparent)}
.ws-marquee-fade-r{right:0;background-image:linear-gradient(270deg,var(--s-bg),transparent)}
@keyframes ws-marquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
@media (prefers-reduced-motion:reduce){
.ws-marquee-track{animation:none;width:auto;flex-wrap:wrap;justify-content:center}
.ws-marquee-dup,.ws-marquee-fade{display:none}
}
.ws-root[data-still] .ws-marquee-track{animation:none}

.ws-ba{position:relative;overflow:hidden;touch-action:pan-y;--ws-ba:50%}
.ws-ba-after{position:absolute;inset:0;clip-path:inset(0 0 0 var(--ws-ba))}
.ws-ba-handle{position:absolute;top:0;bottom:0;left:var(--ws-ba);width:3px;margin-left:-1.5px;background-color:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .25);pointer-events:none}
.ws-ba-knob{position:absolute;top:50%;left:50%;display:flex;align-items:center;justify-content:center;width:2.6rem;height:2.6rem;margin:-1.3rem 0 0 -1.3rem;border-radius:999px;background-color:#fff;color:#111;box-shadow:0 6px 18px rgb(0 0 0 / .35)}
.ws-ba-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.ws-ba:has(.ws-ba-range:focus-visible){outline:3px solid var(--s-mark);outline-offset:3px}
.ws-ba-tag{position:absolute;top:.75rem;padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#fff;background-color:rgb(0 0 0 / .55);pointer-events:none}

.ws-tab{cursor:pointer;border:0;background:none;font:inherit;color:var(--s-muted);transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
.ws-tab:hover{color:var(--s-fg)}
.ws-tab[aria-selected=true]{color:var(--s-fg)}
.ws-tabs-top .ws-tab[aria-selected=true]{box-shadow:inset 0 -3px 0 var(--s-mark)}
.ws-tabs-side .ws-tab[aria-selected=true]{background-color:color-mix(in srgb,var(--s-mark) 14%,transparent);box-shadow:inset 3px 0 0 var(--s-mark)}
.ws-tabs-pills .ws-tab[aria-selected=true]{background-color:var(--s-btn);color:var(--s-btn-fg)}

.ws-cbtn{display:inline-flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;border-radius:999px;border:1px solid var(--s-line);background-color:var(--s-card);color:var(--s-fg);cursor:pointer;transition:opacity .15s ease,transform .15s ease}
.ws-cbtn:hover{transform:translateY(-1px)}
.ws-cbtn:disabled{opacity:.35;cursor:default;transform:none}
.ws-noscroll{scrollbar-width:none}
.ws-noscroll::-webkit-scrollbar{display:none}

.ws-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.8rem 1.6rem;font-size:1rem;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;cursor:pointer;border:2px solid transparent;border-radius:var(--ws-button-radius);transition:transform .18s ease,box-shadow .18s ease,background-color .18s ease,color .18s ease,border-color .18s ease}
.ws-btn-sm{padding:.55rem 1.1rem;font-size:.9rem}
.ws-btn-main{background-color:var(--s-btn);color:var(--s-btn-fg);border-color:var(--s-btn);box-shadow:0 1px 2px rgb(0 0 0 / .14)}
.ws-btn-main:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgb(0 0 0 / .5)}
.ws-root[data-btn=outline] .ws-btn-main{background-color:transparent;color:var(--s-btn);box-shadow:none}
.ws-root[data-btn=outline] .ws-btn-main:hover{background-color:var(--s-btn);color:var(--s-btn-fg)}
.ws-root[data-btn=gradient] .ws-btn-main{background-image:linear-gradient(135deg,var(--s-btn),color-mix(in oklab,var(--s-btn) 55%,var(--ws-primary)));border-color:transparent}
.ws-root[data-btn=soft] .ws-btn-main{background-color:color-mix(in srgb,var(--s-btn) 16%,transparent);color:var(--s-fg);border-color:transparent;box-shadow:none}
.ws-root[data-btn=soft] .ws-btn-main:hover{background-color:color-mix(in srgb,var(--s-btn) 26%,transparent)}
.ws-root[data-btn=brutal] .ws-btn-main,.ws-root[data-btn=brutal] .ws-btn-alt{border-color:var(--s-fg);box-shadow:4px 4px 0 var(--s-fg)}
.ws-root[data-btn=brutal] .ws-btn-main:hover,.ws-root[data-btn=brutal] .ws-btn-alt:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--s-fg)}
.ws-root[data-btn=glow] .ws-btn-main{box-shadow:0 0 0 1px color-mix(in srgb,var(--s-btn) 55%,transparent),0 10px 30px -8px color-mix(in srgb,var(--s-btn) 75%,transparent)}
.ws-btn-alt{background-color:transparent;color:var(--s-fg);border-color:color-mix(in srgb,var(--s-fg) 35%,transparent)}
.ws-btn-alt:hover{background-color:color-mix(in srgb,var(--s-fg) 10%,transparent);transform:translateY(-1px)}

.ws-field{display:block;width:100%;min-width:0;padding:.72rem .9rem;font:inherit;font-size:1rem;line-height:1.4;color:var(--s-fg);background-color:color-mix(in srgb,var(--s-fg) 4%,var(--s-bg));border:1px solid color-mix(in srgb,var(--s-fg) 26%,transparent);border-radius:var(--ws-radius);transition:border-color .15s ease,box-shadow .15s ease}
.ws-field::placeholder{color:color-mix(in srgb,var(--s-fg) 42%,transparent)}
.ws-field:focus{outline:none;border-color:var(--s-mark);box-shadow:0 0 0 3px color-mix(in srgb,var(--s-mark) 30%,transparent)}
.ws-field:disabled{opacity:.75;cursor:not-allowed}
.ws-field[aria-invalid=true]{border-color:color-mix(in srgb,#dc2626 75%,var(--s-fg));box-shadow:0 0 0 3px color-mix(in srgb,#dc2626 20%,transparent)}
.ws-field[type=date]{min-height:2.95rem}
textarea.ws-field{resize:vertical;min-height:7rem}
.ws-field-select{appearance:none;-webkit-appearance:none;padding-right:2.5rem;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 19px) 52%,calc(100% - 14px) 52%;background-size:5px 5px;background-repeat:no-repeat}
.ws-field-select option{color:#111;background-color:#fff}
.ws-root input[type=checkbox],.ws-root input[type=radio]{accent-color:var(--s-mark)}
.ws-choice{display:inline-flex;align-items:center;gap:.55rem;max-width:100%;padding:.6rem .95rem;font-size:.95rem;border:1px solid color-mix(in srgb,var(--s-fg) 24%,transparent);border-radius:var(--ws-button-radius);cursor:pointer;transition:border-color .15s ease,background-color .15s ease}
.ws-choice:hover{border-color:color-mix(in srgb,var(--s-mark) 60%,transparent)}
.ws-choice:has(input:checked){border-color:var(--s-mark);background-color:color-mix(in srgb,var(--s-mark) 14%,transparent);font-weight:600}
.ws-choice:has(input:focus-visible){outline:2px solid var(--s-mark);outline-offset:2px}
.ws-error{font-size:.875rem;font-weight:600;color:color-mix(in srgb,#dc2626 72%,var(--s-fg))}
.ws-form-done{display:flex;align-items:flex-start;gap:1rem;padding:1.25rem;border:1px solid var(--s-mark);border-radius:var(--ws-radius);background-color:color-mix(in srgb,var(--s-mark) 8%,transparent)}
.ws-progress{height:6px;border-radius:999px;overflow:hidden;background-color:color-mix(in srgb,var(--s-fg) 12%,transparent)}
.ws-progress-bar{height:100%;background-color:var(--s-mark);transform-origin:left center;transition:transform .3s ease}

.ws-navlink{display:inline-flex;align-items:center;gap:.25rem;padding:.5rem .75rem;font-size:.92rem;font-weight:500;line-height:1.3;color:var(--s-fg);border-radius:min(var(--ws-radius),.75rem);transition:background-color .15s ease}
.ws-navlink:hover{background-color:color-mix(in srgb,var(--s-fg) 10%,transparent)}
.ws-navlink[aria-current=page]{font-weight:700;box-shadow:inset 0 -2px 0 var(--s-mark)}
.ws-skip{position:absolute;left:.75rem;top:-4rem;z-index:60;padding:.6rem 1rem;border-radius:.5rem;font-weight:600;background-color:var(--ws-primary);color:var(--ws-on-primary);transition:top .15s ease}
.ws-skip:focus{top:.75rem}
.ws-wa{display:inline-flex;align-items:center;gap:.6rem;padding:.9rem;border-radius:999px;font-weight:600;color:#fff;background-color:#128c7e;box-shadow:0 10px 30px -10px rgb(0 0 0 / .55);transition:transform .15s ease,background-color .15s ease}
.ws-wa:hover{background-color:#0e7468;transform:translateY(-2px)}

@keyframes ws-fade{from{opacity:0}to{opacity:1}}
@keyframes ws-rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes ws-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes ws-slide{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}
@media screen and (prefers-reduced-motion:no-preference){
@supports (animation-timeline:view()){
.ws-root[data-anim=fade] .ws-reveal{animation:ws-fade linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
.ws-root[data-anim=rise] .ws-reveal{animation:ws-rise linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
.ws-root[data-anim=zoom] .ws-reveal{animation:ws-zoom linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
.ws-root[data-anim=slide] .ws-reveal{animation:ws-slide linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
}
}
@media (prefers-reduced-motion:reduce){
.ws-btn,.ws-card,.ws-logo,.ws-wa,.ws-navlink,.ws-tab,.ws-cbtn,.ws-field,.ws-choice,.ws-progress-bar{transition:none}
.ws-btn:hover,.ws-card-hover:hover,.ws-wa:hover{transform:none}
}

.ws-canvas{position:relative;container-type:inline-size;height:var(--canvas-height);isolation:isolate}
.ws-canvas-element{position:absolute;left:var(--desktop-x);top:var(--desktop-y);width:var(--desktop-width);height:var(--desktop-height);font-size:clamp(10px,var(--canvas-font),160px);line-height:1.2;overflow:hidden}
.ws-canvas-element[data-kind=text]{overflow:visible}
.ws-canvas-motion,.ws-canvas-link{display:flex;align-items:center;width:100%;height:100%;border-radius:inherit}
.ws-canvas-link:focus-visible{outline:3px solid currentColor;outline-offset:-3px}
@container (max-width:900px){.ws-canvas-element{left:var(--tablet-x);top:var(--tablet-y);width:var(--tablet-width);height:var(--tablet-height);font-size:clamp(10px,var(--tablet-font),160px)}}
@container (max-width:600px){.ws-canvas{height:var(--canvas-mobile-height)}.ws-canvas-element{left:var(--mobile-x);top:var(--mobile-y);width:var(--mobile-width);height:var(--mobile-height);font-size:clamp(10px,var(--mobile-font),160px)}.ws-canvas-element[data-mobile-hidden]{display:none}}
@keyframes ws-canvas-float{0%,100%{translate:0 0}50%{translate:0 -10px}}
@media (prefers-reduced-motion:no-preference){
.ws-canvas-motion[data-motion=fade]{animation:ws-fade var(--canvas-duration) ease var(--canvas-delay) both}
.ws-canvas-motion[data-motion=rise]{animation:ws-rise var(--canvas-duration) ease var(--canvas-delay) both}
.ws-canvas-motion[data-motion=zoom]{animation:ws-zoom var(--canvas-duration) ease var(--canvas-delay) both}
.ws-canvas-motion[data-motion=float]{animation:ws-canvas-float var(--canvas-duration) ease-in-out var(--canvas-delay) infinite}
.ws-canvas-element:hover .ws-canvas-motion[data-motion=float]{animation-play-state:paused}
}
@media (prefers-reduced-motion:no-preference){@supports(animation-timeline:view()){.ws-canvas-motion[data-motion=fade],.ws-canvas-motion[data-motion=rise],.ws-canvas-motion[data-motion=zoom]{animation-timeline:view();animation-range:entry 0% entry 70%;animation-delay:0s}}}
@media print{.ws-canvas-motion{animation:none!important}}
`;
