import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthError,
  ModuleNotEnabledError,
  TenantInactiveError,
  requireAuthWithPermission,
} from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { buildReportDataset } from '@/modules/reports/services/dataset.service';
import { buildWorkbook } from '@/modules/reports/services/workbook.service';

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

export async function GET(req: Request) {
  try {
    // El proxy no intercepta /api, así que la autorización tiene que vivir aquí.
    // El workbook agrega costos, márgenes y PMP de toda la empresa: exige el
    // permiso y, con él, que el plan incluya Reportes Avanzados.
    const session = await requireAuthWithPermission('reports:read');

    const url = new URL(req.url);
    const rawFrom = url.searchParams.get('from');
    const rawTo = url.searchParams.get('to');

    let range = defaultRange();
    if (rawFrom && rawTo) {
      const parsed = rangeSchema.safeParse({ from: rawFrom, to: rawTo });
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Rango de fechas inválido' }, { status: 400 });
      }
      range = parsed.data;
    }
    if (range.from > range.to) {
      return NextResponse.json({ success: false, error: 'La fecha inicial es posterior a la final' }, { status: 400 });
    }
    // Incluye el día completo del extremo superior.
    range.to = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999);

    const dataset = await buildReportDataset(session.companyId, range);
    const buffer = await buildWorkbook(dataset);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'Report',
      entityId: 'excel',
      metadata: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        filas: {
          productos: dataset.productos.length,
          inventario: dataset.inventario.length,
          kardex: dataset.kardex.length,
          ventas: dataset.ventas.length,
          compras: dataset.compras.length,
          pagos: dataset.pagos.length,
        },
      },
    });

    const stamp = range.to.toISOString().slice(0, 10);
    const filename = `ERP_${dataset.empresa.rut.replace(/\./g, '')}_${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json(
        { success: false, error: 'Módulo no incluido en tu plan actual. Contacta al administrador para habilitarlo' },
        { status: 403 }
      );
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Excel export failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo generar el reporte' }, { status: 500 });
  }
}
