import type { WebSiteKind } from '@prisma/client';
import { blockSchema, blockTexts, newBlockId, type BlockType, type WebSiteBlock } from './blocks';
import { industryDrafts } from './industries';
import { PAGE_TEMPLATES } from './page-templates';
import { documentFromBlocks, newPageId, type SiteDocument } from './site';
import { NEW_SITE_THEME } from './theme';
import { STARTER_CONTENT, type StarterDraft, type StarterKind } from './templates-content';

/**
 * Tipos de sitio: para qué sirve cada uno, qué secciones no pueden faltar y el
 * armado inicial. La lista "qué debe tener" es la parte didáctica del módulo:
 * quien nunca hizo un sitio sabe qué le falta sin preguntarle a nadie.
 */

export const WEB_SITE_KINDS = ['LANDING', 'CORPORATE', 'PORTFOLIO', 'CATALOG', 'EVENT', 'PERSONAL', 'BLANK'] as const satisfies readonly WebSiteKind[];

export interface MustHave {
  type: BlockType;
  /** Cómo se le dice al usuario ("Galería de trabajos"). */
  label: string;
  /** Por qué importa, en una línea. */
  why: string;
}

export interface KindInfo {
  label: string;
  description: string;
  /** Ejemplo concreto de uso, para reconocerse. */
  examples: string;
  /** Secciones que este tipo de sitio necesita para cumplir su propósito. */
  mustHave: MustHave[];
}

const CONTACT: MustHave = { type: 'contact', label: 'Contacto', why: 'Sin una forma de escribirte, nadie te contrata.' };
const HERO: MustHave = { type: 'hero', label: 'Portada', why: 'Lo primero que se ve: debe decir qué ofreces.' };

export const KIND_INFO: Record<WebSiteKind, KindInfo> = {
  LANDING: {
    label: 'Página de captación',
    description: 'Una sola página para vender algo o conseguir contactos.',
    examples: 'Lanzar un servicio, una promoción, un curso o una campaña.',
    mustHave: [HERO, { type: 'features', label: 'Beneficios', why: 'Explica por qué elegirte en tres o cuatro ideas.' }, { type: 'cta', label: 'Llamado a la acción', why: 'Una invitación clara al siguiente paso.' }, CONTACT],
  },
  CORPORATE: {
    label: 'Sitio de empresa',
    description: 'Presenta quién eres, qué haces y cómo contactarte.',
    examples: 'Pyme de servicios, estudio, taller, consultora.',
    mustHave: [HERO, { type: 'text', label: 'Quiénes somos', why: 'La gente contrata a quien entiende y en quien confía.' }, { type: 'features', label: 'Servicios', why: 'Lo que vendes, en tarjetas fáciles de recorrer.' }, CONTACT],
  },
  PORTFOLIO: {
    label: 'Portafolio',
    description: 'Muestra trabajos terminados para conseguir nuevos clientes.',
    examples: 'Fotografía, diseño, arquitectura, construcción, maquillaje.',
    mustHave: [HERO, { type: 'gallery', label: 'Galería de trabajos', why: 'Los trabajos hablan más que la descripción.' }, { type: 'text', label: 'Sobre mí o nosotros', why: 'Pone cara y trayectoria detrás de los trabajos.' }, CONTACT],
  },
  CATALOG: {
    label: 'Catálogo',
    description: 'Vitrina de productos para cotizar por WhatsApp o correo, sin tienda online.',
    examples: 'Ferretería, repostería, ropa, insumos, artesanía.',
    mustHave: [HERO, { type: 'gallery', label: 'Galería de productos', why: 'Es la vitrina: fotos claras y parejas.' }, { type: 'faq', label: 'Preguntas frecuentes', why: 'Despacho, formas de pago y plazos ahorran mensajes.' }, CONTACT],
  },
  EVENT: {
    label: 'Evento',
    description: 'Información de un evento puntual: cuándo, dónde, programa y contacto.',
    examples: 'Feria, gala, seminario, matrimonio, campeonato.',
    mustHave: [HERO, { type: 'text', label: 'Sobre el evento', why: 'Qué es, para quién y cuándo (fecha, hora y lugar).' }, { type: 'features', label: 'Programa', why: 'Qué va a pasar y a qué hora.' }, CONTACT],
  },
  PERSONAL: {
    label: 'Profesional independiente',
    description: 'Tu presentación profesional en una página.',
    examples: 'Psicólogo, abogado, contador, coach, instructor.',
    mustHave: [HERO, { type: 'text', label: 'Sobre mí', why: 'Formación, experiencia y forma de trabajar.' }, { type: 'features', label: 'Atención o servicios', why: 'Qué haces y cómo se agenda.' }, CONTACT],
  },
  BLANK: {
    label: 'En blanco',
    description: 'Parte de cero y agrega las secciones que quieras.',
    examples: 'Cualquier cosa que no calce con las otras opciones.',
    mustHave: [HERO, CONTACT],
  },
};

