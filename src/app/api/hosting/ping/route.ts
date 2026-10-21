import { NextResponse } from 'next/server';
import { DOMAIN_PING_APP } from '@/lib/hosting/ping';

/**
 * Señal de vida de la plataforma en cualquier dominio que Vercel le sirva.
 * La usa `domainServesPlatform` para saber si el dominio propio de un sitio YA
 * muestra la plataforma (DNS + Vercel + certificado) antes de darlo por
 * verificado. Pública y sin datos: solo dice «soy Aether». `/api` queda fuera
 * del proxy, así que responde igual en un dominio de cliente.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ app: DOMAIN_PING_APP }, { headers: { 'Cache-Control': 'no-store' } });
}
