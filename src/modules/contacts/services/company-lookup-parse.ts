import { z } from 'zod';

import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { regions } from '@/lib/chile/locations';

/**
 * Parte pura del buscador de empresas: normaliza lo que devuelve la búsqueda
 * con IA (Gemini + Google Search) o el respaldo de DuckDuckGo a
 * `CompanyLookupCandidate`. Sin I/O, para poder probarla sin red.
 */

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

export const MAX_CANDIDATES = 3;

const RUT_RE = /\b(\d{1,2}(?:\.\d{3}){2}-[\dkK]|\d{7,8}-[\dkK])\b/;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trim() + '…' : text;
}

/** RUT formateado solo si pasa Módulo 11; si no, cadena vacía (nunca se precarga un RUT inválido). */
export function verifiedRut(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanRut(raw);
  return cleaned.length > 1 && validateRut(cleaned) ? formatRut(cleaned) : '';
}

/** Primer RUT con dígito verificador correcto que aparezca en un texto libre. */
export function findRutInText(text: string): string {
  const match = text.match(RUT_RE);
  return match ? verifiedRut(match[1]) : '';
}

/**
 * Si alguna comuna conocida aparece mencionada en el texto, se infiere su
 * región. Se usa cuando la fuente no trae dirección estructurada.
 */
export function matchLocationInText(text: string): { region: string; comuna: string } | null {
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

/**
 * Comuna/región tal como las guarda el formulario (los nombres exactos de
 * `regions`): lo que diga el modelo solo se acepta si calza con una comuna
 * real; si no, se intenta inferir desde la dirección.
 */
export function resolveLocation(comuna: string, address: string): { region: string; comuna: string } {
  const wanted = normalize(comuna);
  if (wanted) {
    for (const region of regions) {
      const found = region.comunas.find((c) => normalize(c) === wanted);
      if (found) return { region: region.name, comuna: found };
    }
  }
  return matchLocationInText(`${comuna} ${address}`) ?? { region: '', comuna: '' };
}

const textField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value ?? '').trim());

const aiCompanySchema = z.object({
  razonSocial: textField,
  rut: textField,
  nombreFantasia: textField,
  giro: textField,
  direccion: textField,
  comuna: textField,
  fuente: textField,
});

/**
 * El modelo con Google Search no puede usar esquema JSON estricto, así que se
 * le pide un arreglo JSON y acá se extrae el primero que aparezca (puede
 * venir envuelto en ```json … ``` o con texto alrededor).
 */
export function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Candidatos desde la respuesta del modelo. `sources` son los dominios que citó Google Search. */
export function parseAiCandidates(text: string, sources: readonly string[]): CompanyLookupCandidate[] {
  const items = extractJsonArray(text) ?? [];
  const candidates: CompanyLookupCandidate[] = [];
  const seenRuts = new Set<string>();

  for (const item of items) {
    const parsed = aiCompanySchema.safeParse(item);
    if (!parsed.success || !parsed.data.razonSocial) continue;
    const data = parsed.data;
    const rut = verifiedRut(data.rut);
    if (rut) {
      const key = cleanRut(rut);
      if (seenRuts.has(key)) continue;
      seenRuts.add(key);
    }
    const location = resolveLocation(data.comuna, data.direccion);
    const source = data.fuente || sources.join(', ');
    candidates.push({
      razonSocial: truncate(data.razonSocial, 120),
      rut,
      rutVerified: rut !== '',
      nombreFantasia: truncate(data.nombreFantasia, 120),
      giro: truncate(data.giro, 200),
      address: truncate(data.direccion, 200),
      region: location.region,
      comuna: location.comuna,
      sourceNote: source ? `Búsqueda con IA — ${truncate(source, 140)}` : 'Búsqueda con IA',
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  // Primero los que traen RUT válido: son los que ahorran más tipeo y errores.
  return candidates.sort((a, b) => Number(b.rutVerified) - Number(a.rutVerified));
}
