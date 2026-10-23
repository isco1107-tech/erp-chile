import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security/cloudflare';
import { SUPPLIER_PORTAL_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';
import { getSupplierPortalView } from '@/modules/inventory/services/supplier-portal.service';
import { buildSupplierInventoryWorkbook } from '@/modules/inventory/services/supplier-portal-export.service';

/**
 * Descarga el inventario del proveedor en Excel. Se autoriza igual que la página: con el código
 * de la ruta, que solo ve los productos de ese proveedor. Sin código válido responde 404 (no dice
 * si el código existió).
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const noStore = { 'Cache-Control': 'no-store' };
  try {
    const ip = getClientIp(req.headers) ?? 'unknown';
    if (!checkRateLimit(ip, SUPPLIER_PORTAL_RATE_LIMIT).allowed) {
      return NextResponse.json({ success: false, error: 'Demasiadas consultas. Espera unos minutos.' }, { status: 429, headers: noStore });
    }
    const { code } = await params;
    const view = await getSupplierPortalView(code);
    if (!view) return NextResponse.json({ success: false, error: 'Código no válido' }, { status: 404, headers: noStore });

    const buffer = await buildSupplierInventoryWorkbook(view);
    const day = view.generatedAt.toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="inventario-${day}.xlsx"`,
        ...noStore,
      },
    });
  } catch (error) {
    captureException(error, { module: 'portal-proveedores', extra: { reason: 'export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500, headers: noStore });
  }
}
