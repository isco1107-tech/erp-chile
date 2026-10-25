import 'server-only';

import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, assertPasswordChangeNotPending, getAuthContext, type AuthContext } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { exportAccess, type ExportAccess } from '@/lib/exports/access';
import { santiagoDateParts } from '@/lib/chile/timezone';

/** Las rutas de descarga: sesión válida y permiso de ESE archivo (no el de la pantalla en general). */
export async function requireExportAccess(kind: 'sales' | 'movements'): Promise<{ context: AuthContext; access: ExportAccess }> {
  const context = await getAuthContext();
  assertPasswordChangeNotPending(context);
  const access = exportAccess(context);
  if (!access[kind]) {
    throw new AuthError(kind === 'sales' ? 'Tu rol no puede exportar boletas y documentos de venta' : 'Tu rol no puede exportar movimientos de inventario', 403);
  }
  return { context, access };
}

export const today = () => santiagoDateParts(new Date());

export function searchReader(url: string): (key: string) => string | undefined {
  const params = new URL(url).searchParams;
  return (key) => params.get(key) ?? undefined;
}

export function exportErrorResponse(error: unknown, module: string): NextResponse {
  if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
  captureException(error, { module, extra: { reason: 'export' } });
  return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
}
