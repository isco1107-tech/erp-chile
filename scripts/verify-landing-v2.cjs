/*
 * Verificación de /landing-v2 con Playwright (Chromium headless).
 *
 * Uso: node scripts/verify-landing-v2.cjs [origen] [ruta]   (por defecto http://localhost:3000 y /)
 *
 * Revisa los cinco criterios de éxito del hero, las anclas, las pestañas, el
 * diálogo de ampliar, el desborde horizontal, el movimiento reducido (el
 * scroll sigue mandando, sin inercia) y la versión apilada (sin JavaScript o
 * con ventana baja), y deja capturas en .vercel/landing-v2-check/.
 * No envía el formulario ni escribe en ninguna base de datos.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.argv[2] || 'http://localhost:3000';
const url = `${origin}${process.argv[3] || '/'}`;
const out = path.resolve('.vercel/landing-v2-check');
const manifest = JSON.parse(fs.readFileSync(path.resolve('public/marketing/cinematic/seq/manifest.json'), 'utf8'));
const V1_END = 0.55;
const V2_TIMING = [[0, 0], [0.35, 0.25], [0.9, 1], [1, 1]];
const results = [];

fs.mkdirSync(out, { recursive: true });

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Mismo mapeo que src/components/marketing/cinematic/sequence.ts (v2Time y frameAt). */
function v2Time(stretch) {
  const x = Math.min(1, Math.max(0, stretch));
  for (let index = 1; index < V2_TIMING.length; index += 1) {
    const [x1, y1] = V2_TIMING[index];
    if (x <= x1) {
      const [x0, y0] = V2_TIMING[index - 1];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

function expectedFrame(p, set) {
  const counts = [manifest.clips.v1[set].count, manifest.clips.v2[set].count];
  if (p < V1_END) return `v1:${Math.min(counts[0] - 1, Math.round((p / V1_END) * (counts[0] - 1))) + 1}`;
  return `v2:${Math.min(counts[1] - 1, Math.round(v2Time((p - V1_END) / (1 - V1_END)) * (counts[1] - 1))) + 1}`;
}

async function goToProgress(page, p) {
  await page.evaluate(target => {
    const track = document.querySelector('[data-cinematic-track]');
    const stage = track.firstElementChild;
    const top = track.getBoundingClientRect().top + window.scrollY;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, top + target * (track.offsetHeight - stage.offsetHeight));
  }, p);
  await page.waitForFunction(target => {
    const value = Number(document.querySelector('[data-cinematic-track]').dataset.progress);
    return Math.abs(value - target) <= 0.0005;
  }, p, { timeout: 20000 });
}

/** Firma del canvas: color medio de una grilla de 8×6 celdas. */
async function canvasSignature(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-cinematic-track] canvas');
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    const cells = [];
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const x = Math.floor(((column + 0.5) / 8) * width);
        const y = Math.floor(((row + 0.5) / 6) * height);
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        cells.push(r, g, b);
      }
    }
    return cells;
  });
}

function distance(a, b) {
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
}

