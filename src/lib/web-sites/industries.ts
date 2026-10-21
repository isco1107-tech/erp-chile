import type { WebSiteKind } from '@prisma/client';
import { blockAnchors, blockSchema, newBlockId, type WebSiteBlock } from './blocks';
import { INDUSTRY_TEMPLATES } from './industry-content';
import { actionBarSchema, documentFromBlocks, footerSchema, headerSchema, newPageId, pageLink, pageSchema, whatsappButtonSchema, type FOOTER_LAYOUTS, type HeaderLayout, type HeaderStyle, type SiteDocument, type SitePage } from './site';
import type { StarterDraft } from './templates-content';
import { NEW_SITE_THEME, parseTheme, type SiteAnimation, type SiteButtonStyle, type SiteCardStyle, type SiteFont, type SiteHeadingFont, type SiteHeadingWeight, type SiteRadius, type SiteSpacing, type WebSiteTheme } from './theme';
import { whatsappHref } from './urls';

/**
 * Sitios listos por rubro ("Restaurante", "Clínica", "Gasfíter"…): páginas,
 * secciones en el orden que usan los sitios que mejor funcionan en cada rubro
 * (estudio de mercado de sitios chilenos y de los creadores líderes), paleta,
 * tipografías, encabezado con su botón destacado y consejos de lo que no hay
 * que hacer. Los textos son ejemplos que dicen qué escribir: la lista "qué le
 * falta" los reconoce y no deja publicar hasta cambiarlos.
 *
 * En los textos, `{nombre}` se reemplaza por el nombre del sitio. Los datos de
 * contacto (correo, teléfono, dirección) se precargan desde la ficha de la
 * empresa o del cliente para quien se arma el sitio.
 */

export interface IndustryPageDraft {
  title: string;
  /** Dirección; vacío = sale del nombre. */
  slug?: string;
  showInMenu?: boolean;
  blocks: StarterDraft[];
}

/** Íconos de lucide-react con que el asistente muestra cada rubro. */
export type IndustryIcon =
  | 'UtensilsCrossed'
  | 'Stethoscope'
  | 'Scale'
  | 'Hammer'
  | 'Scissors'
  | 'Dumbbell'
  | 'Building'
  | 'GraduationCap'
  | 'ShoppingBag'
  | 'Camera'
  | 'PartyPopper'
  | 'TreePine'
  | 'Car'
  | 'HeartHandshake'
  | 'Cpu'
  | 'PawPrint';

export interface IndustryTemplate {
  id: string;
  label: string;
  /** Para qué sirve, en una línea. */
  description: string;
  /** Ejemplos concretos para reconocerse ("Pizzería, cafetería, food truck"). */
  examples: string;
  icon: IndustryIcon;
  /** Propósito del sitio (define la guía "qué debe tener"). */
  kind: WebSiteKind;
  /** Lo que el sitio debe lograr ("Que te reserven una mesa"). */
  goal: string;
  colors: Pick<WebSiteTheme, 'primary' | 'accent' | 'background' | 'text'>;
  font: SiteFont;
  headingFont: SiteHeadingFont;
  buttonStyle?: SiteButtonStyle;
  radius?: SiteRadius;
  spacing?: SiteSpacing;
  animation?: SiteAnimation;
  cardStyle?: SiteCardStyle;
  headingWeight?: SiteHeadingWeight;
  /** Diseño del pie (por omisión, en columnas). */
  footerLayout?: (typeof FOOTER_LAYOUTS)[number];
  header: {
    layout?: HeaderLayout;
    style?: HeaderStyle;
    /** Texto del botón destacado ("Reservar mesa"). */
    ctaLabel: string;
    /** A dónde lleva: la sección de contacto del sitio o WhatsApp (si hay número). */
    ctaTarget: 'contact' | 'whatsapp';
    /** Barra de anuncio (≤60 caracteres); vacío = sin anuncio. */
    announcement?: string;
    tagline?: string;
  };
  /** Descripción breve del pie. */
  footerAbout: string;
  /** Activa el botón flotante de WhatsApp si hay un teléfono. */
  whatsappButton: boolean;
  /** Activa la barra Llamar · WhatsApp · Cómo llegar en celular (rubros de urgencia o de visita). */
  actionBar: boolean;
  /** Mensaje con que se abre WhatsApp. */
  whatsappMessage: string;
  /** Primera = inicio. */
  pages: IndustryPageDraft[];
  /** Errores comunes del rubro, para advertir en el asistente y en el editor. */
  tips: string[];
}

export { INDUSTRY_TEMPLATES };

export function findIndustry(id: string | null | undefined): IndustryTemplate | null {
  return INDUSTRY_TEMPLATES.find((industry) => industry.id === id) ?? null;
}

export interface IndustryContext {
  name: string;
  /** Datos de la ficha de la empresa (o del cliente): se precargan en Contacto. */
  contact?: { email?: string | null; phone?: string | null; address?: string | null };
}

/** Secciones de un borrador, con ids nuevos. */
function templateBlocks(drafts: StarterDraft[]): WebSiteBlock[] {
  return drafts.map((draft) => blockSchema.parse({ ...draft, id: newBlockId() }));
}

/** Reemplaza `{nombre}` en todos los textos de un borrador. */
function withName<T>(value: T, name: string): T {
  if (typeof value === 'string') return value.replaceAll('{nombre}', name) as T;
  if (Array.isArray(value)) return value.map((item) => withName(item, name)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withName(item, name)])) as T;
  return value;
}

