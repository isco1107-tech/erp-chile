import type { WebSiteKind, WebSiteMode } from '@prisma/client';
import { blockImageUrls, blockTexts, type WebSiteBlock } from './blocks';
import { htmlHints, MAX_HTML_BYTES, sanitizeHtml } from './html';
import { isSampleText, KIND_INFO } from './templates';
import { parseTheme, themeProblems } from './theme';
import { safeHref, whatsappHref } from './urls';

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
  blocks: WebSiteBlock[];
  html?: string | null;
}

function report(items: ReadinessItem[]): ReadinessReport {
  const blockers = items.filter((item) => item.required && !item.ok).length;
  const done = items.filter((item) => item.ok).length;
  return { items, score: items.length ? Math.round((done / items.length) * 100) : 0, blockers, canPublish: blockers === 0 };
}

const item = (id: string, label: string, ok: boolean, required: boolean, hintOk: string, hintTodo: string): ReadinessItem => ({ id, label, ok, required, hint: ok ? hintOk : hintTodo });

function linkProblems(blocks: WebSiteBlock[]): string[] {
  const bad: string[] = [];
  for (const block of blocks) {
    if (block.type === 'hero' && block.ctaHref && !safeHref(block.ctaHref)) bad.push(`el botón de la portada ("${block.ctaHref}")`);
    if (block.type === 'cta' && block.buttonHref && !safeHref(block.buttonHref)) bad.push(`el botón "${block.buttonLabel || 'llamado a la acción'}" ("${block.buttonHref}")`);
    if (block.type === 'hero' && block.ctaHref && !block.ctaLabel) bad.push('el botón de la portada no tiene texto');
    if (block.type === 'cta' && block.buttonHref && !block.buttonLabel) bad.push('un botón no tiene texto');
    if (block.type === 'contact' && block.email && !safeHref(`mailto:${block.email}`)) bad.push(`el correo de contacto ("${block.email}")`);
  }
  return bad;
}

function hasContactWay(blocks: WebSiteBlock[]): boolean {
  return blocks.some((block) => {
    if (block.hidden) return false;
    if (block.type === 'contact') return Boolean(block.showForm || block.email.trim() || block.phone.trim() || whatsappHref(block.whatsapp) || block.address.trim());
    return false;
  });
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

  const blocks = input.blocks;
  const visible = blocks.filter((block) => !block.hidden);
  const hero = visible.find((block) => block.type === 'hero');
  const info = KIND_INFO[input.kind];

  const missingMustHave = info.mustHave.filter((need) => need.type !== 'hero' && need.type !== 'contact' && !visible.some((block) => block.type === need.type));
  const imagesWithoutAlt = visible.reduce((count, block) => {
    if (block.type === 'image') return count + (block.imageUrl && !block.alt.trim() ? 1 : 0);
    if (block.type === 'gallery') return count + block.images.filter((image) => image.url && !image.alt.trim()).length;
    return count;
  }, 0);
  const sampleCount = visible.reduce((count, block) => count + blockTexts(block).filter(isSampleText).length, 0);
  const emptyBlocks = visible.filter((block) => {
    if (block.type === 'image') return !block.imageUrl;
    if (block.type === 'gallery') return block.images.every((image) => !image.url);
    if (block.type === 'features') return block.items.every((entry) => !entry.title && !entry.text);
    if (block.type === 'faq') return block.items.every((entry) => !entry.question);
    if (block.type === 'testimonials') return block.items.every((entry) => !entry.quote);
    if (block.type === 'text') return !block.body;
    return false;
  });
  const links = linkProblems(visible);
  const imageCount = visible.flatMap(blockImageUrls).length;
  const theme = parseTheme(input.theme);
  const themeIssues = themeProblems(theme);

  return report([
    item('hero', 'Portada con título', Boolean(hero && hero.type === 'hero' && hero.title.trim()), true, 'La portada dice qué ofreces.', 'Agrega una portada visible y ponle un título: es lo primero que se ve.'),
    item('contact', 'Una forma de contacto', hasContactWay(blocks), true, 'Tus clientes pueden escribirte.', 'Agrega una sección de Contacto con correo, teléfono, WhatsApp o el formulario activado.'),
    item('links', 'Los enlaces funcionan', links.length === 0, true, 'Todos los botones y correos son válidos.', `Revisa ${links.join('; ')}. Usa https://…, un correo, un teléfono o #contacto.`),
    ...info.mustHave
      .filter((need) => need.type !== 'hero' && need.type !== 'contact')
      .map((need) => item(`must-${need.type}-${need.label}`, need.label, !missingMustHave.includes(need), false, 'Incluido.', `${need.why} Agrega una sección "${need.label}".`)),
    item('sample', 'Reemplazaste los textos de ejemplo', sampleCount === 0, true, 'Ya no quedan textos de ejemplo.', `Quedan ${sampleCount} texto(s) de ejemplo tal cual. Cámbialos por los tuyos antes de publicar.`),
    item('empty', 'Sin secciones vacías', emptyBlocks.length === 0, false, 'Todas las secciones tienen contenido.', `Hay ${emptyBlocks.length} sección(es) sin contenido: complétalas o escóndelas.`),
    item('images', 'Usas imágenes propias', imageCount > 0, false, 'El sitio tiene imágenes.', 'Sube al menos una foto propia; un sitio solo con texto se ve incompleto.'),
    item('alt', 'Las imágenes tienen descripción', imagesWithoutAlt === 0, false, 'Todas las imágenes están descritas.', `${imagesWithoutAlt} imagen(es) sin descripción. La leen los lectores de pantalla y ayuda a que te encuentren.`),
    item('theme', 'Colores legibles', themeIssues.length === 0, false, 'El texto se lee bien sobre el fondo.', themeIssues.join(' ')),
    ...seoItems,
    logo,
  ]);
}
