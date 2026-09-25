import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { importReceivedDtes, ReceivedDteError, type ImportReceivedResult } from '@/modules/dte/services/received.service';

/**
 * Carga de XML de DTE recibidos (uno o varios archivos a la vez). Route
 * Handler y no Server Action: los XML vienen en ISO-8859-1 y deben llegar
 * como bytes, no como texto ya decodificado por el navegador, para que el
 * timbre se pueda verificar.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 50;

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:write');
    companyId = session.companyId;
    const form = await req.formData();
    const files = form.getAll('file').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) return NextResponse.json({ success: false, error: 'Adjunta el XML que te envió el proveedor' }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ success: false, error: `Sube como máximo ${MAX_FILES} archivos a la vez` }, { status: 400 });
    const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) return NextResponse.json({ success: false, error: `${tooBig.name} supera los 5 MB` }, { status: 413 });

    const total: ImportReceivedResult = { imported: 0, duplicates: 0, foreign: 0, invalidTed: 0, linked: 0, items: [] };
    const errors: string[] = [];
    for (const file of files) {
      try {
        const result = await importReceivedDtes(session.companyId, session.id, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
        total.imported += result.imported;
        total.duplicates += result.duplicates;
        total.foreign += result.foreign;
        total.invalidTed += result.invalidTed;
        total.linked += result.linked;
        total.items.push(...result.items);
      } catch (error) {
        // Un archivo malo no debe tumbar la carga de los demás.
        if (error instanceof ReceivedDteError) errors.push(`${file.name}: ${error.message}`);
        else throw error;
      }
    }
    if (total.imported === 0 && total.duplicates === 0 && errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join(' · ') }, { status: 400 });
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ReceivedDte',
      entityId: total.items[0]?.id ?? 'batch',
      metadata: { files: files.map((file) => file.name), imported: total.imported, duplicates: total.duplicates, foreign: total.foreign, invalidTed: total.invalidTed },
    });
    return NextResponse.json({ success: true, data: { ...total, errors } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'dte-recibidos', companyId, extra: { reason: 'received-dte-import' } });
    return NextResponse.json({ success: false, error: 'No se pudieron cargar los documentos' }, { status: 500 });
  }
}
