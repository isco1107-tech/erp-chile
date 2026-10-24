import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, assertModuleEnabled, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getWarehouseOf } from '@/modules/inventory/services/movement-log.service';
import { getRetailSettings } from '@/modules/retail/services/retail-settings.service';
import { buildDeadStockWorkbook } from '@/modules/retail/services/dead-stock-export.service';

/** Stock muerto de UNA bodega a Excel, con el umbral de la empresa y los filtros de la pantalla. Queda en la bitácora. */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('retail:read');
    assertModuleEnabled(session, 'hasDeadStock');
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;

    const warehouseId = read('bodega');
    if (!warehouseId) return NextResponse.json({ success: false, error: 'Elige la bodega' }, { status: 400 });
    const warehouse = await getWarehouseOf(session.companyId, warehouseId);
    if (!warehouse) return NextResponse.json({ success: false, error: 'Bodega no encontrada' }, { status: 404 });

    const settings = await getRetailSettings(session.companyId);
    const filter = { warehouseId: warehouse.id, thresholdDays: settings.deadStockDays, categoryId: read('categoria'), supplierId: read('proveedor') };
    const includeCosts = can(session, 'products:costs');
    const { buffer, rows } = await buildDeadStockWorkbook(session.companyId, warehouse.name, filter, { includeCosts });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'RetailMetrics',
      entityId: warehouse.id,
      metadata: { report: 'stock-muerto', warehouse: warehouse.name, thresholdDays: filter.thresholdDays, categoryId: filter.categoryId, supplierId: filter.supplierId, includeCosts, rows },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="stock-muerto.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'retail', extra: { reason: 'dead-stock-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
