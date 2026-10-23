import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { LOG_KINDS, getWarehouseOf, type LogKind, type MovementLogFilter } from '@/modules/inventory/services/movement-log.service';
import { MAX_EXPORT_ROWS, buildMovementLogWorkbook } from '@/modules/inventory/services/movement-log-export.service';

/**
 * Exporta el registro de movimientos de UNA bodega a Excel, con los mismos filtros de la pantalla
 * (llegan por la dirección). Route Handler para devolver el binario directo. Trae nombres de personas
 * y fotos: cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('products:read');
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;

    const warehouseId = read('bodega');
    if (!warehouseId) return NextResponse.json({ success: false, error: 'Elige la bodega' }, { status: 400 });
    const warehouse = await getWarehouseOf(session.companyId, warehouseId);
    if (!warehouse) return NextResponse.json({ success: false, error: 'Bodega no encontrada' }, { status: 404 });

    const kind = read('tipo');
    const filter: MovementLogFilter = {
      warehouseId: warehouse.id,
      kind: kind && (LOG_KINDS as readonly string[]).includes(kind) ? (kind as LogKind) : 'ALL',
      reason: read('motivo'),
      userId: read('operario'),
      supplierId: read('proveedor'),
      q: read('q'),
      from: read('desde'),
      to: read('hasta'),
    };
    const includeCosts = can(session, 'products:costs');
    const { buffer, truncated } = await buildMovementLogWorkbook(session.companyId, warehouse.name, filter, { includeCosts });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'InventoryMovement',
      entityId: warehouse.id,
      metadata: { warehouse: warehouse.name, filters: { ...filter, warehouseId: undefined }, truncated: truncated || undefined },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="movimientos-de-bodega.xlsx"',
        'Cache-Control': 'no-store',
        ...(truncated ? { 'X-Export-Truncated': String(MAX_EXPORT_ROWS) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'inventario', extra: { reason: 'movements-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
