import type { WebSiteKind, WebSiteMode } from '@prisma/client';
import { BLOCK_INFO, blockImageUrls, blockLinks, blockTexts, isBlockEmpty, type WebSiteBlock } from './blocks';
import { htmlHints, MAX_HTML_BYTES, sanitizeHtml } from './html';
import { chromeLinks, documentFromBlocks, homeOf, isValidSiteLink, publishedPages, type SiteDocument } from './site';
import { isSampleWeek } from './section-samples';
import { isSampleText, KIND_INFO } from './templates';
import { parseTheme, themeProblems } from './theme';
import { BLOCK_LAYOUTS } from './variants';
import { embedFrom, safeHref, videoEmbed, whatsappHref } from './urls';

/**
 * "Qué le falta a mi sitio": la lista de comprobación que ve quien arma un
 * sitio sin experiencia. Cada ítem dice si está listo y, si no, qué hacer.
 * Los ítems `required` bloquean la publicación (incluido dejar textos de
 * ejemplo sin cambiar: un sitio con "[problema]" en la portada no se publica);
 * el resto son recomendaciones.
 * Es una función pura: la usan el editor (en vivo, mientras escribe) y el
 * servidor (al publicar, para no confiar en lo que diga el navegador).
 */

export interface ReadinessItem {
  id: string;
  label: string;
  /** Qué hacer si no está listo, o una confirmación breve si lo está. */
  hint: string;
  ok: boolean;
  required: boolean;
}

export interface ReadinessReport {
  items: ReadinessItem[];
  /** 0–100: proporción de ítems listos. */
  score: number;
  /** Ítems obligatorios pendientes. */
  blockers: number;
  canPublish: boolean;
}

export interface ReadinessInput {
  kind: WebSiteKind;
  mode: WebSiteMode;
  seoTitle?: string | null;
  seoDescription?: string | null;
  logoUrl?: string | null;
  theme?: unknown;
  /** Sitio completo (varias páginas). */
  document?: SiteDocument | null;
  /** Atajo: sitio de una sola página con estas secciones (formato antiguo, pruebas). */
  blocks?: WebSiteBlock[];
  html?: string | null;
}

function report(items: ReadinessItem[]): ReadinessReport {
  const blockers = items.filter((item) => item.required && !item.ok).length;
  const done = items.filter((item) => item.ok).length;
  return { items, score: items.length ? Math.round((done / items.length) * 100) : 0, blockers, canPublish: blockers === 0 };
}

const item = (id: string, label: string, ok: boolean, required: boolean, hintOk: string, hintTodo: string): ReadinessItem => ({ id, label, ok, required, hint: ok ? hintOk : hintTodo });

interface PlacedBlock {
  block: WebSiteBlock;
  /** Nombre de la página, para decirle al usuario dónde está el problema. */
  page: string;
  multiPage: boolean;
}

const where = (placed: PlacedBlock) => (placed.multiPage ? ` (página «${placed.page}»)` : '');

function linkProblems(doc: SiteDocument, placed: PlacedBlock[]): string[] {
  const bad: string[] = [];
  for (const entry of placed) {
    for (const found of blockLinks(entry.block)) {
      if (!isValidSiteLink(found.href, doc)) bad.push(`${found.label}${where(entry)}: el enlace no funciona`);
      else if (found.text !== null && !found.text.trim()) bad.push(`${found.label}${where(entry)} no tiene texto`);
    }
    if (entry.block.type === 'contact' && entry.block.email && !safeHref(`mailto:${entry.block.email}`)) bad.push(`el correo de contacto ("${entry.block.email}")`);
  }
  for (const found of chromeLinks(doc)) if (!isValidSiteLink(found.href, doc)) bad.push(`${found.label}: el enlace no funciona`);
  if (doc.header.enabled && doc.header.ctaHref.trim() && !doc.header.ctaLabel.trim()) bad.push('el botón del encabezado no tiene texto');
  return bad;
}

function hasContactWay(doc: SiteDocument, placed: PlacedBlock[]): boolean {
  if (doc.whatsapp.enabled && whatsappHref(doc.whatsapp.number)) return true;
  return placed.some(({ block }) => block.type === 'contact' && Boolean(block.showForm || block.email.trim() || block.phone.trim() || whatsappHref(block.whatsapp) || block.address.trim()));
}

