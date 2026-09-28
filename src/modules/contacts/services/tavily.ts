import 'server-only';

import { z } from 'zod';

import type { WebSearchResult } from './company-lookup-parse';

/**
 * Búsqueda web con Tavily (https://tavily.com): API pensada para agentes, con
 * 1.000 créditos gratis al mes sin tarjeta; una búsqueda `basic` cuesta 1.
 * Se usa en vez de la búsqueda con Google de Gemini, que en el tramo gratis
 * no tiene cuota (verificado 2026-09-28: 429 en todos los modelos), y de
 * DuckDuckGo, que bloquea a los servidores de Vercel.
 *
 * La clave va en `TAVILY_API_KEY` (servidor), en el encabezado
 * `Authorization: Bearer` (Tavily dejó de aceptarla en el cuerpo).
 */

const TAVILY_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 8;

/** `quota`: sin créditos o demasiadas consultas. `error`: clave inválida, caída u otra respuesta. */
export class WebSearchUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'quota' | 'error'
  ) {
    super(message);
  }
}

const responseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string().catch(''),
      url: z.string().catch(''),
      content: z.string().catch(''),
    })
  ),
});

export async function searchTavily(query: string, apiKey: string): Promise<WebSearchResult[]> {
  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: MAX_RESULTS, include_answer: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 429: demasiadas por minuto; 432/433: se acabaron los créditos del plan.
  if (res.status === 429 || res.status === 432 || res.status === 433) {
    throw new WebSearchUnavailableError(`Tavily sin cuota (HTTP ${res.status})`, 'quota');
  }
  if (!res.ok) throw new WebSearchUnavailableError(`Tavily respondió HTTP ${res.status}`, 'error');

  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new WebSearchUnavailableError('Tavily respondió en un formato inesperado', 'error');
  return parsed.data.results
    .filter((result) => result.title || result.content)
    .map((result) => ({ title: result.title, url: result.url.replace(/^https?:\/\//, ''), snippet: result.content }));
}
