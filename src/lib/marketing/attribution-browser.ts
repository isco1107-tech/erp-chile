import {
  ATTRIBUTION_SENT_KEY,
  ATTRIBUTION_STORAGE_KEY,
  mergeAttribution,
  readStoredAttribution,
  touchFromUrl,
  touchSignature,
  type Attribution,
} from './attribution';

/**
 * Lado del navegador de la atribución de campañas (ADR 0015). Todo acceso a
 * `localStorage`/`sessionStorage` va en try/catch: en una ventana privada o con
 * el almacenamiento bloqueado la página funciona igual, solo sin atribución.
 */

const TRACKED_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];

function storageGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Almacenamiento bloqueado: se sigue sin atribución.
  }
}

/** La campaña vigente para adjuntarla a un formulario (o `null`). */
export function currentAttribution(now: Date = new Date()): Attribution | null {
  return readStoredAttribution(storageGet(() => window.localStorage, ATTRIBUTION_STORAGE_KEY), now);
}

/**
 * Al entrar al landing: guarda la campaña del enlace (si traía una), avisa la
 * visita una sola vez por campaña y pestaña, y limpia los `utm_*` de la barra
 * de direcciones para que quien copie el enlace no se lleve la campaña.
 */
export function captureCampaignVisit(now: Date = new Date()): void {
  const url = new URL(window.location.href);
  const touch = touchFromUrl(url, document.referrer, now);
  if (!touch) return;

  const merged = mergeAttribution(currentAttribution(now), touch, now);
  if (!merged) return;
  storageSet(() => window.localStorage, ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));

  const signature = touchSignature(touch);
  if (storageGet(() => window.sessionStorage, ATTRIBUTION_SENT_KEY) !== signature) {
    storageSet(() => window.sessionStorage, ATTRIBUTION_SENT_KEY, signature);
    const body = JSON.stringify({ attribution: merged });
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/public/marketing/visit', new Blob([body], { type: 'application/json' }));
    if (!sent) void fetch('/api/public/marketing/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  }

  for (const param of TRACKED_PARAMS) url.searchParams.delete(param);
  try {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Sin History API: la dirección queda con la campaña, no pasa nada más.
  }
}