export function evaluateReadiness(input: ReadinessInput): ReadinessReport {
  const seoTitle = (input.seoTitle ?? '').trim();
  const seoDescription = (input.seoDescription ?? '').trim();
  const seoItems = [
    item('seo-title', 'Título para buscadores', seoTitle.length >= 10 && seoTitle.length <= 65, false, 'El título se ve completo en Google.', 'Escribe un título de 10 a 65 caracteres: es lo que aparece en la pestaña y en Google.'),
    item('seo-description', 'Descripción para buscadores', seoDescription.length >= 50 && seoDescription.length <= 160, false, 'La descripción tiene un largo ideal.', 'Escribe una descripción de 50 a 160 caracteres que invite a entrar.'),
  ];
  const logo = item('logo', 'Logo', Boolean((input.logoUrl ?? '').trim()), false, 'El logo aparece en la barra superior.', 'Sube el logo: da confianza y se muestra arriba en el sitio.');

  if (input.mode === 'HTML') {
    const html = (input.html ?? '').trim();
    const { removed } = sanitizeHtml(html);
    const bytes = new TextEncoder().encode(html).length;
    const hints = htmlHints(html);
    return report([
      item('html-content', 'Escribiste el contenido', html.length >= 50, true, 'Hay contenido para publicar.', 'Escribe o pega tu HTML: todavía está vacío o es demasiado corto.'),
      item('html-size', 'El tamaño es razonable', bytes <= MAX_HTML_BYTES, true, 'El tamaño está dentro del límite.', `El HTML pesa ${Math.round(bytes / 1000)} KB; el máximo es ${MAX_HTML_BYTES / 1000} KB. Reduce estilos o mueve las imágenes a la biblioteca.`),
      item('html-clean', 'Sin elementos que no funcionan', removed.length === 0, false, 'No hay nada que la plataforma tenga que quitar.', `Se quitarán al publicar: ${removed.join('; ')}.`),
      ...hints.map((hint) => item(`html-${hint.id}`, hint.label, hint.ok, false, 'Listo.', hint.hint)),
      ...seoItems,
      logo,
    ]);
  }

  const doc = input.document ?? documentFromBlocks(input.blocks ?? [], input.theme);
  const pages = publishedPages(doc);
  const multiPage = pages.length > 1;
  const placed: PlacedBlock[] = pages.flatMap((page) => page.blocks.filter((block) => !block.hidden).map((block) => ({ block, page: page.title, multiPage })));
  const visible = placed.map((entry) => entry.block);
  const home = homeOf(doc);
  const hero = home.blocks.find((block) => !block.hidden && block.type === 'hero');
  const info = KIND_INFO[input.kind];

  const missingMustHave = info.mustHave.filter((need) => need.type !== 'hero' && need.type !== 'contact' && !visible.some((block) => block.type === need.type));
  const imagesWithoutAlt = visible.reduce((count, block) => {
    if (block.type === 'image' || block.type === 'split') return count + (block.imageUrl && !block.alt.trim() ? 1 : 0);
    if (block.type === 'hero') return count + block.images.filter((image) => image.url && !image.alt.trim()).length;
    if (block.type === 'beforeafter') return count + block.items.filter((pair) => (pair.beforeUrl || pair.afterUrl) && !pair.alt.trim()).length;
    if (block.type === 'gallery') return count + block.images.filter((image) => image.url && !image.alt.trim()).length;
    if (block.type === 'logos') return count + block.items.filter((logoItem) => logoItem.imageUrl && !logoItem.alt.trim()).length;
    return count;
  }, 0);
  const sampleCount = visible.reduce((count, block) => count + blockTexts(block).filter(isSampleText).length, 0);
  const emptyBlocks = placed.filter(({ block }) => block.type !== 'hero' && isBlockEmpty(block));
  const emptyPages = pages.slice(1).filter((page) => !page.blocks.some((block) => !block.hidden && !isBlockEmpty(block)));
  const links = linkProblems(doc, placed);
  const imageCount = visible.flatMap(blockImageUrls).length;
  const theme = parseTheme(input.theme);
  const themeIssues = themeProblems(theme);
  const badMedia = placed.flatMap((entry) => {
    const { block } = entry;
    if (block.type === 'video' && block.url.trim() && !videoEmbed(block.url)) return [`el video${block.heading ? ` «${block.heading}»` : ''}${where(entry)} no es un enlace de YouTube ni de Vimeo`];
    if (block.type === 'countdown' && block.target.trim() && Number.isNaN(Date.parse(block.target))) return [`la cuenta regresiva${where(entry)} no tiene una fecha válida`];
    if (block.type === 'embed' && block.url.trim() && !embedFrom(block.url)) return [`«${block.heading || 'Incrustar'}»${where(entry)} no es un enlace de Spotify, SoundCloud, Calendly, Google Forms ni Google Calendar`];
    if (block.type === 'beforeafter' && block.items.some((pair) => Boolean(pair.beforeUrl) !== Boolean(pair.afterUrl))) return [`«${block.heading || 'Antes y después'}»${where(entry)} tiene un par con una sola foto: sube las dos`];
    if (block.type === 'hours' && isSampleWeek(block.week)) return [`el horario${where(entry)} sigue siendo el de ejemplo: confírmalo o cámbialo por el tuyo`];
    if (block.type === 'catalog' && !isBlockEmpty(block) && !whatsappHref(block.whatsapp || doc.whatsapp.number)) return [`el catálogo${block.heading ? ` «${block.heading}»` : ''}${where(entry)} necesita un número de WhatsApp (en la sección o en el botón flotante) para que funcione "Pedir por WhatsApp"`];
    return [];
  });
  const whatsappBroken = doc.whatsapp.enabled && !whatsappHref(doc.whatsapp.number);
  // Diseños pensados para fotos que quedaron sin ninguna: se ven pobres (o vacíos) al publicar.
  const photoLayouts = placed.flatMap((entry) => {
    const option = BLOCK_LAYOUTS[entry.block.type].options.find((layout) => layout.value === entry.block.variant);
    if (!option?.photos || isBlockEmpty(entry.block) || blockImageUrls(entry.block).length > 0) return [];
    return [`«${BLOCK_INFO[entry.block.type].label}»${where(entry)} usa el diseño «${option.label}»`];
  });

  return report([
    item('hero', 'Portada con título', Boolean(hero && hero.type === 'hero' && hero.title.trim()), true, 'La portada dice qué ofreces.', `Agrega una ${BLOCK_INFO.hero.label.toLowerCase()} visible en la página de inicio y ponle un título: es lo primero que se ve.`),
    item('contact', 'Una forma de contacto', hasContactWay(doc, placed), true, 'Tus clientes pueden escribirte.', 'Agrega una sección de Contacto con correo, teléfono, WhatsApp o el formulario activado, o activa el botón flotante de WhatsApp.'),
    item('links', 'Los enlaces funcionan', links.length === 0, true, 'Todos los botones, menús y correos son válidos.', `Revisa ${links.join('; ')}. Elige una página del sitio o usa https://…, un correo o un teléfono.`),
    ...info.mustHave
      .filter((need) => need.type !== 'hero' && need.type !== 'contact')
      .map((need) => item(`must-${need.type}-${need.label}`, need.label, !missingMustHave.includes(need), false, 'Incluido.', `${need.why} Agrega una sección "${need.label}".`)),
    item('sample', 'Reemplazaste los textos de ejemplo', sampleCount === 0, true, 'Ya no quedan textos de ejemplo.', `Quedan ${sampleCount} texto(s) de ejemplo tal cual. Cámbialos por los tuyos antes de publicar.`),
    item('empty', 'Sin secciones vacías', emptyBlocks.length === 0, false, 'Todas las secciones tienen contenido.', `Hay ${emptyBlocks.length} sección(es) sin contenido: complétalas o escóndelas.`),
    ...(multiPage || doc.pages.length > 1
      ? [
          item('pages', 'Todas las páginas tienen contenido', emptyPages.length === 0, false, 'Cada página tiene algo que mostrar.', `${emptyPages.map((page) => `«${page.title}»`).join(', ')} no tiene contenido todavía: agrégale secciones u ocúltala.`),
          item('navigation', 'Se puede navegar entre páginas', !multiPage || doc.header.enabled, false, 'El menú lleva a todas las páginas.', 'Tu sitio tiene varias páginas pero el encabezado está apagado: sin menú, nadie llega a las demás. Actívalo en "Encabezado y pie".'),
        ]
      : []),
    item('media', 'Videos, fechas y WhatsApp correctos', badMedia.length === 0 && !whatsappBroken, false, 'Todo en orden.', [...badMedia, ...(whatsappBroken ? ['el número del botón flotante de WhatsApp no es válido'] : [])].join('; ') + '.'),
    item('layout-photos', 'Los diseños con fotos tienen fotos', photoLayouts.length === 0, false, 'Cada diseño tiene las fotos que necesita.', `${photoLayouts.join('; ')}, que luce con fotos: súbelas o elige otro diseño.`),
    item('images', 'Usas imágenes propias', imageCount > 0, false, 'El sitio tiene imágenes.', 'Sube al menos una foto propia; un sitio solo con texto se ve incompleto.'),
    item('alt', 'Las imágenes tienen descripción', imagesWithoutAlt === 0, false, 'Todas las imágenes están descritas.', `${imagesWithoutAlt} imagen(es) sin descripción. La leen los lectores de pantalla y ayuda a que te encuentren.`),
    item('theme', 'Colores legibles', themeIssues.length === 0, false, 'El texto se lee bien sobre el fondo.', themeIssues.join(' ')),
    ...seoItems,
    logo,
  ]);
}
