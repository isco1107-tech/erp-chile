import 'server-only';

import { z } from 'zod';

import { isTurnstileEnabled } from './turnstile';

/**
 * Hostnames permitidos del widget de Turnstile. El widget solo funciona en
 * los dominios que tiene registrados: el formulario de postulación de un
 * micrositio servido en su dominio propio quedaría bloqueado si ese dominio
 * no se agrega acá.
 *
 * Requiere `CLOUDFLARE_API_TOKEN` (permiso "Turnstile: Edit") y
 * `CLOUDFLARE_ACCOUNT_ID`. Sin ellos, o sin Turnstile activo, no hace nada y
 * la pantalla avisa que hay que agregar el dominio a mano en Cloudflare.
 * Ojo: el plan gratuito de Turnstile admite pocos hostnames por widget (10-15).
 */

const TIMEOUT_MS = 10_000;

export type TurnstileHostnameState = 'not-needed' | 'manual' | 'registered';

function credentials(): { token: string; account: string; sitekey: string } | null {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return token && account && sitekey ? { token, account, sitekey } : null;
}

/** Si el dominio necesita estar en Turnstile y si se puede hacer automáticamente. */
export function turnstileHostnameMode(): TurnstileHostnameState {
  if (!isTurnstileEnabled()) return 'not-needed';
  return credentials() ? 'registered' : 'manual';
}

const widgetSchema = z.object({
  result: z.object({ name: z.string(), mode: z.string(), domains: z.array(z.string()) }).passthrough(),
});

async function updateDomains(change: (domains: string[]) => string[]): Promise<void> {
  const creds = credentials();
  if (!creds || !isTurnstileEnabled()) return;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(creds.account)}/challenges/widgets/${encodeURIComponent(creds.sitekey)}`;
  const headers = { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' };

  const current = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!current.ok) throw new Error(`Cloudflare respondió HTTP ${current.status} al leer el widget de Turnstile`);
  const widget = widgetSchema.parse(await current.json()).result;

  const domains = change(widget.domains);
  if (domains.length === widget.domains.length && domains.every((domain) => widget.domains.includes(domain))) return;

  // PUT reemplaza la configuración completa: se reenvían nombre y modo tal cual.
  const updated = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: widget.name, mode: widget.mode, domains }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!updated.ok) {
    const detail = await updated.text().catch(() => '');
    throw new Error(`Cloudflare respondió HTTP ${updated.status} al actualizar Turnstile: ${detail.slice(0, 200)}`);
  }
}

/** Agrega el dominio (Turnstile cubre también sus subdominios, como `www.`). */
export async function addTurnstileHostname(domain: string): Promise<void> {
  await updateDomains((domains) => (domains.includes(domain) ? domains : [...domains, domain]));
}

export async function removeTurnstileHostname(domain: string): Promise<void> {
  await updateDomains((domains) => domains.filter((existing) => existing !== domain));
}
