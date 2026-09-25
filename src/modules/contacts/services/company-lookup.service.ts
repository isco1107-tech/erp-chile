import 'server-only';

import { cleanRut } from '@/lib/chile/rut';
import { captureException, captureMessage } from '@/lib/observability';
import { generateGroundedText } from '@/modules/agents/services/gemini-agent';

import {
  MAX_CANDIDATES,
  findRutInText,
  matchLocationInText,
  parseAiCandidates,
  truncate,
  type CompanyLookupCandidate,
} from './company-lookup-parse';

export type { CompanyLookupCandidate } from './company-lookup-parse';

/**
 * Buscador de datos públicos de una empresa chilena para precargar el
 * formulario de contacto. Nunca crea nada: el usuario revisa y confirma.
 *
 * 1. Gemini con Google Search (si hay `GEMINI_API_KEY`): trae razón social,
 *    RUT, giro y dirección desde fuentes públicas.
 * 2. Respaldo: DuckDuckGo HTML con el RUT extraído por expresión regular.
 *    DuckDuckGo suele bloquear IPs de servidores (Vercel) con una página
 *    anti-bots; eso se detecta y se reporta en vez de fingir "sin resultados",
 *    que es lo que hacía antes y por qué el buscador parecía no funcionar.
 *
 * Un RUT solo se precarga si pasa Módulo 11 (`rutVerified`); aun así puede
 * ser de otra entidad, por eso el formulario pide revisarlo.
 */

const DDG_URL = 'https://html.duckduckgo.com/html/';
const USER_AGENT = 'Mozilla/5.0 (compatible; ERP-ContactLookup/1.0)';
const DDG_TIMEOUT_MS = 10_000;

const AI_SYSTEM_PROMPT = [
  'Eres un asistente que busca en internet datos públicos de empresas chilenas para precargar un formulario de contacto de un ERP.',
  'Usa la búsqueda de Google. Prioriza fuentes confiables: sitio oficial de la empresa, SII, Diario Oficial, registros de empresas y directorios de RUT chilenos.',
  'Nunca inventes un RUT, dirección ni giro: si no lo encontraste en una fuente, déjalo como cadena vacía.',
  'Responde SOLO con un arreglo JSON (sin texto adicional) de hasta 3 empresas que calcen con la búsqueda, cada una con las claves:',
  '"razonSocial" (razón social legal completa, ej. "COMERCIAL EJEMPLO SpA"), "rut" (formato 12.345.678-9), "nombreFantasia", "giro" (actividad económica),',
  '"direccion" (calle y número), "comuna" (solo el nombre de la comuna) y "fuente" (sitio donde lo encontraste).',
  'Si no encuentras ninguna empresa, responde [].',
].join('\n');

class LookupUnavailableError extends Error {}

async function searchWithAi(query: string): Promise<CompanyLookupCandidate[]> {
  const { text, sources } = await generateGroundedText(AI_SYSTEM_PROMPT, `Empresa a buscar: ${query}`);
  return parseAiCandidates(text, sources);
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'",
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-zA-Z#0-9]+);/g, (match, name) => entities[name] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

interface RawResult {
  title: string;
  snippet: string;
  url: string;
}

async function searchDuckDuckGo(query: string): Promise<RawResult[]> {
  const res = await fetch(`${DDG_URL}?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(DDG_TIMEOUT_MS),
  });
  const html = await res.text();
  // Página anti-bots: responde 202 (o 200) con un desafío en vez de resultados.
  if (!res.ok || res.status === 202 || /anomaly|challenge-form|bots use DuckDuckGo/i.test(html)) {
    throw new LookupUnavailableError(`DuckDuckGo bloqueó la búsqueda (HTTP ${res.status})`);
  }

  const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1] ?? ''));
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1] ?? ''));
  const urls = [...html.matchAll(/class="result__url"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1] ?? ''));

  const results: RawResult[] = [];
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    results.push({ title: titles[i]!, snippet: snippets[i] ?? '', url: urls[i] ?? '' });
  }
  return results;
}

/** Corta el título donde empieza a mencionar el RUT ("EMPRESA S A con RUT 12345-6" → "EMPRESA S A"). */
function guessName(title: string): string {
  const cut = title.split(/\s+(?:con\s+)?rut\b/i)[0]?.trim();
  return cut || title;
}

function buildWebCandidate(result: RawResult): CompanyLookupCandidate {
  const text = `${result.title} ${result.snippet}`;
  const location = matchLocationInText(text);
  const domain = result.url.split('/')[0]?.trim() ?? '';
  const rut = findRutInText(text);
  return {
    razonSocial: guessName(result.title),
    rut,
    rutVerified: rut !== '',
    nombreFantasia: '',
    giro: '',
    address: '',
    region: location?.region ?? '',
    comuna: location?.comuna ?? '',
    sourceNote: `${domain ? domain + ' — ' : ''}${truncate(result.snippet, 160)}`,
  };
}

async function searchWeb(query: string): Promise<CompanyLookupCandidate[]> {
  const results = await searchDuckDuckGo(`${query} RUT Chile`);
  const seenRuts = new Set<string>();
  const withRut: CompanyLookupCandidate[] = [];
  const withoutRut: CompanyLookupCandidate[] = [];

  for (const result of results) {
    const candidate = buildWebCandidate(result);
    if (candidate.rutVerified) {
      const key = cleanRut(candidate.rut);
      if (seenRuts.has(key)) continue;
      seenRuts.add(key);
      withRut.push(candidate);
    } else if (withoutRut.length < MAX_CANDIDATES) {
      withoutRut.push(candidate);
    }
    if (withRut.length >= MAX_CANDIDATES) break;
  }

  return (withRut.length > 0 ? withRut : withoutRut).slice(0, MAX_CANDIDATES);
}

export async function lookupCompaniesByName(query: string): Promise<CompanyLookupCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) throw new Error('Ingresa al menos 2 caracteres para buscar');

  let aiFailed = false;
  if (process.env.GEMINI_API_KEY) {
    try {
      const candidates = await searchWithAi(trimmed);
      if (candidates.length > 0) return candidates;
    } catch (error) {
      aiFailed = true;
      captureException(error, { module: 'contactos', extra: { reason: 'company-lookup-ai' } });
    }
  } else {
    captureMessage('Buscador de empresas sin GEMINI_API_KEY: usando solo DuckDuckGo', 'warn', { module: 'contactos' });
  }

  try {
    return await searchWeb(trimmed);
  } catch (error) {
    captureException(error, { module: 'contactos', extra: { reason: 'company-lookup-web', aiFailed } });
    // Ambas fuentes cayeron: mejor decirlo que devolver "sin resultados".
    throw new Error('El buscador de empresas no está disponible en este momento. Intenta de nuevo en un minuto o completa los datos manualmente');
  }
}
