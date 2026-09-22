import { useEffect, type RefObject } from 'react';

/**
 * Reveal-on-scroll for every `[data-reveal]` inside `root`.
 *
 * Progressive enhancement on purpose: the hidden state lives behind
 * `[data-reveal-ready]`, which only this effect sets. Without JS — or if the
 * observer never fires — the page renders fully visible instead of blank.
 */
export function useReveal(root: RefObject<HTMLElement | null>, visibleClass: string) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    node.setAttribute('data-reveal-ready', '');
    const targets = node.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(visibleClass);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -7% 0px', threshold: 0.12 }
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [root, visibleClass]);
}

/** Count-up that starts when the element scrolls into view, once. */
export function useCountUp(ref: RefObject<HTMLElement | null>, value: number, duration = 1400) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      node.textContent = String(value);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = String(value);
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          // easeOutExpo: fast start, long settle — reads as "counting up".
          const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          node.textContent = String(Math.round(eased * value));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, value, duration]);
}
