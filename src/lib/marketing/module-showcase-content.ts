import { MANUAL_SECTIONS, sectionScreenshot, type ManualSection } from '@/modules/manual/content';
import { SHOWCASE_MODULES, findShowcaseModule, type ShowcaseCategory, type ShowcaseModule } from './module-showcase';

/**
 * Datos planos de la vitrina para los componentes (de servidor y de cliente):
 * une cada módulo con sus secciones del manual. Sin precios: la landing no los
 * publica.
 */

export interface ShowcaseCard {
  slug: string;
  /** Id cotizable; `null` = incluido en la plataforma base. */
  quoteId: string | null;
  title: string;
  category: ShowcaseCategory;
  summary: string;
  /** Captura real de la pantalla (`/manual/screenshots/...`), o `null` si no hay. */
  cover: string | null;
}

export interface ShowcaseScreen {
  id: string;
  title: string;
  summary: string;
  screenshot: string | null;
  topics: { id: string; title: string; steps: string[]; tip?: string }[];
}

export interface ShowcaseDetail {
  card: ShowcaseCard;
  screens: ShowcaseScreen[];
}

const SECTIONS_BY_ID = new Map(MANUAL_SECTIONS.map((section) => [section.id, section]));

function sectionsOf(item: ShowcaseModule): ManualSection[] {
  return item.sections.map((id) => SECTIONS_BY_ID.get(id)).filter((section): section is ManualSection => section !== undefined);
}

function toCard(item: ShowcaseModule): ShowcaseCard {
  const cover = item.cover ?? sectionsOf(item).map(sectionScreenshot).find((shot): shot is string => shot !== null) ?? null;
  return { slug: item.slug, quoteId: item.pricedId, title: item.title, category: item.category, summary: item.summary, cover };
}

export function getShowcaseCards(): ShowcaseCard[] {
  return SHOWCASE_MODULES.map(toCard);
}

export function getShowcaseDetail(slug: string): ShowcaseDetail | null {
  const item = findShowcaseModule(slug);
  if (!item) return null;
  return {
    card: toCard(item),
    screens: sectionsOf(item).map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      screenshot: sectionScreenshot(section),
      topics: section.topics.map(({ id, title, steps, tip }) => ({ id, title, steps, ...(tip ? { tip } : {}) })),
    })),
  };
}
