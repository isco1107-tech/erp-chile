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
.ws-root{font-family:var(--ws-font);background-color:var(--ws-bg);color:var(--ws-text);font-feature-settings:normal;line-height:1.65;overflow-x:clip;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
.ws-root :focus-visible{outline:2px solid var(--s-mark,var(--ws-accent));outline-offset:3px}

.ws-tone-default{--s-bg:var(--ws-bg);--s-fg:var(--ws-text);--s-muted:var(--ws-muted);--s-line:var(--ws-border);--s-card:color-mix(in srgb,var(--ws-text) 4%,var(--ws-bg));--s-mark:var(--ws-mark-default);--s-btn:var(--ws-btn-default);--s-btn-fg:var(--ws-btn-default-fg);color:var(--s-fg)}
.ws-tone-muted{--s-bg:color-mix(in srgb,var(--ws-text) 5%,var(--ws-bg));--s-fg:var(--ws-text);--s-muted:var(--ws-muted);--s-line:var(--ws-border);--s-card:var(--ws-bg);--s-mark:var(--ws-mark-default);--s-btn:var(--ws-btn-default);--s-btn-fg:var(--ws-btn-default-fg);color:var(--s-fg)}
.ws-tone-primary{--s-bg:var(--ws-primary);--s-fg:var(--ws-on-primary);--s-muted:color-mix(in srgb,var(--ws-on-primary) 78%,transparent);--s-line:color-mix(in srgb,var(--ws-on-primary) 24%,transparent);--s-card:color-mix(in srgb,var(--ws-on-primary) 8%,var(--ws-primary));--s-mark:var(--ws-mark-primary);--s-btn:var(--ws-btn-primary);--s-btn-fg:var(--ws-btn-primary-fg);color:var(--s-fg)}
.ws-tone-accent{--s-bg:var(--ws-accent);--s-fg:var(--ws-on-accent);--s-muted:color-mix(in srgb,var(--ws-on-accent) 80%,transparent);--s-line:color-mix(in srgb,var(--ws-on-accent) 26%,transparent);--s-card:color-mix(in srgb,var(--ws-on-accent) 10%,var(--ws-accent));--s-mark:var(--ws-on-accent);--s-btn:var(--ws-btn-accent);--s-btn-fg:var(--ws-btn-accent-fg);color:var(--s-fg)}
.ws-tone-dark{--s-bg:var(--ws-dark);--s-fg:var(--ws-on-dark);--s-muted:color-mix(in srgb,var(--ws-on-dark) 74%,transparent);--s-line:color-mix(in srgb,var(--ws-on-dark) 20%,transparent);--s-card:color-mix(in srgb,var(--ws-on-dark) 7%,var(--ws-dark));--s-mark:var(--ws-mark-dark);--s-btn:var(--ws-btn-dark);--s-btn-fg:var(--ws-btn-dark-fg);color:var(--s-fg)}
.ws-bg{background-color:var(--s-bg)}
.ws-glass{background-color:color-mix(in srgb,var(--ws-bg) 86%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px)}
.ws-scrim{background-color:var(--ws-dark)}

.ws-section{position:relative;scroll-margin-top:5rem}
.ws-sp-none{padding-block:0}
.ws-sp-sm{padding-block:calc(var(--ws-section-y) * .5)}
.ws-sp-md{padding-block:var(--ws-section-y)}
.ws-sp-lg{padding-block:calc(var(--ws-section-y) * 1.6)}
.ws-sp-hero{padding-block:calc(var(--ws-section-y) * 1.5)}
@container (min-width:42rem){
.ws-sp-sm{padding-block:calc(var(--ws-section-y-lg) * .5)}
.ws-sp-md{padding-block:var(--ws-section-y-lg)}
.ws-sp-lg{padding-block:calc(var(--ws-section-y-lg) * 1.6)}
.ws-sp-hero{padding-block:calc(var(--ws-section-y-lg) * 1.5)}
}
.ws-under-header{padding-top:calc(var(--ws-section-y) * 1.5 + 4.5rem)}
@container (min-width:42rem){
.ws-under-header{padding-top:calc(var(--ws-section-y-lg) * 1.5 + 5rem)}
}

.ws-h{font-family:var(--ws-heading-font);text-transform:var(--ws-heading-case);letter-spacing:var(--ws-heading-spacing);line-height:1.12;font-weight:700;text-wrap:balance}
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

.ws-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.8rem 1.6rem;font-size:1rem;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;cursor:pointer;border:2px solid transparent;border-radius:var(--ws-button-radius);transition:transform .18s ease,box-shadow .18s ease,background-color .18s ease,color .18s ease,border-color .18s ease}
.ws-btn-sm{padding:.55rem 1.1rem;font-size:.9rem}
.ws-btn-main{background-color:var(--s-btn);color:var(--s-btn-fg);border-color:var(--s-btn);box-shadow:0 1px 2px rgb(0 0 0 / .14)}
.ws-btn-main:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgb(0 0 0 / .5)}
.ws-root[data-btn=outline] .ws-btn-main{background-color:transparent;color:var(--s-btn);box-shadow:none}
.ws-root[data-btn=outline] .ws-btn-main:hover{background-color:var(--s-btn);color:var(--s-btn-fg)}
.ws-root[data-btn=gradient] .ws-btn-main{background-image:linear-gradient(135deg,var(--s-btn),color-mix(in oklab,var(--s-btn) 55%,var(--ws-primary)));border-color:transparent}
.ws-btn-alt{background-color:transparent;color:var(--s-fg);border-color:color-mix(in srgb,var(--s-fg) 35%,transparent)}
.ws-btn-alt:hover{background-color:color-mix(in srgb,var(--s-fg) 10%,transparent);transform:translateY(-1px)}

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
@media (prefers-reduced-motion:no-preference){
@supports (animation-timeline:view()){
.ws-root[data-anim=fade] .ws-reveal{animation:ws-fade linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
.ws-root[data-anim=rise] .ws-reveal{animation:ws-rise linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
.ws-root[data-anim=zoom] .ws-reveal{animation:ws-zoom linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
}
}
@media (prefers-reduced-motion:reduce){
.ws-btn,.ws-card,.ws-logo,.ws-wa,.ws-navlink{transition:none}
.ws-btn:hover,.ws-card-hover:hover,.ws-wa:hover{transform:none}
}
`;
