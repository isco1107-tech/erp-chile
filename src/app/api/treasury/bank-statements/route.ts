import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { importStatement } from '@/modules/treasury/services/banks.service';

/**
 * Importa una cartola bancaria (.xlsx o .csv del portal del banco). Route
 * Handler y no Server Action por el límite de 1 MB del cuerpo de las acciones.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const form = await req.formData();
    const bankAccountId = String(form.get('bankAccountId') ?? '');
    const file = form.get('file');
    if (!bankAccountId) return NextResponse.json({ success: false, error: 'Selecciona la cuenta bancaria' }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: 'Adjunta la cartola en .xlsx o .csv' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ success: false, error: 'La cartola supera los 5 MB: descárgala por meses' }, { status: 413 });

    const result = await importStatement(session.companyId, session.id, bankAccountId, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'BankStatement',
      entityId: result.statementId,
      metadata: { file: file.name, imported: result.imported, duplicates: result.duplicates, autoMatched: result.autoMatched },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    // Errores de lectura de la cartola: mensajes pensados para el usuario.
    if (error instanceof Error && !('code' in error)) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    captureException(error, { module: 'tesoreria', companyId, extra: { reason: 'bank-statement-import' } });
    return NextResponse.json({ success: false, error: 'No se pudo importar la cartola' }, { status: 500 });
  }
}
