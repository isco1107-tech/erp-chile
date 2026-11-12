import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { traceLot } from '@/modules/inventory/services/genealogy.service';
import { buildLotTraceWorkbook } from '@/modules/inventory/services/genealogy-export.service';

/**
 * Libro del retiro de un lote (origen, ventas, clientes alcanzados, existencias). Trae
 * nombres y RUT de clientes solo para quien puede ver ventas; cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('products:read');
    companyId = session.companyId;
    const url = new URL(req.url);
    const productId = url.searchParams.get('producto');
    const lot = url.searchParams.get('lote');
    if (!productId || !lot) return NextResponse.json({ success: false, error: 'Elige el producto y el lote' }, { status: 400 });

    const trace = await traceLot(session.companyId, productId, lot, { includeCustomers: can(session, 'sales:read') });
    if (!trace) return NextResponse.json({ success: false, error: 'Lote no encontrado' }, { status: 404 });
    const { buffer, customers } = await buildLotTraceWorkbook(trace);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'InventoryLot',
      entityId: productId,
      metadata: { lot, customers, customersHidden: trace.customersHidden || undefined },
    });

    const safeName = `retiro-lote-${trace.lotNumber}`.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof IpNotAllowedError || error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    captureException(error, { module: 'inventario', companyId, extra: { reason: 'lot-trace-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
