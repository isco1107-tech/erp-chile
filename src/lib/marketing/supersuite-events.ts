import type { Attribution, CampaignTouch } from './attribution';

/**
 * Eventos del marketing PROPIO de Aether hacia la Supersuite (ADR 0015).
 *
 * No son de ninguna empresa cliente: viajan con el `clienteId` reservado
 * `aether`, que la Supersuite trata como la casa (no cuenta como cliente, ni
 * como adopción de un módulo). Llevan solo la campaña y fichas de listas
 * cerradas: jamás nombre, correo, teléfono, empresa ni mensaje de la persona
 * (eso sigue llegando solo al correo de ventas). La Supersuite une el lead con
 * la empresa que se cree después por la referencia opaca `L-XXXXXXXX`, que
 * ventas pega en la orden `empresa.crear` (`leadRef`).
 */

export const CLIENTE_AETHER = 'aether';
export const MODULO_MARKETING = 'marketing';
export const ACCION_VISITA = 'landing_visita';
export const ACCION_LEAD = 'lead_recibido';

/** Sin I, O, 0 ni 1: se dicta por teléfono y se copia a mano sin confusiones. */
const LEAD_REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LEAD_REF_RE = /^L-[A-HJ-NP-Z2-9]{8}$/;

/** Referencia opaca de un lead (40 bits): no se deriva de ningún dato de la persona. */
export function newLeadRef(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  // 256 es múltiplo de 32: el módulo no sesga ninguna letra.
  return `L-${Array.from(bytes, (b) => LEAD_REF_ALPHABET[b % LEAD_REF_ALPHABET.length]).join('')}`;
}

export type LeadForm = 'demo' | 'cotizacion-modulos';

type Toque = { fuente: string; medio?: string; campana?: string; contenido?: string; termino?: string; pagina: string; referente?: string; fecha: string };

function toque(t: CampaignTouch): Toque {
  const datos: Toque = {
    fuente: t.source,
    medio: t.medium,
    campana: t.campaign,
    contenido: t.content,
    termino: t.term,
    pagina: t.landingPath,
    referente: t.referrerHost,
    fecha: t.at,
  };
  return Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)) as Toque;
}

/** Visita al landing desde una campaña. */
export function datosDeVisita(attribution: Attribution): Record<string, unknown> {
  return { toque: toque(attribution.last), primerToque: toque(attribution.first) };
}

/**
 * Lead recibido. `equipo`, `areas` y `modulos` salen de listas cerradas del
 * formulario y del tarifario: describen la oportunidad sin identificar a nadie.
 */
export function datosDeLead(input: {
  ref: string;
  formulario: LeadForm;
  equipo?: string;
  areas?: readonly string[];
  modulos?: readonly string[];
  attribution: Attribution | null;
}): Record<string, unknown> {
  return {
    ref: input.ref,
    formulario: input.formulario,
    ...(input.equipo ? { equipo: input.equipo } : {}),
    ...(input.areas?.length ? { areas: [...input.areas] } : {}),
    ...(input.modulos?.length ? { modulos: [...input.modulos] } : {}),
    ...(input.attribution ? { toque: toque(input.attribution.last), primerToque: toque(input.attribution.first) } : { toque: null }),
  };
}
