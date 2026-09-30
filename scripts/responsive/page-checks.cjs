/**
 * Se ejecuta DENTRO de la página (page.evaluate). Devuelve los problemas de
 * responsividad que encuentra: desborde horizontal de la página, texto que
 * queda fuera de la pantalla o recortado por un contenedor, y letra ilegible.
 * Lo que es decorativo a propósito (aria-hidden, cintas que se desplazan) se
 * ignora: solo cuenta lo que una persona tiene que poder leer.
 */
module.exports = function collectProblems(rootSelector) {
  const root = document.querySelector(rootSelector) || document.body;
  const vw = document.documentElement.clientWidth;
  const problems = [];
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const snippet = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 60);

  const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docWidth > vw + 1) problems.push({ kind: 'pagina-desborda', detail: `La página mide ${docWidth}px y la pantalla ${vw}px (aparece scroll horizontal)` });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || '';
    if (!text.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(node)) continue;
    seen.add(node);
    // Lo decorativo (aria-hidden) también se ve: solo se ignora lo oculto de verdad y la cinta que se desplaza a propósito.
    // `data-truncate` marca los recortes con puntos suspensivos que son diseño (el texto completo está en otro lado).
    if (el.closest('[hidden], script, style, .pgs-sr, .pgs-ribbon, [data-truncate]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) continue;
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));

    // Un contenedor con scroll horizontal propio (carrusel) puede tener texto "fuera" a propósito.
    let scroller = null;
    for (let p = el; p && p !== root.parentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') {
        scroller = p;
        break;
      }
    }
    const scrollerRect = scroller ? scroller.getBoundingClientRect() : null;
    const insideScroller = Boolean(scrollerRect);
    const label = `${describe(el)} «${snippet(text)}»`;

    if (!insideScroller && (left < -1 || right > vw + 1)) {
      problems.push({ kind: 'texto-fuera-de-pantalla', detail: `${label} va de ${Math.round(left)} a ${Math.round(right)}px (pantalla ${vw}px)` });
    }
    if (insideScroller && scrollerRect && (scrollerRect.left < -1 || scrollerRect.right > vw + 1)) {
      problems.push({ kind: 'carrusel-fuera-de-pantalla', detail: `${describe(scroller)} va de ${Math.round(scrollerRect.left)} a ${Math.round(scrollerRect.right)}px (pantalla ${vw}px)` });
    }

    // Recortado por un ancestro con overflow hidden/clip (el texto existe pero no se ve completo).
    for (let p = el; p && p !== root.parentElement; p = p.parentElement) {
      if (p === scroller) break;
      const s = getComputedStyle(p);
      const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip';
      const clipsY = s.overflowY === 'hidden' || s.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      const pr = p.getBoundingClientRect();
      if (clipsX && (left < pr.left - 1 || right > pr.right + 1)) {
        problems.push({ kind: 'texto-recortado', detail: `${label} se corta dentro de ${describe(p)} (texto ${Math.round(left)}–${Math.round(right)}px, caja ${Math.round(pr.left)}–${Math.round(pr.right)}px)` });
        break;
      }
      if (clipsY && (top < pr.top - 1 || bottom > pr.bottom + 1)) {
        problems.push({ kind: 'texto-recortado', detail: `${label} se corta verticalmente dentro de ${describe(p)}` });
        break;
      }
    }

    // Palabra corriente partida en dos líneas ("DÍA" / "S"): el contenedor es muy angosto para lo que contiene.
    // Se ignoran las palabras largas (un nombre enorme puede partirse) y las que llevan guion o barra.
    if (text.length <= 200) {
      for (const match of text.matchAll(/\S+/g)) {
        const word = match[0];
        if (word.length < 3 || word.length > 14 || /[-/@.]/.test(word)) continue;
        const wr = document.createRange();
        wr.setStart(node, match.index);
        wr.setEnd(node, match.index + word.length);
        const lines = new Set(Array.from(wr.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (lines.size > 1) {
          problems.push({ kind: 'palabra-partida', detail: `${label}: la palabra «${word}» se parte en dos líneas` });
          break;
        }
      }
    }

    const size = parseFloat(cs.fontSize);
    if (size < 11 && text.trim().length > 3) problems.push({ kind: 'letra-muy-chica', detail: `${label} usa ${size}px` });
  }

  // Imágenes que se salen de la pantalla.
  for (const img of root.querySelectorAll('img')) {
    if (img.closest('[hidden]')) continue;
    const r = img.getBoundingClientRect();
    if (r.width > 0 && (r.left < -1 || r.right > vw + 1) && !img.closest('.pgs-rail')) {
      problems.push({ kind: 'imagen-fuera-de-pantalla', detail: `${describe(img)} va de ${Math.round(r.left)} a ${Math.round(r.right)}px (pantalla ${vw}px)` });
    }
  }

  // Deduplica (mismo tipo y detalle).
  const unique = new Map(problems.map((p) => [`${p.kind}|${p.detail}`, p]));
  return Array.from(unique.values());
};
