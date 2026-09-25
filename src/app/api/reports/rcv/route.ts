import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { rcvPeriodSchema } from '@/modules/dte/schema';
import { importRcv, RcvError } from '@/modules/dte/services/rcv.service';

/**
 * Importa el detalle del Registro de Compras y Ventas descargado del SII.
 * Guardarlo no afecta ningún documento: es la referencia contra la que se
 * cuadra el período, por eso basta con poder ver reportes.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('reports:read');
    companyId = session.companyId;
    const form = await req.formData();
    const parsed = rcvPeriodSchema.safeParse({
      kind: String(form.get('kind') ?? ''),
      year: Number(form.get('year')),
      month: Number(form.get('month')),
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Indica el período y si es de compras o ventas' }, { status: 400 });
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: 'Adjunta el CSV del RCV' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'El archivo supera los 10 MB' }, { status: 413 });

    const result = await importRcv(session.companyId, session.id, { ...parsed.data, file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: result.replaced ? 'UPDATE' : 'CREATE',
      entity: 'RcvImport',
      entityId: result.id,
      metadata: { ...parsed.data, file: file.name, rows: result.rowCount },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof RcvError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    captureException(error, { module: 'rcv', companyId, extra: { reason: 'rcv-import' } });
    return NextResponse.json({ success: false, error: 'No se pudo importar el RCV' }, { status: 500 });
  }
}
