import { NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth/audit';
import { exportFileName } from '@/lib/exports/ranges';
import { readSalesFilter } from '@/lib/exports/filters';
import { MAX_SALES_EXPORT_DOCS, buildSalesWorkbook } from '@/modules/exports/services/sales-export.service';
import { XLSX_CONTENT_TYPE } from '@/modules/exports/services/excel';
import { exportErrorResponse, requireExportAccess, searchReader, today } from '@/modules/exports/route-helpers';

/**
 * Boletas y documentos de venta de toda la empresa a Excel, con los mismos filtros de la pantalla
 * «Exportar datos» (llegan por la dirección). Trae nombres y RUT de clientes: cada descarga queda
 * en la bitácora de auditoría.
 */
export async function GET(req: Request) {
  try {
    const { context } = await requireExportAccess('sales');
    const filter = readSalesFilter(searchReader(req.url), today());
    const range = { from: filter.from, to: filter.to };
    const workbook = await buildSalesWorkbook(context.companyId, filter, range);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'EXPORT',
      entity: 'SalesDocument',
      entityId: 'export',
      metadata: { filters: filter, documents: workbook.documents, lines: workbook.lines, truncated: workbook.truncated || undefined },
    });

    return new NextResponse(new Uint8Array(workbook.buffer), {
      status: 200,
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${exportFileName(filter.group === 'BOLETAS' ? 'boletas' : 'documentos-de-venta', range)}"`,
        'Cache-Control': 'no-store',
        ...(workbook.truncated ? { 'X-Export-Truncated': String(MAX_SALES_EXPORT_DOCS) } : {}),
      },
    });
  } catch (error) {
    return exportErrorResponse(error, 'ventas');
  }
}
