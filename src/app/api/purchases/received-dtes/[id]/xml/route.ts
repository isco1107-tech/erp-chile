import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { getReceivedDteXml } from '@/modules/dte/services/received.service';

/**
 * XML original de un DTE recibido. Se devuelve en ISO-8859-1, la codificación
 * con que lo emitió el proveedor, para que el timbre siga siendo verificable
 * en cualquier otra herramienta.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:read');
    companyId = session.companyId;
    const { id } = await params;
    const file = await getReceivedDteXml(session.companyId, id);
    if (!file) return NextResponse.json({ success: false, error: 'Documento no encontrado' }, { status: 404 });
    const body = `<?xml version="1.0" encoding="ISO-8859-1"?>\n${file.xml}`;
    return new NextResponse(new Uint8Array(Buffer.from(body, 'latin1')), {
      headers: {
        'Content-Type': 'application/xml; charset=ISO-8859-1',
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'dte-recibidos', companyId, extra: { reason: 'received-dte-xml' } });
    return NextResponse.json({ success: false, error: 'No se pudo descargar el XML' }, { status: 500 });
  }
}
