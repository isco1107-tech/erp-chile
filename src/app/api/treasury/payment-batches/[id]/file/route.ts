import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { PAYMENT_FILE_HEADERS, paymentFileCsv, paymentFileRows } from '@/lib/treasury/payment-file';
import { getPaymentBatch } from '@/modules/treasury/services/payment-batches.service';

/** Archivo de la nómina para subir al portal empresas del banco (CSV o Excel). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:read');
    companyId = session.companyId;
    const { id } = await params;
    const format = new URL(req.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
    const batch = await getPaymentBatch(session.companyId, id);
    if (!batch) return NextResponse.json({ success: false, error: 'Nómina no encontrada' }, { status: 404 });
    const items = batch.items.map((item) => item.file);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'PaymentBatch',
      entityId: batch.id,
      metadata: { folio: batch.folio, format, items: items.length, totalAmount: batch.totalAmount },
    });

    const baseName = `nomina-pagos-${batch.folio}`;
    if (format === 'csv') {
      // BOM para que Excel en español lea bien tildes y Ñ.
      return new NextResponse(`﻿${paymentFileCsv(items)}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Nómina');
    sheet.addRow([...PAYMENT_FILE_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    for (const row of paymentFileRows(items)) {
      const values: (string | number)[] = [...row];
      values[6] = Number(row[6]);
      sheet.addRow(values);
    }
    sheet.columns.forEach((column) => {
      column.width = 20;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'tesoreria', companyId, extra: { reason: 'payment-batch-file' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
