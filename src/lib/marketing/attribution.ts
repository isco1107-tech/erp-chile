import { z } from 'zod';

/**
 * Atribución de campañas del marketing PROPIO de Aether (ADR 0015): de qué
 * publicación, anuncio o enlace llegó cada visita al landing y cada solicitud
 * de demo o cotización. La Supersuite arma con esto el embudo publicación →
 * visita → lead → empresa → tarifa mensual.
 *
 * Reglas:
 *  - Primera parte y sin cookies: el navegador guarda la campaña en
 *    `localStorage` (del propio sitio de Aether, nunca de terceros) y la manda
 *    junto al formulario. No hay huella del dispositivo ni identificador de la
 *    persona.
 *  - Solo se aceptan fichas cortas en una lista cerrada de caracteres (los
 *    valores de `utm_*` los escribe la Supersuite al armar el enlace, no las
 *    personas): un valor raro se limpia o se descarta, nunca se guarda tal cual.
 *  - Del sitio de origen solo el dominio (`referrerHost`): la ruta de otra
 *    página puede llevar datos personales.
 *  - Una atribución inválida nunca hace perder un lead: el servidor la descarta
 *    y el formulario sigue su curso.
 *
 * Puro (sin `window`): lo usan el navegador (`CampaignAttributionTracker`) y
 * las rutas públicas.
 */

export const ATTRIBUTION_STORAGE_KEY = 'aether-attribution:v1';
/** Marca de la última campaña avisada en esta pestaña: evita contar la misma visita en cada recarga. */
export const ATTRIBUTION_SENT_KEY = 'aether-attribution-sent:v1';
/** Una campaña vieja ya no explica un lead nuevo. */
export const ATTRIBUTION_TTL_DAYS = 90;
const TTL_MS = ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;

const TOKEN_MAX = 80;
const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const PATH_RE = /^\/[A-Za-z0-9/_.-]{0,119}$/;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const token = z.string().regex(TOKEN_RE);

export const campaignTouchSchema = z
  .object({
    source: token,
    medium: token.optional(),
    campaign: token.optional(),
    content: token.optional(),
    term: token.optional(),
    landingPath: z.string().regex(PATH_RE),
    referrerHost: z.string().max(253).regex(HOST_RE).optional(),
    at: z.string().datetime(),
  })
  .strict();

/** Primer y último contacto con una campaña (dentro de la ventana de 90 días). */
export const attributionSchema = z.object({ first: campaignTouchSchema, last: campaignTouchSchema }).strict();

export type CampaignTouch = z.infer<typeof campaignTouchSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

/**
 * Deja un valor de `utm_*` como ficha segura: minúsculas, sin tildes, espacios
 * a guiones y solo `a-z 0-9 . _ -`. Vacío o irrecuperable → `undefined`.
 */
export function normalizeToken(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, TOKEN_MAX);
  return TOKEN_RE.test(clean) ? clean : undefined;
}

/** Dominio de la página de origen, sin `www.`; nada si es el propio sitio o no se puede leer. */
export function referrerHostOf(referrer: string | null | undefined, ownHost: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === ownHost.toLowerCase().replace(/^www\./, '')) return undefined;
    return HOST_RE.test(host) && host.length <= 253 ? host : undefined;
  } catch {
    return undefined;
  }
}

/**
 * La campaña de esta visita, si el enlace traía una (`utm_source`, o `ref`
 * como atajo para enlaces de referidos). Sin campaña → `null`: una visita
 * directa no pisa la atribución que ya había.
 */
export function touchFromUrl(url: URL, referrer: string | null | undefined, now: Date): CampaignTouch | null {
  const params = url.searchParams;
  const utmSource = normalizeToken(params.get('utm_source'));
  const ref = utmSource ? undefined : normalizeToken(params.get('ref'));
  const source = utmSource ?? ref;
  if (!source) return null;

  const touch: CampaignTouch = {
    source,
    medium: normalizeToken(params.get('utm_medium')) ?? (ref ? 'referral' : undefined),
    campaign: normalizeToken(params.get('utm_campaign')),
    content: normalizeToken(params.get('utm_content')),
    term: normalizeToken(params.get('utm_term')),
    landingPath: PATH_RE.test(url.pathname) ? url.pathname : '/',
    referrerHost: referrerHostOf(referrer, url.hostname),
    at: now.toISOString(),
  };
  // Sin claves `undefined`: el esquema es estricto y el JSON queda limpio.
  return Object.fromEntries(Object.entries(touch).filter(([, value]) => value !== undefined)) as CampaignTouch;
}

function expired(attribution: Attribution, now: Date): boolean {
  return now.getTime() - new Date(attribution.last.at).getTime() > TTL_MS;
}

/** Lee lo guardado en el navegador: inválido o vencido → `null`. */
export function readStoredAttribution(raw: string | null | undefined, now: Date): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || expired(parsed.data, now)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Suma la campaña de esta visita: conserva el primer contacto y reemplaza el último. */
export function mergeAttribution(stored: Attribution | null, touch: CampaignTouch | null, now: Date): Attribution | null {
  const current = stored && !expired(stored, now) ? stored : null;
  if (!touch) return current;
  return { first: current?.first ?? touch, last: touch };
}

/** Firma de una campaña (sin la hora ni la página): dos visitas iguales en la misma pestaña cuentan una vez. */
export function touchSignature(touch: CampaignTouch): string {
  return [touch.source, touch.medium, touch.campaign, touch.content, touch.term].map((v) => v ?? '').join('|');
}

/** Lo que manda un formulario o la visita: si no calza con el esquema se descarta (el lead nunca se pierde por esto). */
export function parseAttributionPayload(value: unknown): Attribution | null {
  const parsed = attributionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Línea legible para el correo de ventas: «instagram / social / lanzamiento-pos». */
export function attributionLabel(attribution: Attribution | null): string {
  if (!attribution) return 'Sin campaña (visita directa o enlace sin seguimiento)';
  const t = attribution.last;
  const parts = [t.source, t.medium, t.campaign].filter(Boolean).join(' / ');
  return t.content ? `${parts} (pieza ${t.content})` : parts;
}