/** Armado inicial de un sitio nuevo. `name` reemplaza el título de la portada. */
export function starterBlocks(kind: WebSiteKind, ctx: { name: string }): WebSiteBlock[] {
  if (kind === 'BLANK') {
    return [blockSchema.parse({ id: newBlockId(), type: 'hero', title: ctx.name.slice(0, 120) }), blockSchema.parse({ id: newBlockId(), type: 'contact', heading: 'Contacto' })];
  }
  const drafts = STARTER_CONTENT[kind as StarterKind];
  return drafts.map((draft, index) => {
    const withName = index === 0 && draft.type === 'hero' ? { ...draft, title: ctx.name.slice(0, 120) } : draft;
    return blockSchema.parse({ ...withName, id: newBlockId() });
  });
}

/**
 * Sitio nuevo en modo guiado: la página de inicio con el armado del tipo
 * elegido, encabezado con menú automático y pie con columnas.
 */
export function starterDocument(kind: WebSiteKind, ctx: { name: string }): SiteDocument {
  const doc = documentFromBlocks(starterBlocks(kind, ctx), NEW_SITE_THEME);
  return {
    ...doc,
    pages: doc.pages.map((page) => ({ ...page, id: newPageId() })),
    footer: { ...doc.footer, layout: 'columns' },
  };
}

/** Secciones de una plantilla de página, con ids nuevos. */
export function templateBlocks(drafts: StarterDraft[]): WebSiteBlock[] {
  return drafts.map((draft) => blockSchema.parse({ ...draft, id: newBlockId() }));
}

let sampleTexts: Set<string> | null = null;

/** Todos los textos de ejemplo (menos el título de portada, que sale del nombre del sitio). */
function samples(): Set<string> {
  if (sampleTexts) return sampleTexts;
  const set = new Set<string>();
  const drafts = [...Object.values(STARTER_CONTENT).flat(), ...PAGE_TEMPLATES.flatMap((template) => template.blocks), ...industryDrafts()];
  drafts.forEach((draft) => {
    const block = blockSchema.parse({ ...draft, id: 'sample' });
    blockTexts(block).forEach((text) => set.add(text.trim()));
  });
  sampleTexts = set;
  return set;
}

/**
 * ¿Este texto es tal cual el de ejemplo de una plantilla? Sirve para avisar
 * "cambia el texto de ejemplo" antes de publicar. Los encabezados de sección
 * ("Contacto", "Servicios") son nombres, no ejemplos, y no cuentan.
 */
export function isSampleText(text: string): boolean {
  const value = text.trim();
  return value.length > 24 && samples().has(value);
}

/**
 * Punto de partida del modo HTML: una página completa y responsiva, con los
 * comentarios justos para que alguien sin experiencia sepa qué cambiar. No usa
 * scripts ni formularios (no funcionarían), y el contacto es por enlace.
 */
export function starterHtml(name: string): string {
  const safe = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!-- Cambia los textos y los colores. Puedes usar HTML y CSS; no se ejecuta JavaScript. -->
<style>
  :root { --color: #12161f; --acento: #a98530; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: var(--color); line-height: 1.6; }
  header { background: var(--color); color: #fff; padding: 72px 24px; text-align: center; }
  header h1 { margin: 0 0 12px; font-size: clamp(2rem, 6vw, 3.25rem); }
  a.boton { display: inline-block; margin-top: 20px; padding: 14px 28px; background: var(--acento); color: #111; border-radius: 8px; font-weight: 700; text-decoration: none; }
  main { max-width: 860px; margin: 0 auto; padding: 48px 24px; }
  h2 { border-left: 4px solid var(--acento); padding-left: 12px; }
</style>

<header>
  <h1>${safe}</h1>
  <p>Escribe aquí en una frase qué haces y para quién.</p>
  <!-- Para WhatsApp usa el número con código de país, sin + ni espacios -->
  <a class="boton" href="https://wa.me/56912345678">Escríbenos por WhatsApp</a>
</header>

<main>
  <h2>Quiénes somos</h2>
  <p>Cuenta tu historia en pocas líneas.</p>

  <h2>Qué hacemos</h2>
  <p>Lista tus servicios o productos.</p>

  <h2>Contacto</h2>
  <p>Correo: <a href="mailto:hola@tudominio.cl">hola@tudominio.cl</a></p>
</main>`;
}