async function hero(browser, label, viewport, set) {
  console.log(`\n── Hero ${label} (${viewport.width}×${viewport.height}, set ${set})`);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: set === 'mobile', hasTouch: set === 'mobile' });
  const page = await context.newPage();
  const errors = [];
  let frameBytes = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', async response => {
    if (!response.url().includes('/marketing/cinematic/seq/')) return;
    const length = Number(response.headers()['content-length'] ?? 0);
    frameBytes += length || (await response.body().catch(() => Buffer.alloc(0))).length;
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-cinematic-track][data-painted]', { timeout: 30000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');

  // Criterio 1: titular gigante a la izquierda sobre el primer fotograma, a pantalla completa.
  await goToProgress(page, 0);
  await page.waitForFunction(() => document.querySelector('[data-cinematic-track]').dataset.frame === 'v1:1');
  const h1 = await page.$eval('h1', node => {
    // Extensión real del texto: el h1 es un bloque del ancho del contenedor.
    const rects = [...node.children].map(span => {
      const range = document.createRange();
      range.selectNodeContents(span);
      return range.getBoundingClientRect();
    });
    const left = Math.min(...rects.map(rect => rect.left));
    return {
      text: node.innerText.replace(/\s+/g, ' ').trim(),
      box: { left, width: Math.max(...rects.map(rect => rect.right)) - left },
      size: parseFloat(getComputedStyle(node).fontSize),
    };
  });
  const canvasBox = await page.$eval('[data-cinematic-track] canvas', node => node.getBoundingClientRect().toJSON());
  check('1. H1 «OPERA. CONTROLA. DECIDE.»', h1.text === 'OPERA. CONTROLA. DECIDE.', h1.text);
  check('1. H1 a la izquierda', h1.box.left < viewport.width * 0.12 && h1.box.left + h1.box.width < viewport.width * 0.72, `x=${Math.round(h1.box.left)} ancho=${Math.round(h1.box.width)} fuente=${h1.size}px`);
  check('1. Video a pantalla completa', canvasBox.width >= viewport.width && canvasBox.height >= viewport.height, `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}`);
  check('1. Primer fotograma de v1 dibujado', await page.$eval('[data-cinematic-track]', node => node.dataset.frame) === 'v1:1');
  await page.screenshot({ path: path.join(out, `${label}-p000.png`) });
  const start = await canvasSignature(page);

  // Criterio 2: el scroll avanza y retrocede el video; sin autoplay, sin <video>.
  check('2. Sin elemento <video>', await page.$$eval('video', nodes => nodes.length) === 0);
  check('2. El canvas no tiene animación CSS', await page.$eval('[data-cinematic-track] canvas', node => getComputedStyle(node).animationName) === 'none');
  await goToProgress(page, 0.3);
  const at30 = expectedFrame(0.3, set);
  await page.waitForFunction(frame => document.querySelector('[data-cinematic-track]').dataset.frame === frame, at30, { timeout: 20000 });
  const middle = await canvasSignature(page);
  check('2. Avanza con el scroll', distance(start, middle) > 6, `P .3 → ${at30}, diferencia ${distance(start, middle).toFixed(1)}`);
  await page.waitForTimeout(2000);
  check('2. No se reproduce solo (2 s quieto)', await page.$eval('[data-cinematic-track]', node => node.dataset.frame) === at30);
  await page.screenshot({ path: path.join(out, `${label}-p030.png`) });
  await goToProgress(page, 0);
  await page.waitForFunction(() => document.querySelector('[data-cinematic-track]').dataset.frame === 'v1:1', null, { timeout: 20000 });
  check('2. Retrocede al subir', distance(start, await canvasSignature(page)) < 2);

  // Criterio 3: titular y cifras suben ~40 px y se desvanecen.
  await goToProgress(page, 0.11);
  const introMid = await page.$eval('[data-cinematic-track] h1', node => {
    const intro = node.parentElement.parentElement;
    return { opacity: Number(intro.style.opacity), transform: intro.style.transform, facts: intro.contains(document.querySelector('[data-cinematic-track] ul')) };
  });
  await goToProgress(page, 0.22);
  const introHidden = await page.$eval('[data-cinematic-track] h1', node => {
    const intro = node.parentElement.parentElement;
    return { hidden: intro.hasAttribute('data-hidden'), transform: intro.style.transform, opacity: intro.style.opacity };
  });
  check('3. A medio camino sube y se desvanece (con las cifras)', introMid.opacity > 0.05 && introMid.opacity < 0.95 && /-[1-9]/.test(introMid.transform) && introMid.facts, `P .11: opacidad ${introMid.opacity}, ${introMid.transform}`);
  check('3. En P .22 subió 40 px y desapareció', introHidden.hidden && introHidden.transform.includes('-40') && Number(introHidden.opacity) === 0, `${introHidden.transform}, opacidad ${introHidden.opacity}`);

  // Criterio 4: «Ahora, estás dentro.» sobre el final de v1 y v2 sigue.
  await goToProgress(page, 0.5);
  await page.screenshot({ path: path.join(out, `${label}-p050.png`) });
  const insideAt50 = await page.$eval('[data-cinematic-track] h2', node => Number(node.parentElement.style.opacity));
  await goToProgress(page, 0.62);
  const inside = await page.$eval('[data-cinematic-track] h2', node => ({ text: node.innerText.replace(/\s+/g, ' ').trim(), box: node.getBoundingClientRect().toJSON(), opacity: Number(node.parentElement.style.opacity) }));
  const center = inside.box.left + inside.box.width / 2;
  check('4. Aparece «AHORA, ESTÁS DENTRO.»', inside.text === 'AHORA, ESTÁS DENTRO.' && inside.opacity === 1, `${inside.text} (P .5 opacidad ${insideAt50.toFixed(2)}, P .62 opacidad ${inside.opacity})`);
  check('4. Centrado', Math.abs(center - viewport.width / 2) < viewport.width * 0.02, `centro ${Math.round(center)} de ${viewport.width}`);
  await goToProgress(page, 0.75);
  const at75 = expectedFrame(0.75, set);
  await page.waitForFunction(frame => document.querySelector('[data-cinematic-track]').dataset.frame === frame, at75, { timeout: 20000 });
  check('4. v2 continúa el movimiento', at75.startsWith('v2:'), `P .75 → ${at75}`);
  await page.screenshot({ path: path.join(out, `${label}-p075.png`) });
  await goToProgress(page, 1);
  const lastFrame = `v2:${manifest.clips.v2[set].count}`;
  await page.waitForFunction(frame => document.querySelector('[data-cinematic-track]').dataset.frame === frame, lastFrame, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600); // la cabecera cambia de fondo con una transición de .45 s
  const ending = await page.$eval('[data-cinematic-track]', node => ({
    frame: node.dataset.frame,
    shade: node.querySelector('canvas').nextElementSibling.style.transform,
    hidden: node.querySelector('h2').parentElement.hasAttribute('data-hidden'),
    light: node.hasAttribute('data-light'),
    header: getComputedStyle(document.querySelector('header')).backgroundColor,
  }));
  const headerAlpha = Number(/rgba\(11, 14, 20, ([0-9.]+)\)/.exec(ending.header)?.[1] ?? 0);
  check('4. Termina en el último fotograma de v2, a la vista', ending.frame === lastFrame && ending.shade === 'scaleY(0)' && ending.hidden, `${ending.frame}, degradado ${ending.shade}`);
  check('4. Sobre el final claro la cabecera tiene fondo', ending.light && headerAlpha >= 0.8, ending.header);
  await page.screenshot({ path: path.join(out, `${label}-p100.png`) });
  // Antes del final ya está el último fotograma: el scroll termina quieto en él.
  await goToProgress(page, 0.97);
  check('4. El último fotograma se sostiene antes del final', await page.$eval('[data-cinematic-track]', node => node.dataset.frame) === lastFrame);

  // Criterio 5: sin corte visible hacia la sección siguiente.
  const seam = await page.evaluate(() => {
    const track = document.querySelector('[data-cinematic-track]');
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + track.offsetHeight - window.innerHeight / 2);
    return { next: getComputedStyle(track.nextElementSibling).backgroundColor, root: getComputedStyle(track.closest('main')).backgroundColor };
  });
  await page.waitForTimeout(400);
  const boundary = await page.screenshot({ path: path.join(out, `${label}-union.png`) });
  const seamPixels = await page.evaluate(async png => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const line = Math.floor(image.height / 2);
    const sample = y => [...context.getImageData(Math.floor(image.width * 0.2), y, 1, 1).data.slice(0, 3)];
    return { above: sample(line - 6), below: sample(line + 6) };
  }, boundary.toString('base64'));
  const near = rgb => rgb.every((value, index) => Math.abs(value - [11, 14, 20][index]) <= 6);
  check('5. Fondo de la página #0b0e14', seam.root === 'rgb(11, 14, 20)', seam.root);
  check('5. Sin corte visible en la unión', near(seamPixels.above) && near(seamPixels.below), `arriba ${seamPixels.above} · abajo ${seamPixels.below}`);

  // La secuencia completa, para medir el peso real de fotogramas descargados.
  for (let p = 0; p <= 1.0001; p += 0.05) await goToProgress(page, Math.min(1, p));
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log(`  fotogramas descargados: ${(frameBytes / 1e6).toFixed(2)} MB`);
  check(`Sin errores de consola (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
  return frameBytes;
}

async function page2(browser) {
  console.log('\n── Resto de la página (1440×900)');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'load' });
  // Interactuar recién cuando React terminó de hidratar (los efectos marcan el DOM).
  await page.waitForSelector('#plataforma[data-tabs-ready]');
  await page.waitForSelector('main[data-in-track]');

  const anchors = ['contenido', 'como-funciona', 'plataforma', 'tributacion', 'para-quien', 'planes', 'preguntas', 'cotizar', 'descargas'];
  const missing = await page.evaluate(ids => ids.filter(id => !document.getElementById(id)), anchors);
  check('Anclas presentes', missing.length === 0, missing.join(', '));
  check('Enlace «Ir al contenido»', await page.getByRole('link', { name: 'Ir al contenido' }).count() === 1);
  check('Navegación mínima: 4 enlaces + «Solicitar demo»', await page.locator('nav[aria-label="Navegación principal"] a').count() === 4 && await page.locator('header').getByRole('link', { name: /Solicitar demo/ }).count() === 1);
  check('JSON-LD presente', await page.locator('script[type="application/ld+json"]').count() === 1);

  // Las secciones lejanas usan content-visibility: el salto debe caer justo en la sección.
  for (const [label, id] of [['Planes', 'planes'], ['Certámenes', 'para-quien']]) {
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
    await page.locator('nav[aria-label="Navegación principal"]').getByRole('link', { name: label, exact: true }).click();
    await page.waitForFunction(target => {
      const top = document.getElementById(target).getBoundingClientRect().top;
      return Math.abs(top) < 2;
    }, id, { timeout: 15000 }).catch(() => {});
    const top = await page.evaluate(target => Math.round(document.getElementById(target).getBoundingClientRect().top), id);
    check(`El ancla #${id} aterriza en su sección`, Math.abs(top) < 2, `borde superior a ${top}px`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  // Pestañas de «Todo cuadra.»: clic, teclado y ampliar.
  const tabs = page.locator('[role="tablist"][aria-label="Vistas del ERP"] [role="tab"]');
  check('Cinco vistas en pestañas', await tabs.count() === 5);
  await page.locator('#plataforma').scrollIntoViewIfNeeded();
  for (const name of ['Ventas', 'Inventario', 'Finanzas', 'Certámenes', 'Visión general']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.waitForTimeout(460);
    const state = await page.evaluate(label => ({
      selected: document.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(),
      shots: document.querySelectorAll('#product-panel svg[role="img"]').length,
      mock: document.querySelector('#product-panel svg[role="img"]').getAttribute('aria-label'),
    }), name);
    check(`Pestaña ${name}`, state.selected === name && state.shots === 1 && state.mock.includes('datos de ejemplo'));
  }
  await page.screenshot({ path: path.join(out, 'plataforma.png') });
  await page.getByRole('tab', { name: 'Visión general', exact: true }).press('ArrowRight');
  check('Flechas del teclado en pestañas', await page.getByRole('tab', { name: 'Ventas', exact: true }).getAttribute('aria-selected') === 'true');
  await page.getByRole('button', { name: 'Ampliar vista de Ventas' }).click();
  check('Ampliar abre el diálogo', await page.getByRole('dialog', { name: 'Vista ampliada: Ventas' }).isVisible());
  await page.keyboard.press('Escape');
  check('Escape cierra el diálogo', !(await page.getByRole('dialog').isVisible()));

  // Tarjeta de resultados que selecciona una vista.
  await page.getByRole('link', { name: 'Explora el inventario' }).click();
  await page.waitForTimeout(600);
  check('«Explora el inventario» abre Inventario', await page.getByRole('tab', { name: 'Inventario', exact: true }).getAttribute('aria-selected') === 'true');

  // Pasos fijos: el panel cambia con el scroll.
  const flow = await page.evaluate(async () => {
    const section = document.getElementById('como-funciona');
    const stage = section.firstElementChild;
    const travel = section.offsetHeight - stage.offsetHeight;
    document.documentElement.style.scrollBehavior = 'auto';
    const seen = [];
    for (const step of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (let pass = 0; pass < 2; pass += 1) {
        window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + step * travel);
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      await new Promise(resolve => setTimeout(resolve, 150));
      seen.push(document.querySelector('[data-step-panel][data-active] h3')?.textContent);
    }
    return seen;
  });
  check('Los 5 pasos aparecen uno a uno', new Set(flow).size === 5, flow.join(' → '));

  // Formulario (sin enviar).
  await page.locator('#cotizar').scrollIntoViewIfNeeded();
  await page.getByLabel('Tu nombre', { exact: false }).fill('Prueba');
  check('Formulario operativo', await page.locator('#cotizar form').count() === 1 && await page.getByRole('button', { name: /Solicitar demo y cotización/ }).isEnabled());
  check('Descargas', await page.locator('#descargas a[download], #descargas a[href="/login"]').count() >= 3);

  // Recorre toda la página para que aparezca lo que se revela al entrar y guarda la captura completa.
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.body.scrollHeight; y += Math.floor(window.innerHeight * 0.7)) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 70));
    }
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, 'pagina-1440.png'), fullPage: true });
  check('Sin errores de consola (página)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

async function overflow(browser) {
  console.log('\n── Desborde horizontal');
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    check(`Sin scroll horizontal a ${width}px`, widths.scroll <= widths.client, `${widths.scroll} vs ${widths.client}`);
    await context.close();
  }
}

