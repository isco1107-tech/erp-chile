import { NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { exportFileName } from '@/lib/exports/ranges';
import { readMovementsFilter } from '@/lib/exports/filters';
import { MAX_MOVEMENT_EXPORT_ROWS, buildMovementsWorkbook } from '@/modules/exports/services/movements-export.service';
import { XLSX_CONTENT_TYPE } from '@/modules/exports/services/excel';
import { exportErrorResponse, requireExportAccess, searchReader, today } from '@/modules/exports/route-helpers';

/**
 * Movimientos de inventario de todas las bodegas (o de una) a Excel, con los mismos filtros de la
 * pantalla «Exportar datos». Trae nombres de personas y fotos de respaldo: cada descarga queda en la
 * bitácora de auditoría. El costo solo viaja con `products:costs`.
 */
export async function GET(req: Request) {
  try {
    const { context, access } = await requireExportAccess('movements');
    const filter = readMovementsFilter(searchReader(req.url), today());
    const range = { from: filter.from, to: filter.to };

    let warehouseName: string | undefined;
    if (filter.warehouseId) {
      const warehouse = await prisma.warehouse.findFirst({ where: { id: filter.warehouseId, companyId: context.companyId }, select: { name: true } });
      if (!warehouse) return NextResponse.json({ success: false, error: 'Bodega no encontrada' }, { status: 404 });
      warehouseName = warehouse.name;
    }

    const workbook = await buildMovementsWorkbook(context.companyId, filter, range, { includeCosts: access.costs, warehouseName });

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'EXPORT',
      entity: 'InventoryMovement',
      entityId: 'export',
      metadata: { filters: filter, rows: workbook.rows, warehouse: warehouseName, truncated: workbook.truncated || undefined },
    });

    return new NextResponse(new Uint8Array(workbook.buffer), {
      status: 200,
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${exportFileName('movimientos-de-inventario', range)}"`,
        'Cache-Control': 'no-store',
        ...(workbook.truncated ? { 'X-Export-Truncated': String(MAX_MOVEMENT_EXPORT_ROWS) } : {}),
      },
    });
  } catch (error) {
    return exportErrorResponse(error, 'inventario');
  }
}
