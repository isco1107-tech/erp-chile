import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { StoreError } from '@/modules/ecommerce/errors';
import { orderListQuerySchema } from '@/modules/ecommerce/schema';
import { buildOrdersWorkbook } from '@/modules/ecommerce/services/store-orders-export.service';
import { assertStoreModule } from '@/modules/ecommerce/services/store-settings.service';

export const dynamic = 'force-dynamic';

/**
 * Exporta los pedidos de la tienda a Excel (de un sitio o de toda la empresa). Route Handler (no
 * Server Action) para devolver el binario directo. Los filtros llegan por query string y pasan por
 * el mismo Zod que la bandeja. Los datos son personales (clientes, direcciones): exige `store:read`
 * y cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('store:read');
    await assertStoreModule(session.companyId);
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;
    const parsed = orderListQuerySchema.pick({ siteId: true, view: true, q: true }).safeParse({ siteId: read('siteId'), view: read('view'), q: read('q') });
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Filtros inválidos' }, { status: 400 });

    const { buffer, rowCount } = await buildOrdersWorkbook(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'StoreOrder',
      entityId: parsed.data.siteId ?? 'all',
      metadata: { filters: parsed.data, rows: rowCount },
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="pedidos-tienda.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof StoreError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    captureException(error, { module: 'tienda-en-linea', extra: { reason: 'orders-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
