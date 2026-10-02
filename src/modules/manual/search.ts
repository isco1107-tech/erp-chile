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
 * no estén juntas.
 */
export function searchManual(sections: readonly ManualSection[], query: string): ManualSection[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((section) => {
      const sectionText = normalizeSearch(`${section.title} ${section.summary}`);
      const topics = section.topics.filter((topic) => {
        const haystack = `${sectionText} ${normalizeSearch([topic.title, ...topic.steps, topic.tip ?? ''].join(' '))}`;
        return words.every((word) => haystack.includes(word));
      });
      return { ...section, topics };
    })
    .filter((section) => section.topics.length > 0);
}
