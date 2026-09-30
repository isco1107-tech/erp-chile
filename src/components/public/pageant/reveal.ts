/**
 * Revelado al hacer scroll del micrositio y de la página de postulación.
 *
 * El estado "ya se reveló" vive en un ATRIBUTO (`data-in`), no en una clase: React es dueño de `className`, y cada vez
 * que una lista de clases cambia (por ejemplo `is-open` al tocar un paquete de sponsor) reescribe el atributo entero y
 * borraba la marca puesta a mano, con lo que el elemento volvía a `opacity: 0` y desaparecía dejando su hueco en blanco.
 * React no toca atributos que él no renderiza, así que `data-in` sobrevive a cualquier re-render.
 *
 * Además de IntersectionObserver hay una red de seguridad: si por lo que sea el detector no avisa (desplazamiento brusco,
 * navegador con el detector limitado), todo lo que ya está en pantalla o quedó por encima se revela solo. Un texto nunca
 * debe quedar invisible por depender de una animación.
 */

const HIDDEN = '[data-reveal]:not([data-in])';

export function reveal(el: Element): void {
  el.setAttribute('data-in', '');
}

export function startReveal(root: HTMLElement): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    // Sin animación: todo visible desde el principio (y lo que se agregue después, también).
    root.querySelectorAll(HIDDEN).forEach(reveal);
    return () => undefined;
  }
  root.dataset.motion = 'on';

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  const watch = () => root.querySelectorAll(HIDDEN).forEach((el) => observer.observe(el));
  watch();

  // Elementos que aparecen después (cambio candidata/sponsor, contenido que carga tarde) también se observan.
  const mutations = new MutationObserver(watch);
  mutations.observe(root, { childList: true, subtree: true });

  // Red de seguridad: lo que ya está en pantalla o quedó arriba y sigue oculto, se revela.
  const sweep = () => {
    const pending = root.querySelectorAll(HIDDEN);
    if (pending.length === 0) return;
    const limit = window.innerHeight * 0.98;
    pending.forEach((el) => {
      if (el.getBoundingClientRect().top < limit) reveal(el);
    });
  };
  const timer = window.setInterval(sweep, 900);

  return () => {
    observer.disconnect();
    mutations.disconnect();
    window.clearInterval(timer);
  };
}
