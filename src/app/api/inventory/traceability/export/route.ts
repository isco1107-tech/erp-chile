import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getTraceabilityOverview } from '@/modules/inventory/services/traceability-overview.service';
import { buildOverviewWorkbook } from '@/modules/inventory/services/traceability-overview-export.service';

/** Estado de la trazabilidad de la empresa en Excel (cada descarga queda en la bitácora). */
export async function GET() {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:read');
    companyId = session.companyId;
    const overview = await getTraceabilityOverview(session.companyId);
    const buffer = await buildOverviewWorkbook(overview);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'ProductSerial',
      entityId: session.companyId,
      metadata: { report: 'traceability-overview', attention: overview.attention.length },
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="estado-de-trazabilidad.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'inventario', companyId, extra: { reason: 'traceability-overview-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
