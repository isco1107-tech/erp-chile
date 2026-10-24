import { NextResponse } from 'next/server';
import {
  AuthError,
  authErrorMessage,
  requireAuthWithPermission,
} from '@/lib/auth/guards';
import { controlSnapshot } from '@/modules/control/service';
import { captureException } from '@/lib/observability';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const context = await requireAuthWithPermission('settings:company');
    if (context.role !== 'OWNER')
      return NextResponse.json(
        { error: 'Esta aplicación es exclusiva del dueño de la empresa' },
        { status: 403, headers },
      );
    return NextResponse.json(await controlSnapshot(context), { headers });
  } catch (error) {
    const message = authErrorMessage(error);
    if (message)
      return NextResponse.json(
        { error: message },
        { status: error instanceof AuthError ? error.status : 403, headers },
      );
    captureException(error, { module: 'control' });
    return NextResponse.json(
      { error: 'No se pudo actualizar la empresa' },
      { status: 500, headers },
    );
  }
}
