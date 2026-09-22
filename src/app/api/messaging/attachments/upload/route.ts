import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { encryptFileBuffer } from '@/lib/messaging/crypto';
import { captureException } from '@/lib/observability';
import { createPendingAttachment } from '@/modules/messaging/services/messaging.service';

/**
 * Sube un adjunto de mensajería. Va en un Route Handler (no Server Action) por
 * el límite de 1 MB de cuerpo de las Server Actions — mismo motivo que el
 * resto de subidas del proyecto (ver `promissory-notes/document-upload`).
 *
 * A diferencia de esas subidas, el archivo se CIFRA (AES-256-GCM) antes de
 * subirse: el blob nunca contiene el contenido en claro, y la URL de Vercel
 * Blob nunca se devuelve al cliente — solo el `id` del registro. La descarga
 * real pasa siempre por `/api/messaging/attachments/[id]`, que valida
 * membresía en la conversación y descifra en el servidor.
 *
 * El adjunto nace sin `messageId` (el archivo se sube antes de que exista el
 * mensaje que lo va a llevar); `sendMessageAction` lo asocia después.
 */

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('messaging:use');

    const form = await req.formData();
    const file = form.get('file');
    const conversationId = form.get('conversationId');

    if (typeof conversationId !== 'string' || !conversationId) {
      return NextResponse.json({ success: false, error: 'Falta la conversación' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Formato de archivo no admitido' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera los 20 MB' }, { status: 413 });
    }

    const plainBuffer = Buffer.from(await file.arrayBuffer());
    const encryptedBuffer = encryptFileBuffer(plainBuffer);

    const pathname = `messaging/${session.companyId}/${Date.now()}-${crypto.randomUUID()}.enc`;
    const blob = await put(pathname, encryptedBuffer, {
      access: 'public',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
    });

    const attachment = await createPendingAttachment(session.companyId, conversationId, session.id, {
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      blobUrl: blob.url,
    });

    return NextResponse.json({ success: true, data: { id: attachment.id } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    captureException(error, { module: 'messaging' });
    return NextResponse.json({ success: false, error: 'No se pudo subir el archivo' }, { status: 500 });
  }
}
