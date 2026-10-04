import { NextResponse } from 'next/server';
import { AuthError, TenantInactiveError, requireAuth } from '@/lib/auth/guards';
import { presenciaUsuarioSupersuite } from '@/lib/supersuite';

/**
 * Latido de presencia del dashboard: el navegador lo llama cada ~60 s mientras
 * la pestaña está visible, para que la Supersuite sepa qué usuarios están
 * conectados. La empresa y el usuario salen SIEMPRE de la sesión, nunca del
 * cuerpo. Sin la Supersuite configurada no hace nada y responde igual.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await requireAuth();
    presenciaUsuarioSupersuite(session.companyId, session.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError || error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: 'Sesión no válida' }, { status: 401 });
    }
    // Un latido perdido no importa: el próximo lo corrige.
    return new NextResponse(null, { status: 204 });
  }
}
