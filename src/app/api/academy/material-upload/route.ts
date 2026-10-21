import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { MATERIAL_MAX_BYTES, MATERIAL_TYPES_HINT, displayFileName, formatBytes, materialObjectKey, sniffMaterialType } from '@/lib/academy/materials';
import { materialUploadMetaSchema } from '@/modules/academy/schema';
import { AcademyError } from '@/modules/academy/services/academy.service';
import * as materials from '@/modules/academy/services/academy-material.service';

/**
 * Sube un archivo de material (documento, presentación, planilla o imagen) a un
 * grupo y, si se pide, lo envía por correo a sus alumnas.
 * Route Handler por el límite de 1 MB de las Server Actions. El tipo se valida
 * por los primeros bytes del archivo, no por lo que declara el navegador: el
 * archivo queda con un enlace público que se manda por correo. Se guarda bajo
 * `academy-material/{companyId}/` con un nombre aleatorio e inadivinable.
 * Lo que pesa más del tope se comparte como enlace (acción `addMaterialLinkAction`).
 */

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('academy:write');
    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Adjunta un archivo' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    if (file.size > MATERIAL_MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `El archivo pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(MATERIAL_MAX_BYTES)}. Si es más grande, súbelo a Drive u OneDrive y agrégalo como enlace.` },
        { status: 413 }
      );
    }

    const meta = materialUploadMetaSchema.safeParse({
      groupId: String(form.get('groupId') ?? ''),
      sessionId: String(form.get('sessionId') ?? '') || null,
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      send: form.get('send') === '1',
    });
    if (!meta.success) return NextResponse.json({ success: false, error: meta.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = displayFileName(file.name);
    const type = sniffMaterialType(bytes, fileName);
    if (!type) return NextResponse.json({ success: false, error: `Ese tipo de archivo no se acepta. Sube ${MATERIAL_TYPES_HINT}.` }, { status: 400 });

    // Antes de guardar nada: el grupo y la clase deben ser de esta empresa.
    await materials.assertMaterialTarget(session.companyId, meta.data.groupId, meta.data.sessionId);

    const key = materialObjectKey(session.companyId, fileName, type, crypto.randomUUID().replace(/-/g, '').slice(0, 20));
    const blob = await put(key, new Blob([bytes], { type: type.contentType }), { access: 'public', contentType: type.contentType, addRandomSuffix: false });

    let material: materials.MaterialRow;
    try {
      material = await materials.createFileMaterial(session.companyId, session.id, {
        groupId: meta.data.groupId,
        sessionId: meta.data.sessionId ?? null,
        title: meta.data.title || fileName.replace(/\.[^.]+$/, '').slice(0, 120) || fileName,
        description: meta.data.description ?? null,
        url: blob.url,
        fileName,
        contentType: type.contentType,
        sizeBytes: file.size,
      });
    } catch (error) {
      // El archivo ya subió pero no quedó registrado: se borra para no dejarlo huérfano.
      await materials.deleteStoredFile(blob.url, session.companyId);
      throw error;
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'AcademyMaterial',
      entityId: material.id,
      metadata: { kind: 'FILE', groupId: material.groupId, sessionId: material.sessionId, type: type.extension, bytes: file.size },
    });

    let send: materials.SendMaterialResult | null = null;
    let sendError: string | null = null;
    if (meta.data.send) {
      try {
        send = await materials.sendMaterial(session.companyId, material.id);
        await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyMaterial', entityId: material.id, metadata: { sent: send.sent, failed: send.failed } });
      } catch (error) {
        // El material sí quedó guardado: se informa el motivo y se puede reintentar el envío.
        sendError = error instanceof AcademyError ? error.message : 'No se pudo enviar el correo. Intenta de nuevo desde el material';
        if (!(error instanceof AcademyError)) captureException(error, { module: 'academia', companyId: session.companyId, extra: { reason: 'envío al subir material' } });
      }
    }

    return NextResponse.json({ success: true, data: { material, send, sendError } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof AcademyError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    const authMessage = authErrorMessage(error);
    if (authMessage) return NextResponse.json({ success: false, error: authMessage }, { status: 403 });
    captureException(error, { module: 'academia', extra: { reason: 'material-upload' } });
    return NextResponse.json({ success: false, error: 'No se pudo subir el archivo' }, { status: 500 });
  }
}
