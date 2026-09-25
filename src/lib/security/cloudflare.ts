/**
 * Integración con Cloudflare delante de Vercel (ver docs/security/cloudflare.md).
 *
 * El problema que resuelve: con Cloudflare como proxy, Vercel ve a Cloudflare
 * como cliente y `x-forwarded-for` trae la IP del borde de Cloudflare, no la
 * del usuario. Sin esto, todos los usuarios que entran por el mismo borde
 * compartirían el contador del rate limit de login (bloqueándose entre sí) y
 * la lista blanca de IP de una empresa dejaría de funcionar.
 *
 * La IP real viene en `cf-connecting-ip`, pero ese header lo puede inventar
 * cualquiera que le pegue directo a Vercel saltándose Cloudflare. Por eso
 * solo se cree cuando el request trae además el secreto de origen
 * (`x-aether-origin-auth`), que agrega una Transform Rule de Cloudflare y que
 * nadie fuera de Cloudflare conoce. Sin el secreto configurado, todo sigue
 * exactamente como antes (`x-forwarded-for` de Vercel).
 *
 * El bloqueo de origen (rechazar lo que no venga de Cloudflare) NO se hace
 * acá ni en `src/proxy.ts`: para cubrir `/api` el proxy tendría que
 * interceptar esas rutas, y Next 16 bufferiza el cuerpo de todo request que
 * pasa por el proxy (tope de 10 MB, `proxyClientMaxBodySize`), lo que
 * truncaría subidas grandes. Se configura como regla del Firewall de Vercel,
 * en el borde (ver docs/security/cloudflare.md).
 *
 * Sin dependencias de Node (`node:crypto`), para poder usarse en cualquier runtime.
 */

/** Header que agrega la Transform Rule de Cloudflare con el secreto de origen. */
export const CLOUDFLARE_ORIGIN_HEADER = 'x-aether-origin-auth';

interface HeaderReader {
  get(name: string): string | null;
}

/** Comparación en tiempo constante (para el largo dado) del secreto. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function originSecret(): string | null {
  const secret = process.env.CLOUDFLARE_ORIGIN_SECRET?.trim();
  // Un secreto corto se adivina: por debajo de 32 caracteres se ignora.
  return secret && secret.length >= 32 ? secret : null;
}

/** Si el request pasó por NUESTRA zona de Cloudflare (trae el secreto de origen). */
export function isFromCloudflare(headers: HeaderReader): boolean {
  const secret = originSecret();
  if (!secret) return false;
  const provided = headers.get(CLOUDFLARE_ORIGIN_HEADER);
  return provided !== null && safeEqual(provided, secret);
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function validIp(value: string | null | undefined): string | null {
  const ip = value?.trim();
  if (!ip || ip.length > 45) return null;
  return IPV4.test(ip) || (ip.includes(':') && IPV6.test(ip)) ? ip : null;
}

/**
 * IP del cliente, única fuente para rate limit, auditoría y lista blanca.
 * - Vía Cloudflare verificado: `cf-connecting-ip`.
 * - Si no: primer valor de `x-forwarded-for` (Vercel lo sobreescribe y no
 *   reenvía el del cliente), luego `x-real-ip`.
 */
export function getClientIp(headers: HeaderReader): string | null {
  if (isFromCloudflare(headers)) {
    const cfIp = validIp(headers.get('cf-connecting-ip'));
    if (cfIp) return cfIp;
  }
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  return validIp(forwarded) ?? validIp(headers.get('x-real-ip'));
}

/** País del cliente según Cloudflare (ISO-3166 alfa-2), solo si el request viene verificado. */
export function getClientCountry(headers: HeaderReader): string | null {
  if (!isFromCloudflare(headers)) return null;
  const country = headers.get('cf-ipcountry')?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
}
