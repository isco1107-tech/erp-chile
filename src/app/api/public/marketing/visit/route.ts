import { NextResponse } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, MARKETING_VISIT_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { parseAttributionPayload } from '@/lib/marketing/attribution';
import { ACCION_VISITA, datosDeVisita } from '@/lib/marketing/supersuite-events';
import { marketingSupersuite } from '@/lib/supersuite';

/**
 * Visita al landing desde una campaña del marketing propio de Aether
 * (ADR 0015). La manda `CampaignAttributionTracker` con `sendBeacon` una vez
 * por campaña y pestaña, y llega a la Supersuite como `landing_visita` con la
 * campaña y nada más: ni IP, ni navegador, ni identificador de la persona.
 *
 * Público y sin sesión como el resto de `/api/public/**`: límite por IP,
 * cuerpo acotado y esquema estricto. Las visitas son una señal indicativa
 * (cualquiera puede enviar una); lo que mide de verdad el embudo son los leads
 * y las empresas creadas.
 */

const MAX_BODY_BYTES = 2048;

export async function POST(req: Request) {
  const clientIp = extractClientIp(req) ?? 'unknown';
  if (!checkRateLimit(clientIp, MARKETING_VISIT_RATE_LIMIT).allowed) return new NextResponse(null, { status: 429 });

  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 400 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const attribution = parseAttributionPayload(typeof body === 'object' && body !== null ? (body as Record<string, unknown>).attribution : undefined);
  if (!attribution) return new NextResponse(null, { status: 400 });

  marketingSupersuite(ACCION_VISITA, datosDeVisita(attribution));
  return new NextResponse(null, { status: 204 });
}
