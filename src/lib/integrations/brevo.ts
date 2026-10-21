import 'server-only';

/**
 * Verificación de una cuenta de Brevo antes de guardarla. Solo llama a endpoints
 * fijos de Brevo (nada que venga del usuario entra a la URL), con la key en el
 * header, y nunca registra ni devuelve la key.
 */

const API = 'https://api.brevo.com/v3';
const TIMEOUT_MS = 10_000;

export type BrevoCheck = { ok: true } | { ok: false; error: string };

interface BrevoSendersResponse {
  senders?: Array<{ email?: string; active?: boolean }>;
}

/**
 * Comprueba que la API key sea válida y que `fromAddress` sea un remitente
 * verificado (activo) de esa cuenta: Brevo rechaza cualquier otro, y es mejor
 * enterarse al guardar que cuando falle la primera invitación.
 */
export async function verifyBrevoSender(apiKey: string, fromAddress: string): Promise<BrevoCheck> {
  const headers = { 'api-key': apiKey, accept: 'application/json' };
  try {
    const sendersResponse = await fetch(`${API}/senders`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (sendersResponse.status === 401 || sendersResponse.status === 403) {
      return { ok: false, error: 'Brevo rechazó la API key. Revisa que esté completa y que sea una API key v3 (empieza con "xkeysib-").' };
    }
    if (!sendersResponse.ok) {
      return { ok: false, error: `Brevo respondió un error (${sendersResponse.status}). Intenta de nuevo en unos minutos.` };
    }
    const body = (await sendersResponse.json().catch(() => null)) as BrevoSendersResponse | null;
    const wanted = fromAddress.trim().toLowerCase();
    const sender = body?.senders?.find((s) => s.email?.trim().toLowerCase() === wanted);
    if (!sender) {
      return {
        ok: false,
        error: `${fromAddress} no está entre los remitentes de tu cuenta de Brevo. Agrégalo y verifícalo en Brevo → Senders, Domains & Dedicated IPs → Senders.`,
      };
    }
    if (sender.active === false) {
      return { ok: false, error: `El remitente ${fromAddress} existe en Brevo pero aún no está verificado. Confírmalo desde el correo que Brevo le envió.` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo contactar a Brevo para verificar la cuenta. Intenta de nuevo en unos minutos.' };
  }
}
