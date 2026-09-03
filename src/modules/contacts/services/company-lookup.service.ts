import 'server-only';

import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { regions } from '@/lib/chile/locations';

/**
 * Busca datos públicos de una empresa chilena directo en DuckDuckGo (endpoint
 * HTML, sin API key ni cuota) y extrae el RUT con una expresión regular en
 * vez de pedirle a un LLM que lo "recuerde" — evita depender de una cuota de
 * IA (Gemini se quedó sin cuota) para algo que es, en el fondo, una búsqueda
 * de texto. Solo se acepta un RUT si pasa `validateRut` (Módulo 11): si el
 * texto encontrado trae un RUT mal tipeado o de otra entidad, se descarta en
 * vez de devolverlo como si fuera válido.
 */

const DDG_URL = 'https://html.duckduckgo.com/html/';
const USER_AGENT = 'Mozilla/5.0 (compatible; ERP-ContactLookup/1.0)';

const RUT_RE = /\b(\d{1,2}(?:\.\d{3}){2}-[\dkK]|\d{7,8}-[\dkK])\b/;

const ENTITY_MAP: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z#0-9]+);/g, (match, name) => ENTITY_MAP[name] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() + '…' : text;
}

interface RawResult {
  title: string;
  snippet: string;
  url: string;
}

async function searchDuckDuckGo(query: string): Promise<RawResult[]> {
  const res = await fetch(`${DDG_URL}?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`No se pudo buscar en la web (respondió ${res.status})`);
  const html = await res.text();

  const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const urls = [...html.matchAll(/class="result__url"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));

  const count = titles.length;
  const results: RawResult[] = [];
  for (let i = 0; i < count; i++) {
    if (!titles[i]) continue;
    results.push({ title: titles[i], snippet: snippets[i] ?? '', url: urls[i] ?? '' });
  }
  return results;
}

/** Corta el título en el punto donde empieza a mencionar el RUT (ej. "EMPRESA S A con RUT 12345-6" → "EMPRESA S A"), que es como suelen venir los resultados de directorios de RUT chilenos. */
function guessName(title: string): string {
  const cut = title.split(/\s+(?:con\s+)?rut\b/i)[0]?.trim();
  return cut || title;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Heurística simple: si alguna comuna conocida aparece mencionada en el texto del resultado, se infiere su región. No hay dirección estructurada disponible sin un LLM, así que esto es lo único que se completa automáticamente. */
function matchLocationInText(text: string): { region: string; comuna: string } | null {
  const normalizedText = normalize(text);
  for (const region of regions) {
    for (const comuna of region.comunas) {
      const needle = normalize(comuna);
      if (needle.length > 3 && new RegExp(`\\b${needle}\\b`).test(normalizedText)) {
        return { region: region.name, comuna };
      }
    }
  }
  return null;
}

export interface CompanyLookupCandidate {
  razonSocial: string;
  rut: string;
  rutVerified: boolean;
  nombreFantasia: string;
  giro: string;
  address: string;
  region: string;
  comuna: string;
  sourceNote: string;
}

function buildCandidate(result: RawResult): CompanyLookupCandidate {
  const location = matchLocationInText(`${result.title} ${result.snippet}`);
  const domain = result.url.split('/')[0]?.trim() ?? '';
  const rutMatch = `${result.title} ${result.snippet}`.match(RUT_RE);
  const cleanedRut = rutMatch ? cleanRut(rutMatch[1]) : '';
  const rutIsValid = cleanedRut.length > 1 && validateRut(cleanedRut);

  return {
    razonSocial: guessName(result.title),
    rut: rutIsValid ? formatRut(cleanedRut) : '',
    rutVerified: rutIsValid,
    nombreFantasia: '',
    giro: '',
    address: '',
    region: location?.region ?? '',
    comuna: location?.comuna ?? '',
    sourceNote: `${domain ? domain + ' — ' : ''}${truncate(result.snippet, 160)}`,
  };
}

export async function lookupCompaniesByName(query: string): Promise<CompanyLookupCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) throw new Error('Ingresa al menos 2 caracteres para buscar');

  const results = await searchDuckDuckGo(`${trimmed} RUT Chile`);
  if (results.length === 0) return [];

  const seenRuts = new Set<string>();
  const withRut: CompanyLookupCandidate[] = [];
  const withoutRut: CompanyLookupCandidate[] = [];

  for (const result of results) {
    const candidate = buildCandidate(result);
    if (candidate.rutVerified) {
      const key = cleanRut(candidate.rut);
      if (seenRuts.has(key)) continue;
      seenRuts.add(key);
      withRut.push(candidate);
    } else if (withoutRut.length < 3) {
      withoutRut.push(candidate);
    }
    if (withRut.length >= 3) break;
  }

  return (withRut.length > 0 ? withRut : withoutRut).slice(0, 3);
}
