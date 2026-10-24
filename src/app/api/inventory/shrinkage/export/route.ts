import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, assertModuleEnabled, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { SHRINKAGE_REASON_KEYS, isLiabilityState, resolvePeriod } from '@/lib/inventory/shrinkage';
import { dayKey } from '@/lib/retail/live-metrics';
import { getWarehouseOf } from '@/modules/inventory/services/movement-log.service';
import type { ShrinkageFilter } from '@/modules/inventory/services/shrinkage.service';
import { buildShrinkageWorkbook } from '@/modules/inventory/services/shrinkage-export.service';

/**
 * Mermas de UNA bodega con su responsable, a Excel, con los filtros de la
 * pantalla. Trae nombres de personas y fotos: cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:read');
    companyId = session.companyId;
    assertModuleEnabled(session, 'hasShrinkageLiability');
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;

    const warehouseId = read('bodega');
    if (!warehouseId) return NextResponse.json({ success: false, error: 'Elige la bodega' }, { status: 400 });
    const warehouse = await getWarehouseOf(session.companyId, warehouseId);
    if (!warehouse) return NextResponse.json({ success: false, error: 'Bodega no encontrada' }, { status: 404 });

    const parts = santiagoDateParts(new Date());
    const period = resolvePeriod(read('desde'), read('hasta'), dayKey(parts.year, parts.month, parts.day));
    const reason = read('motivo');
    const state = read('responsable');
    const filter: ShrinkageFilter = {
      warehouseId: warehouse.id,
      ...period,
      reason: reason && (SHRINKAGE_REASON_KEYS as readonly string[]).includes(reason) ? reason : undefined,
      state: isLiabilityState(state) ? state : undefined,
      supplierId: read('proveedor'),
    };
    const includeCosts = can(session, 'products:costs');
    const { buffer, rows, truncated } = await buildShrinkageWorkbook(session.companyId, warehouse.name, filter, { includeCosts });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'ShrinkageLiability',
      entityId: warehouse.id,
      metadata: { warehouse: warehouse.name, rows, filters: { ...filter, warehouseId: undefined }, truncated: truncated || undefined },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="mermas-y-responsables.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'inventario', companyId, extra: { reason: 'shrinkage-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
