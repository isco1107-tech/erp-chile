import { NextResponse } from 'next/server';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { importStatement } from '@/modules/treasury/reconciliation/reconciliation.service';

/**
 * Importación de cartola bancaria. Route Handler (no Server Action) por el
 * mismo motivo que `/api/import`: el límite de 1 MB del cuerpo de una acción.
 */
export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('bank:reconcile');
    companyId = session.companyId;
    const form = await req.formData();
    const file = form.get('file');
    const treasuryAccountId = String(form.get('treasuryAccountId') ?? '');
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Adjunta la cartola (.xlsx o .csv)' }, { status: 400 });
    if (!treasuryAccountId) return NextResponse.json({ success: false, error: 'Elige la cuenta bancaria' }, { status: 400 });

    const result = await importStatement(session.companyId, treasuryAccountId, {
      name: file.name,
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'BankStatementLine',
      entityId: treasuryAccountId,
      metadata: { imported: result.imported, duplicates: result.duplicates, from: result.from, to: result.to },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: 403 });
    // Errores de negocio (formato, cuenta inexistente) llegan como Error simple con mensaje para el usuario.
    if (error instanceof Error && error.name === 'Error') return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    captureException(error, { module: 'conciliacion-bancaria', companyId });
    return NextResponse.json({ success: false, error: 'No se pudo importar la cartola' }, { status: 500 });
  }
}
