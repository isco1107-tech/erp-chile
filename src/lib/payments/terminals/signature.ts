import crypto from 'crypto';
import type { HeaderBag } from './types';

/** Lee una cabecera sin distinguir mayúsculas; null si falta o viene vacía. */
export function getHeader(headers: HeaderBag, name: string): string | null {
  const wanted = name.toLowerCase();
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(wanted)?.trim() || null;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (key.toLowerCase() !== wanted) continue;
    const single = Array.isArray(value) ? value[0] : value;
    return single?.trim() || null;
  }
  return null;
}

/**
 * Comparación en tiempo constante. Se comparan los SHA-256 de ambos lados para
 * que la longitud tampoco se filtre por el tiempo de respuesta.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function hmacSha256(secret: string, payload: string, encoding: 'hex' | 'base64'): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest(encoding);
}

/** Interpreta un timestamp: segundos/milisegundos epoch o ISO-8601. Null si no se entiende. */
export function parseTimestamp(raw: string): Date | null {
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    const date = new Date(n > 1e11 ? n : n * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}