/** Estado del hero y de la escena de pasos, para los modos estático y reducido. */
async function sceneState(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-cinematic-track]');
    const inside = track.querySelector('h2');
    return {
      trackHeight: track.offsetHeight,
      stagePosition: getComputedStyle(track.firstElementChild).position,
      insideVisible: getComputedStyle(inside.parentElement).opacity === '1' && getComputedStyle(inside.parentElement).visibility === 'visible',
      painted: track.hasAttribute('data-painted'),
      steps: document.querySelectorAll('[data-step-panel]').length,
      stepsVisible: [...document.querySelectorAll('[data-step-panel]')].filter(panel => getComputedStyle(panel).visibility === 'visible').length,
      copies: [...document.querySelectorAll('#product-panel h3')].map(node => node.textContent),
    };
  });
}

async function staticModes(browser) {
  console.log('\n── Sin JavaScript y ventana baja (versión apilada)');
  const cases = [
    ['sin-js-1440', { width: 1440, height: 900 }, { javaScriptEnabled: false }],
    ['sin-js-390', { width: 390, height: 844 }, { javaScriptEnabled: false }],
    ['ventana-baja', { width: 1280, height: 520 }, {}],
  ];
  for (const [tag, viewport, options] of cases) {
    const context = await browser.newContext({ viewport, ...options });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const state = await sceneState(page);
    check(`${tag}: sin pista larga`, state.trackHeight < Math.max(viewport.height, 560) * 2.2 && state.stagePosition !== 'sticky', `alto ${state.trackHeight}px, escenario ${state.stagePosition}`);
    check(`${tag}: «Ahora, estás dentro.» visible y sin canvas`, state.insideVisible && !state.painted);
    check(`${tag}: los 5 pasos apilados`, state.steps === 5 && state.stepsVisible === 5);
    check(`${tag}: las 5 vistas en el HTML`, state.copies.length === 5, state.copies.join(' / '));
    await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: tag === 'sin-js-390' });
    await context.close();
  }
}

