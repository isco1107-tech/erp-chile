import { galaDateParts } from '@/lib/events/pageant-site';

/**
 * Título y descripción del micrositio para buscadores (lo que Google muestra
 * como texto azul y bajada) y para la vista previa al compartir. Puro: sin
 * I/O ni fecha implícita.
 *
 * Regla del micrositio: un dato que no existe se omite, nunca se inventa. Las
 * palabras que la gente busca ("candidatas", "entradas", "gala", el recinto)
 * entran SOLO si el certamen realmente las tiene publicadas.
 */

export interface PageantSeoInput {
  name: string;
  tagline: string | null;
  description: string | null;
  galaDate: string | null;
  venueName: string | null;
  candidateCount: number;
  hasTickets: boolean;
  registrationOpen: boolean;
}

/** Google corta el título hacia los 60 caracteres y la descripción hacia los 160. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Recorta en el último límite de palabra, con puntos suspensivos. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

/** Primera oración de un texto largo (para no mostrar media frase en la bajada). */
function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(clean(text));
  return match ? match[1] : clean(text);
}

/**
 * "Miss Universo Temuco 2026 | Candidatas, entradas y gala 12 de diciembre".
 * Suma términos de búsqueda en orden de valor mientras quepan en 60
 * caracteres; el nombre solo (sin nada real que sumar) queda tal cual.
 */
export function pageantSeoTitle(input: PageantSeoInput): string {
  const name = clean(input.name);
  const terms: string[] = [];
  if (input.candidateCount > 0) terms.push('Candidatas');
  if (input.hasTickets) terms.push('Entradas');
  if (input.registrationOpen) terms.push('Postulaciones abiertas');
  if (input.galaDate) terms.push(`Gala ${galaDateParts(input.galaDate).short}`);
  const picked: string[] = [];
  for (const term of terms) {
    const candidate = `${name} | ${[...picked, term].join(', ')}`;
    if (candidate.length > SEO_TITLE_MAX) continue;
    picked.push(term);
  }
  return picked.length > 0 ? `${name} | ${picked.join(', ')}` : name;
}

/**
 * Bajada del resultado de búsqueda: la frase del certamen (lema, o la primera
 * oración de su descripción) más el dato duro de la gala (fecha y recinto) si
 * cabe. Sin lema ni descripción, se arma solo con los hechos que existen.
 */
export function pageantSeoDescription(input: PageantSeoInput): string {
  const name = clean(input.name);
  const lead = input.tagline?.trim() ? clean(input.tagline) : input.description?.trim() ? firstSentence(input.description) : null;
  const gala = input.galaDate ? galaDateParts(input.galaDate) : null;
  const venue = input.venueName?.trim() ? clean(input.venueName) : null;
  const galaFact = gala ? `Gala el ${gala.short} de ${gala.year}${venue ? ` en ${venue}` : ''}.` : venue ? `Gala en ${venue}.` : null;

  if (lead) {
    const base = /[.!?…]$/.test(lead) ? lead : `${lead}.`;
    const withFact = galaFact ? `${base} ${galaFact}` : base;
    return withFact.length <= SEO_DESCRIPTION_MAX ? withFact : clip(base, SEO_DESCRIPTION_MAX);
  }

  const offers: string[] = [];
  if (input.candidateCount > 0) offers.push('conoce a las candidatas');
  if (input.hasTickets) offers.push('compra tus entradas');
  if (input.registrationOpen) offers.push('postula al certamen');
  const intro = `Sitio oficial de ${name}${offers.length > 0 ? `: ${offers.join(', ')}` : ''}.`;
  return clip(galaFact ? `${intro} ${galaFact}` : intro, SEO_DESCRIPTION_MAX);
}
