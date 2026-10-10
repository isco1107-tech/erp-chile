/*
 * Verificación de /landing-v2 con Playwright (Chromium headless).
 *
 * Uso: node scripts/verify-landing-v2.cjs [origen] [ruta]   (por defecto http://localhost:3000 y /)
 *
 * Revisa la portada (sin video), el cierre (el único video de la página), las
 * anclas, las pestañas, el diálogo de ampliar, el desborde horizontal, el
 * movimiento reducido (el scroll sigue mandando, con la misma inercia) y la
 * versión apilada (sin JavaScript o con ventana baja), y deja capturas en
 * .vercel/landing-v2-check/.
 * No envía el formulario ni escribe en ninguna base de datos.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.argv[2] || 'http://localhost:3000';
const url = `${origin}${process.argv[3] || '/'}`;
const out = path.resolve('.vercel/landing-v2-check');
const manifest = JSON.parse(fs.readFileSync(path.resolve('public/marketing/cinematic/seq/manifest.json'), 'utf8'));
/** Mismo ritmo que sequence.ts: el cierre recorre v2 hasta antes de su final claro. */
const FINALE_TIMING = [[0, 0], [0.78, 1], [1, 1]];
const FINALE_MARGIN_SECONDS = 0.6;
const results = [];

fs.mkdirSync(out, { recursive: true });

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Mismo mapeo que src/components/marketing/cinematic/sequence.ts (videoTime y frameAt). */
function videoTime(progress, timing) {
  const x = Math.min(1, Math.max(0, progress));
  for (let index = 1; index < timing.length; index += 1) {
    const [x1, y1] = timing[index];
    if (x <= x1) {
      const [x0, y0] = timing[index - 1];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

function finaleLast(set) {
  const { count, fps, light } = manifest.clips.v2[set];
  if (light.length === 0) return count - 1;
  const first = Math.min(...light.map(([start]) => start));
  return Math.max(0, Math.min(count - 1, first - 1 - Math.round(FINALE_MARGIN_SECONDS * fps)));
}

function expectedFinaleFrame(p, set) {
  const last = finaleLast(set);
  return `v2:${Math.min(last, Math.round(videoTime(p, FINALE_TIMING) * last)) + 1}`;
}

/**
 * Portada sin video: titular a la izquierda, el panel del ERP a la derecha y
 * nada del video se descarga mientras la persona está arriba.
 */
async function hero(browser, label, viewport) {
  console.log(`\n── Portada ${label} (${viewport.width}×${viewport.height})`);
  const mobile = viewport.width < 700;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  let frameBytes = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (!response.url().includes('/marketing/cinematic/seq/')) return;
    const length = Number(response.headers()['content-length'] ?? 0);
    frameBytes += length || (await response.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(1600); // la entrada de la portada dura ~1.4 s
  const state = await page.evaluate(() => {
    const section = document.getElementById('contenido');
    const h1 = section.querySelector('h1');
    const rects = [...h1.children].map(span => {
      const range = document.createRange();
      range.selectNodeContents(span);
      return range.getBoundingClientRect();
    });
    const figure = section.querySelector('figure');
    return {
      text: h1.innerText.replace(/\s+/g, ' ').trim(),
      left: Math.min(...rects.map(rect => rect.left)),
      right: Math.max(...rects.map(rect => rect.right)),
      opacity: Number(getComputedStyle(h1).opacity),
      mock: figure?.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? '',
      figure: figure ? figure.getBoundingClientRect().toJSON() : null,
      media: section.querySelectorAll('video, canvas').length,
      ctas: [...section.querySelectorAll('a')].map(link => link.getAttribute('href')),
    };
  });
  check('Portada: H1 «OPERA. CONTROLA. DECIDE.»', state.text === 'OPERA. CONTROLA. DECIDE.' && state.opacity === 1, state.text);
  check('Portada: sin video ni canvas', state.media === 0);
  check('Portada: el panel del ERP, marcado como datos de ejemplo', state.mock.includes('datos de ejemplo'), state.mock);
  if (mobile) check('Portada: el panel va bajo el titular', state.figure && state.figure.top > 0, `y ${Math.round(state.figure?.top ?? 0)}`);
  else check('Portada: titular a la izquierda y panel a la derecha', state.left < viewport.width * 0.12 && state.figure && state.figure.left > state.right - 40, `titular ${Math.round(state.left)}–${Math.round(state.right)}, panel desde ${Math.round(state.figure?.left ?? 0)}`);
  check('Portada: lleva a la vitrina, a cómo funciona y a la versión corporativa', ['#modulos', '#como-funciona', '/empresas'].every(href => state.ctas.includes(href)));
  check('Portada: no descarga fotogramas del video', frameBytes === 0, `${(frameBytes / 1e6).toFixed(2)} MB`);
  await page.screenshot({ path: path.join(out, `${label}-portada.png`) });
  check(`Sin errores de página en la portada (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/**
 * Cierre: v2 avanza con el scroll hasta el logo y se detiene antes de su
 * final claro; «Dale Aether.» y el botón llegan con el logo, a un lado o
 * debajo, nunca encima del logo; y se funde con el pie sin corte.
 */
async function finale(browser, label, viewport, set) {
  console.log(`\n── Cierre ${label} (${viewport.width}×${viewport.height}, set ${set})`);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: set === 'mobile', hasTouch: set === 'mobile' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('main[data-in-track]');
  const goTo = async p => {
    await page.evaluate(target => {
      document.documentElement.style.scrollBehavior = 'auto';
      const track = document.querySelector('[data-finale-track]');
      // Dos pasadas: al acercarse, las secciones con content-visibility toman su alto real.
      for (let pass = 0; pass < 2; pass += 1) {
        const top = track.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top + target * (track.offsetHeight - track.firstElementChild.offsetHeight));
      }
    }, p);
    await page.waitForFunction(target => Math.abs(Number(document.querySelector('[data-finale-track]').dataset.progress) - target) <= 0.002, p, { timeout: 20000 });
  };
  const frame = () => page.$eval('[data-finale-track]', node => node.dataset.frame);
  const closeState = () => page.$eval('[data-finale-track] p:not([class*="eyebrow"])', node => {
    const block = node.parentElement;
    return { opacity: Number(block.style.opacity), hidden: block.hasAttribute('data-hidden'), box: block.getBoundingClientRect().toJSON() };
  });

  await goTo(0);
  await page.waitForSelector('[data-finale-track][data-painted]', { timeout: 30000 });
  check('Cierre: titular «Dale espacio para crecer.» a la vista', await page.$eval('#cierre-title', node => node.innerText.replace(/\s+/g, ' ').trim() === 'DALE ESPACIO PARA CRECER.' && getComputedStyle(node).visibility === 'visible'));
  const start = await closeState();
  check('Cierre: «Dale Aether.» aún oculto al entrar', start.hidden && start.opacity === 0);
  await goTo(0.5);
  const half = expectedFinaleFrame(0.5, set);
  await page.waitForFunction(expected => document.querySelector('[data-finale-track]').dataset.frame === expected, half, { timeout: 20000 }).catch(() => {});
  check('Cierre: v2 avanza con el scroll', await frame() === half, `P .5 → ${await frame()} (esperado ${half})`);
  await goTo(1);
  const last = `v2:${finaleLast(set) + 1}`;
  await page.waitForFunction(expected => document.querySelector('[data-finale-track]').dataset.frame === expected, last, { timeout: 20000 }).catch(() => {});
  const lightFrom = Math.min(...manifest.clips.v2[set].light.map(([first]) => first)) + 1;
  check('Cierre: termina en el logo, antes del tramo claro de v2', await frame() === last && finaleLast(set) + 1 < lightFrom, `${await frame()} (claro desde v2:${lightFrom})`);
  const end = await closeState();
  check('Cierre: «Dale Aether.» y el botón a la vista con el logo', !end.hidden && end.opacity === 1);
  // El logo ocupa el centro del cuadro: el bloque va a su izquierda (apaisado) o bajo él (vertical).
  const clear = end.box.right < viewport.width * 0.42 || end.box.top > viewport.height * 0.7;
  check('Cierre: el texto no queda encima del logo', clear, `caja x ${Math.round(end.box.left)}–${Math.round(end.box.right)}, y ${Math.round(end.box.top)}–${Math.round(end.box.bottom)}`);
  check('Cierre: botón «Arma tu cotización» lleva a la vitrina', await page.$eval('[data-finale-track] a', node => node.getAttribute('href')) === '#modulos');
  await page.screenshot({ path: path.join(out, `${label}-cierre.png`) });
  check(`Sin errores de página en el cierre (${label})`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
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

  const anchors = ['contenido', 'modulos', 'como-funciona', 'plataforma', 'tributacion', 'planes', 'preguntas', 'descargas', 'cierre'];
  const missing = await page.evaluate(ids => ids.filter(id => !document.getElementById(id)), anchors);
  check('Anclas presentes', missing.length === 0, missing.join(', '));
  check('Enlace «Ir al contenido»', await page.getByRole('link', { name: 'Ir al contenido' }).count() === 1);
  check('Navegación: 6 anclas (con «Módulos», «Saber más» y «Descargar») + «Para empresas» + «Cotizar»', await page.locator('nav[aria-label="Navegación principal"] a').count() === 7 && await page.locator('header').getByRole('link', { name: /^Cotizar/ }).count() === 1);
  check('JSON-LD presente', await page.locator('script[type="application/ld+json"]').count() === 1);

  // Las secciones lejanas usan content-visibility: el salto debe caer justo en la sección.
  for (const [label, id] of [['Planes', 'planes'], ['Módulos', 'modulos']]) {
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

  // Cómo funciona: los cinco pasos a la vista en una línea de tiempo (sin escena fija).
  await page.locator('#como-funciona').scrollIntoViewIfNeeded();
  const flow = await page.$$eval('#como-funciona ol > li h3', nodes => nodes.map(node => node.textContent));
  check('Los 5 pasos en la línea de tiempo', new Set(flow).size === 5, flow.join(' → '));
  check('Cómo funciona no queda fija', await page.$eval('#como-funciona', node => node.offsetHeight < window.innerHeight * 1.5));

  // Módulos: dos filas plegadas, filtro por área, casilla de cotizar y su barra (sin enviar).
  await page.locator('#modulos').scrollIntoViewIfNeeded();
  const cards = () => page.$$eval('#modulos-grilla > li', nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').length);
  check('Módulos: «Todos» plegado en dos filas', await cards() === 8);
  await page.getByRole('button', { name: /^Ver los \d+ módulos/ }).click();
  const total = await cards();
  check('Módulos: «Ver todos» despliega la vitrina', total >= 28, `${total} recuadros`);
  await page.locator('#modulos').getByRole('button', { name: /^Finanzas/ }).click();
  const finance = await page.$$eval('#modulos-grilla article p:first-child', nodes => [...new Set(nodes.map(node => node.textContent))]);
  check('Módulos: el filtro deja solo su área', finance.length === 1 && finance[0] === 'Finanzas', finance.join(', '));
  check('Módulos: sin precios en la vitrina', !(await page.locator('#modulos').innerText()).includes('$'));
  await page.locator('#modulos-grilla input[type="checkbox"]').first().check();
  await page.locator('#modulos-grilla input[type="checkbox"]').nth(1).check();
  check('Módulos: la casilla abre la barra del carrito', await page.getByRole('region', { name: 'Tu cotización' }).getByText('2 módulos en tu cotización').isVisible());
  await page.getByRole('region', { name: 'Tu cotización' }).getByRole('button', { name: /^Cotizar/ }).click();
  const quote = page.getByRole('dialog', { name: 'Cotiza tus módulos' });
  check('Módulos: «Cotizar» abre el formulario con lo elegido', await quote.isVisible() && await quote.locator('ul li').count() === 2);
  check('Módulos: pide correo y teléfono', await quote.getByLabel('Correo').getAttribute('required') !== null && await quote.getByLabel('Teléfono o WhatsApp').getAttribute('required') !== null);
  await page.screenshot({ path: path.join(out, 'cotizacion.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: 'Tu cotización' }).getByRole('button', { name: 'Vaciar' }).click();
  check('Módulos: «Vaciar» quita la barra', await page.getByRole('region', { name: 'Tu cotización' }).count() === 0);
  await page.locator('#modulos').getByRole('button', { name: /^Todos/ }).click();

  // Sin formulario de demo aparte: se cotiza desde la vitrina.
  check('Sin formulario de demo en la landing', await page.locator('#cotizar').count() === 0 && await page.locator('a[href="#cotizar"]').count() === 0);
  check('El cierre lleva a armar la cotización', await page.locator('footer a[href="#modulos"]').count() >= 1);
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

/** Estado del cierre y de la escena de pasos, para los modos estático y reducido. */
async function sceneState(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-finale-track]');
    const close = track.querySelector('a').parentElement;
    return {
      trackHeight: track.offsetHeight,
      stagePosition: getComputedStyle(track.firstElementChild).position,
      finaleClose: getComputedStyle(close).opacity === '1' && getComputedStyle(close).visibility === 'visible',
      painted: track.hasAttribute('data-painted'),
      steps: document.querySelectorAll('#como-funciona ol > li').length,
      stepsVisible: [...document.querySelectorAll('#como-funciona ol > li')].filter(step => getComputedStyle(step).visibility === 'visible').length,
      moduleCards: [...document.querySelectorAll('#modulos-grilla > li')].filter(card => getComputedStyle(card).display !== 'none').length,
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
    check(`${tag}: el cierre apilado, sin pista larga ni canvas`, state.trackHeight < Math.max(viewport.height, 560) * 1.5 && state.stagePosition !== 'sticky' && !state.painted, `alto ${state.trackHeight}px, escenario ${state.stagePosition}`);
    check(`${tag}: «Dale Aether.» y el botón a la vista`, state.finaleClose);
    check(`${tag}: los 5 pasos a la vista`, state.steps === 5 && state.stepsVisible === 5);
    if (options.javaScriptEnabled === false) check(`${tag}: todos los módulos a la vista`, state.moduleCards >= 28, `${state.moduleCards} recuadros`);
    check(`${tag}: las 5 vistas en el HTML`, state.copies.length === 5, state.copies.join(' / '));
    await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: tag === 'sin-js-390' });
    await context.close();
  }
}

/**
 * Con movimiento reducido el video igual avanza con el scroll y con la misma
 * inercia: no es una animación que corra sola, solo quita los saltos de la rueda.
 */
async function reducedMotion(browser) {
  console.log('\n── Movimiento reducido (el scroll manda, con inercia)');
  for (const [tag, viewport, set] of [['reducido-1440', { width: 1440, height: 900 }, 'desktop'], ['reducido-390', { width: 390, height: 844 }, 'mobile']]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: set === 'mobile', hasTouch: set === 'mobile' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('main[data-in-track]');
    const state = await sceneState(page);
    check(`${tag}: pista del cierre activa`, state.trackHeight > viewport.height * 1.6 && state.stagePosition === 'sticky', `alto ${state.trackHeight}px`);
    // Se acerca al cierre (dos pasadas: las secciones toman su alto real) y luego mide la inercia.
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      for (let pass = 0; pass < 2; pass += 1) {
        const track = document.querySelector('[data-finale-track]');
        window.scrollTo(0, track.getBoundingClientRect().top + window.scrollY);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    });
    await page.waitForSelector('[data-finale-track][data-painted]', { timeout: 30000 });
    const elapsed = await page.evaluate(() => new Promise(resolve => {
      const track = document.querySelector('[data-finale-track]');
      const stage = track.firstElementChild;
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
    check(`${tag}: el video alcanza al scroll y se detiene en él`, elapsed >= 0 && elapsed < 1600, `alcanzó P .3 en ${elapsed} ms`);
    const frame = expectedFinaleFrame(0.3, set);
    await page.waitForFunction(expected => document.querySelector('[data-finale-track]').dataset.frame === expected, frame, { timeout: 20000 }).catch(() => {});
    check(`${tag}: el video avanza con el scroll`, await page.$eval('[data-finale-track]', node => node.dataset.frame) === frame, `P .3 → ${frame}`);
    await page.screenshot({ path: path.join(out, `${tag}-p030.png`) });
    const steps = await page.$$eval('#como-funciona ol > li', nodes => nodes.length);
    check(`${tag}: los 5 pasos a la vista`, steps === 5, `${steps} pasos`);
    await context.close();
  }
}

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
  const enter = selector => page.$eval(selector, node => Number(node.style.getPropertyValue('--in') || 'NaN'));

  await scrollTo('#tributacion-title', 1.4);
  const before = await enter('#tributacion-title > span');
  await scrollTo('#tributacion-title', 0.3);
  const after = await enter('#tributacion-title > span');
  check('Los titulares suben con el scroll', before === 0 && after === 1, `--in ${before} → ${after}`);

  await scrollTo('#tributacion ul li', 0.9);
  const cascade = await page.$$eval('#tributacion ul li', nodes => nodes.slice(0, 3).map(node => Number(node.style.getPropertyValue('--in'))));
  check('Las tarjetas entran en cascada', cascade[0] > cascade[1] && cascade[1] >= cascade[2], cascade.map(value => value.toFixed(2)).join(' > '));

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

  await scrollTo('#planes', 0.1);
  const current = await page.$eval('nav[aria-label="Mapa de la página"]', node => node.querySelector('a[aria-current]')?.textContent);
  check('El mapa de estrellas marca la sección actual', current === 'Planes', current);

  // Cielo y cursor: con el mouse encima aparece el cursor propio.
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
    await hero(browser, 'escritorio', { width: 1440, height: 900 });
    await hero(browser, 'movil', { width: 390, height: 844 });
    await finale(browser, 'escritorio', { width: 1440, height: 900 }, 'desktop');
    await finale(browser, 'escritorio-ancho', { width: 1920, height: 900 }, 'desktop');
    await finale(browser, 'tableta', { width: 768, height: 1024 }, 'desktop');
    await finale(browser, 'movil', { width: 390, height: 844 }, 'mobile');
    await page2(browser);
    await overflow(browser);
    await reducedMotion(browser);
    await liveMotion(browser);
    await staticModes(browser);
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
