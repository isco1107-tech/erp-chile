import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { parseLowCoverage, parsePeriod } from '@/lib/retail/live-metrics';
import { getWarehouseOf } from '@/modules/inventory/services/movement-log.service';
import { buildLiveMetricsWorkbook } from '@/modules/retail/services/live-metrics-export.service';

/**
 * Exporta "Retail en vivo" de UNA bodega a Excel con los filtros de la
 * pantalla (llegan por la dirección). Cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('retail:read');
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;

    const warehouseId = read('bodega');
    if (!warehouseId) return NextResponse.json({ success: false, error: 'Elige la bodega' }, { status: 400 });
    const warehouse = await getWarehouseOf(session.companyId, warehouseId);
    if (!warehouse) return NextResponse.json({ success: false, error: 'Bodega no encontrada' }, { status: 404 });

    const filter = {
      warehouseId: warehouse.id,
      periodDays: parsePeriod(read('periodo')),
      lowCoverageDays: parseLowCoverage(read('umbral')),
      categoryId: read('categoria'),
      supplierId: read('proveedor'),
    };
    const { buffer, rows } = await buildLiveMetricsWorkbook(session.companyId, warehouse.name, filter);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'RetailMetrics',
      entityId: warehouse.id,
      metadata: { warehouse: warehouse.name, periodDays: filter.periodDays, lowCoverageDays: filter.lowCoverageDays, categoryId: filter.categoryId, supplierId: filter.supplierId, rows },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="retail-en-vivo.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'retail', extra: { reason: 'live-metrics-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
