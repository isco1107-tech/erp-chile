import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/guards';
import { presenciaSupersuite, supersuiteHabilitada } from '@/lib/supersuite';

/**
 * Latido de presencia del panel: avisa a la Supersuite que este usuario está
 * conectado. La empresa y el usuario salen de la sesión, nunca del cuerpo. Sin
 * sesión válida responde 401; sin Supersuite configurada es un no-op.
 */
export async function POST() {
  if (!supersuiteHabilitada()) return new NextResponse(null, { status: 204 });
  try {
    const context = await getAuthContext();
    if (!context.mustChangePassword) presenciaSupersuite(context.companyId, context.id);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 401 });
  }
}