/** Con movimiento reducido el video igual avanza con el scroll, pero sin inercia. */
async function reducedMotion(browser) {
  console.log('\n── Movimiento reducido (el scroll manda, sin inercia)');
  for (const [tag, viewport, set] of [['reducido-1440', { width: 1440, height: 900 }, 'desktop'], ['reducido-390', { width: 390, height: 844 }, 'mobile']]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: set === 'mobile', hasTouch: set === 'mobile' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-cinematic-track][data-painted]', { timeout: 30000 });
    const state = await sceneState(page);
    check(`${tag}: pista del video activa`, state.trackHeight > viewport.height * 3 && state.stagePosition === 'sticky', `alto ${state.trackHeight}px`);
    const elapsed = await page.evaluate(() => new Promise(resolve => {
      const track = document.querySelector('[data-cinematic-track]');
      const stage = track.firstElementChild;
      document.documentElement.style.scrollBehavior = 'auto';
      const target = 0.3;
      const started = performance.now();
      window.scrollTo(0, track.getBoundingClientRect().top + window.scrollY + target * (track.offsetHeight - stage.offsetHeight));
      const poll = () => {
        if (Math.abs(Number(track.dataset.progress) - target) <= 0.0005) resolve(Math.round(performance.now() - started));
        else if (performance.now() - started > 5000) resolve(-1);
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }));
    check(`${tag}: el scroll lleva el video 1:1, sin inercia`, elapsed >= 0 && elapsed < 200, `alcanzó P .3 en ${elapsed} ms`);
    const frame = expectedFrame(0.3, set);
    await page.waitForFunction(expected => document.querySelector('[data-cinematic-track]').dataset.frame === expected, frame, { timeout: 20000 }).catch(() => {});
    check(`${tag}: el video avanza con el scroll`, await page.$eval('[data-cinematic-track]', node => node.dataset.frame) === frame, `P .3 → ${frame}`);
    await page.screenshot({ path: path.join(out, `${tag}-p030.png`) });
    const flow = await page.evaluate(async () => {
      const section = document.getElementById('como-funciona');
      const stageNode = section.firstElementChild;
      const travel = section.offsetHeight - stageNode.offsetHeight;
      const seen = [];
      for (const step of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (let pass = 0; pass < 2; pass += 1) {
          window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + step * travel);
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        await new Promise(resolve => setTimeout(resolve, 150));
        seen.push(document.querySelector('[data-step-panel][data-active] h3')?.textContent);
      }
      return { seen, sticky: getComputedStyle(stageNode).position };
    });
    check(`${tag}: los 5 pasos cambian con el scroll`, flow.sticky === 'sticky' && new Set(flow.seen).size === 5, flow.seen.join(' → '));
    await context.close();
  }
}