/** Enlace a la primera sección de contacto del sitio (`page:<id>#ancla`), o `null`. */
function contactLink(pages: SitePage[]): string | null {
  for (const page of pages) {
    const contact = page.blocks.find((block) => block.type === 'contact' && !block.hidden);
    if (contact) return pageLink(page.id, blockAnchors(page.blocks.filter((block) => !block.hidden)).get(contact.id) ?? null);
  }
  return null;
}

/** Botones que la plantilla dejó sin enlace → al contacto (o WhatsApp). */
function fillEmptyButtons(block: WebSiteBlock, fallback: string | null): WebSiteBlock {
  if (!fallback) return block;
  switch (block.type) {
    case 'hero':
      return { ...block, ctaHref: block.ctaLabel && !block.ctaHref ? fallback : block.ctaHref };
    case 'cta':
      return { ...block, buttonHref: block.buttonLabel && !block.buttonHref ? fallback : block.buttonHref };
    case 'split':
      return { ...block, buttonHref: block.buttonLabel && !block.buttonHref ? fallback : block.buttonHref };
    case 'countdown':
      return { ...block, buttonHref: block.buttonLabel && !block.buttonHref ? fallback : block.buttonHref };
    case 'pricing':
      return { ...block, items: block.items.map((item) => ({ ...item, buttonHref: item.buttonLabel && !item.buttonHref ? fallback : item.buttonHref })) };
    default:
      return block;
  }
}

/**
 * Sitio completo de un rubro: documento (páginas, encabezado, pie, WhatsApp,
 * barra de acciones) y tema. Puro: lo usa el servidor al crear el sitio.
 */
export function industryDocument(industry: IndustryTemplate, ctx: IndustryContext): { document: SiteDocument; theme: WebSiteTheme } {
  const name = ctx.name.trim().slice(0, 80) || 'Mi negocio';
  const phone = ctx.contact?.phone?.trim() ?? '';
  const email = ctx.contact?.email?.trim() ?? '';
  const address = ctx.contact?.address?.trim() ?? '';
  const whatsapp = whatsappHref(phone) ? phone : '';

  const used = new Set<string>();
  const pages: SitePage[] = industry.pages.map((draft, index) => {
    const blocks = templateBlocks(withName(draft.blocks, name)).map((block) =>
      block.type === 'contact'
        ? { ...block, email: block.email || email, phone: block.phone || phone, whatsapp: block.whatsapp || whatsapp, address: block.address || address }
        : block
    );
    let slug = index === 0 ? '' : draft.slug || '';
    if (index > 0) {
      const base = slug || draft.title;
      slug = base
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      while (used.has(slug)) slug = `${slug}-2`;
      used.add(slug);
    }
    return pageSchema.parse({ id: newPageId(), title: draft.title, slug, showInMenu: draft.showInMenu ?? true, blocks });
  });

  const toContact = contactLink(pages);
  const toWhatsapp = whatsappHref(whatsapp, industry.whatsappMessage);
  const primaryLink = industry.header.ctaTarget === 'whatsapp' ? (toWhatsapp ?? toContact) : (toContact ?? toWhatsapp);
  const filled = pages.map((page) => ({ ...page, blocks: page.blocks.map((block) => fillEmptyButtons(block, primaryLink)) }));

  const base = documentFromBlocks([], NEW_SITE_THEME);
  const document: SiteDocument = {
    ...base,
    pages: filled,
    header: headerSchema.parse({
      layout: industry.header.layout ?? 'classic',
      style: industry.header.style ?? 'light',
      tagline: industry.header.tagline ? withName(industry.header.tagline, name) : '',
      ctaLabel: primaryLink ? industry.header.ctaLabel : '',
      ctaHref: primaryLink ?? '',
      announcement: { enabled: Boolean(industry.header.announcement), text: industry.header.announcement ?? '' },
    }),
    footer: footerSchema.parse({ layout: industry.footerLayout ?? 'columns', about: withName(industry.footerAbout, name) }),
    whatsapp: whatsappButtonSchema.parse({ enabled: industry.whatsappButton && Boolean(whatsapp), number: whatsapp, message: industry.whatsappMessage }),
    actionBar: actionBarSchema.parse({ enabled: industry.actionBar && Boolean(phone), phone, address }),
  };

  const theme = parseTheme({
    ...NEW_SITE_THEME,
    ...industry.colors,
    font: industry.font,
    headingFont: industry.headingFont,
    buttonStyle: industry.buttonStyle ?? NEW_SITE_THEME.buttonStyle,
    radius: industry.radius ?? NEW_SITE_THEME.radius,
    spacing: industry.spacing ?? NEW_SITE_THEME.spacing,
    animation: industry.animation ?? NEW_SITE_THEME.animation,
    cardStyle: industry.cardStyle ?? NEW_SITE_THEME.cardStyle,
    headingWeight: industry.headingWeight ?? NEW_SITE_THEME.headingWeight,
  });
  return { document, theme };
}

/** Todos los borradores de los rubros (para reconocer textos de ejemplo). */
export function industryDrafts(): StarterDraft[] {
  return INDUSTRY_TEMPLATES.flatMap((industry) => industry.pages.flatMap((page) => page.blocks));
}
