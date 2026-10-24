import type { ManualSection } from './types';

/**
 * Búsqueda del manual, sin datos propios: la usan la pantalla del manual (en
 * el navegador), el asistente y el conector MCP sobre las secciones que ya
 * filtró cada uno.
 */

/** Minúsculas y sin tildes: "liquidacion" encuentra "liquidación". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Filtra el manual por un texto libre. Cada palabra debe aparecer en el
 * título de la sección, del tema, en su resumen o en algún paso: "anular
 * boleta" encuentra "Anular una boleta hecha por error" aunque las palabras
 * no estén juntas. Lo que coincide en un título va primero (quien busca
 * "liquidación" quiere el tema que se llama así, no uno que la menciona de
 * pasada); a igual relevancia se conserva el orden del manual.
 */
export function searchManual(sections: readonly ManualSection[], query: string): ManualSection[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  const inTitle = (title: string) => {
    const text = normalizeSearch(title);
    return words.every((word) => text.includes(word));
  };
  return sections
    .map((section, order) => {
      const sectionText = normalizeSearch(`${section.title} ${section.summary}`);
      const topics = section.topics.filter((topic) => {
        const haystack = `${sectionText} ${normalizeSearch([topic.title, ...topic.steps, topic.tip ?? ''].join(' '))}`;
        return words.every((word) => haystack.includes(word));
      });
      const score = (inTitle(section.title) ? 2 : 0) + (topics.some((topic) => inTitle(topic.title)) ? 1 : 0);
      return { section: { ...section, topics }, score, order };
    })
    .filter((entry) => entry.section.topics.length > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.section);
}