/**
 * El resto de la página también se mueve con el scroll, incluso con movimiento
 * reducido (así lo ve quien tiene apagados los efectos de animación del sistema).
 */
async function liveMotion(browser) {
  console.log('\n── Página viva (movimiento reducido: todo lo mueve el scroll)');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('main[data-live-ready]', { timeout: 20000 });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  // Dos veces: al saltar, las secciones de arriba (content-visibility) recién
  // toman su alto real y el destino se corre.
  const scrollTo = async (selector, fraction) => {
    for (let pass = 0; pass < 2; pass += 1) {
      await page.evaluate(([sel, off]) => {
        const node = document.querySelector(sel);
        window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - window.innerHeight * off);
      }, [selector, fraction]);
      await page.waitForTimeout(250);
    }
  };
  // Espera (con tope) a que la guía muestre el capítulo esperado: el reproductor
  // la escribe en el cuadro siguiente al que actualiza el progreso.
  const chapterOpacity = async (p, expected) => {
    await goToProgress(page, p);
    await page.waitForFunction(index => Number(getComputedStyle(document.querySelectorAll('[data-cinematic-track] ol li')[index]).opacity) > 0.95, expected, { timeout: 3000 }).catch(() => {});
    return page.$$eval('[data-cinematic-track] ol li', nodes => nodes.map(node => Number(getComputedStyle(node).opacity)));
  };
  const enter = selector => page.$eval(selector, node => Number(node.style.getPropertyValue('--in') || 'NaN'));

  await scrollTo('#tributacion-title', 1.4);
  const before = await enter('#tributacion-title > span');
  await scrollTo('#tributacion-title', 0.3);
  const after = await enter('#tributacion-title > span');
  check('Los titulares suben con el scroll', before === 0 && after === 1, `--in ${before} → ${after}`);

  await scrollTo('#tributacion ul li', 0.9);
  const cascade = await page.$$eval('#tributacion ul li', nodes => nodes.slice(0, 3).map(node => Number(node.style.getPropertyValue('--in'))));
  check('Las tarjetas entran en cascada', cascade[0] > cascade[1] && cascade[1] >= cascade[2], cascade.map(value => value.toFixed(2)).join(' > '));

  const marquee = async fraction => {
    await scrollTo('[aria-labelledby="resultados-title"] + div', fraction);
    return page.$eval('[aria-labelledby="resultados-title"] + div > div', node => new DOMMatrix(getComputedStyle(node).transform).m41);
  };
  const shiftA = await marquee(0.8);
  const shiftB = await marquee(0.2);
  check('La franja de módulos corre con el scroll', Math.abs(shiftA - shiftB) > 100, `${Math.round(shiftA)} → ${Math.round(shiftB)} px`);

  // El cielo es un solo canvas: lo que dibuja cambia con el scroll.
  const skyPixels = () => page.evaluate(() => {
    const canvas = document.querySelector('main > div[aria-hidden] canvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    let signature = 0;
    for (let index = 3; index < data.length; index += 4 * 7) {
      if (data[index] > 0) {
        lit += 1;
        signature = (signature * 31 + index) % 1000000007;
      }
    }
    return { lit, signature };
  });
  const skyA = await skyPixels();
  await scrollTo('#planes', 0.6);
  const skyB = await skyPixels();
  check('El cielo de fondo se desplaza con el scroll', skyA.lit > 20 && skyB.lit > 20 && skyA.signature !== skyB.signature, `${skyA.lit} y ${skyB.lit} puntos encendidos`);

  const early = await chapterOpacity(0.1, 0);
  const late = await chapterOpacity(0.85, 2);
  check('La guía de capítulos del hero sigue al video', early[0] > 0.95 && early[2] < 0.5 && late[2] > 0.95 && late[0] < 0.5, `P .1: ${early.map(value => value.toFixed(2)).join(' / ')} · P .85: ${late.map(value => value.toFixed(2)).join(' / ')}`);

  await scrollTo('#planes', 0.1);
  const current = await page.$eval('nav[aria-label="Mapa de la página"]', node => node.querySelector('a[aria-current]')?.textContent);
  check('El mapa de estrellas marca la sección actual', current === 'Planes', current);

  // Cielo y cursor: con el mouse encima aparecen el cursor propio y la constelación.
  await page.mouse.move(1200, 500);
  await page.mouse.move(1230, 520);
  await page.waitForTimeout(300);
  const sky = await page.evaluate(() => {
    const canvas = document.querySelector('main > div[aria-hidden] canvas');
    const cursor = [...document.querySelectorAll('main > div[aria-hidden]')].find(node => node.children.length === 2 && node.firstElementChild.tagName === 'SPAN');
    return { canvas: Boolean(canvas && canvas.width > 0), cursor: cursor ? getComputedStyle(cursor).display : 'none' };
  });
  check('Cielo interactivo y cursor propio', sky.canvas && sky.cursor === 'block', `canvas ${sky.canvas}, cursor ${sky.cursor}`);

  check('Sin errores (página viva)', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();

  // En pantallas táctiles, la tarjeta que pasa por el centro se enciende sola.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  await mobile.goto(url, { waitUntil: 'load' });
  await mobile.waitForSelector('main[data-live-ready]', { timeout: 20000 });
  await mobile.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let pass = 0; pass < 2; pass += 1) {
      const card = document.querySelector('#tributacion ul li');
      window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + card.offsetHeight / 2);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  });
  const focused = await mobile.$$eval('[data-focus]', nodes => nodes.map(node => node.querySelector('h3')?.textContent));
  check('Celular: la tarjeta del centro se enciende', focused.length === 1 && Boolean(focused[0]), focused.join(''));
  await phone.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopBytes = await hero(browser, 'escritorio', { width: 1440, height: 900 }, 'desktop');
    const mobileBytes = await hero(browser, 'movil', { width: 390, height: 844 }, 'mobile');
    await page2(browser);
    await overflow(browser);
    await reducedMotion(browser);
    await liveMotion(browser);
    await staticModes(browser);
    console.log(`\nFotogramas: escritorio ${(desktopBytes / 1e6).toFixed(2)} MB · móvil ${(mobileBytes / 1e6).toFixed(2)} MB`);
  } finally {
    await browser.close();
  }
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones en verde. Capturas en ${path.relative(process.cwd(), out)}`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
