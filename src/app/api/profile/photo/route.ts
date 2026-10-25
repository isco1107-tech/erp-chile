import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { del, put } from '@/lib/storage/blob';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { blobPathnameStartsWith } from '@/lib/security/blob-url';
import { SNIFFED_IMAGE_EXTENSION, sniffImageType } from '@/lib/security/file-signature';

/**
 * Foto de perfil de la persona (`User.photoUrl`): la ven ella en el menú, el
 * organigrama y la mensajería. Disponible para TODO usuario, tenga o no el
 * módulo de organigrama. Va en un Route Handler y no en una Server Action por
 * el límite de 1 MB de cuerpo de estas (mismo motivo que `candidates/photo-upload`).
 *
 * ESTRICTAMENTE autoservicio: no recibe ningún `userId`; la fila que se
 * actualiza es SIEMPRE la del usuario en sesión. No existe una rama para
 * cambiar la foto de otra persona. El tipo se valida por los primeros bytes
 * del archivo, no por lo que declara el navegador.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Prefijos de archivos que ESTA persona pudo haber subido (el de organigrama es el anterior a esta ruta). */
function ownPhotoPrefixes(companyId: string, userId: string): string[] {
  return [`user-photos/${companyId}/${userId}-`, `org-chart/${companyId}/${userId}-`];
}

/** Borra el archivo anterior solo si es uno que esta persona subió: nunca una URL arbitraria. Falla en silencio. */
async function discardPreviousPhoto(url: string | null, companyId: string, userId: string): Promise<void> {
  if (!url || !ownPhotoPrefixes(companyId, userId).some((prefix) => blobPathnameStartsWith(url, prefix))) return;
  try {
    await del(url);
  } catch (error) {
    captureException(error, { module: 'perfil', companyId, extra: { reason: 'discard-previous-photo' } });
  }
}

function errorResponse(error: unknown, companyId?: string) {
  if (error instanceof AuthError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  if (error instanceof TenantInactiveError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  captureException(error, { module: 'perfil', companyId });
  return NextResponse.json({ success: false, error: 'No se pudo actualizar la foto. Intenta de nuevo.' }, { status: 500 });
}

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const context = await getAuthContext();
    companyId = context.companyId;

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'Adjunta una imagen' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'La imagen supera los 5 MB' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Usa PNG, JPG o WEBP' }, { status: 400 });
    }

    const previous = await prisma.user.findFirst({
      where: { id: context.id, companyId: context.companyId },
      select: { photoUrl: true },
    });

    const blob = await put(
      `user-photos/${context.companyId}/${context.id}-${crypto.randomUUID()}.${SNIFFED_IMAGE_EXTENSION[type]}`,
      Buffer.from(bytes),
      { access: 'public', contentType: type, addRandomSuffix: false }
    );

    const updated = await prisma.user.updateMany({
      where: { id: context.id, companyId: context.companyId },
      data: { photoUrl: blob.url },
    });
    if (updated.count === 0) {
      await discardPreviousPhoto(blob.url, context.companyId, context.id);
      return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 });
    }

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'self_update_photo' },
    });
    await discardPreviousPhoto(previous?.photoUrl ?? null, context.companyId, context.id);

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    return errorResponse(error, companyId);
  }
}

/** Quita la foto: la persona vuelve a verse con sus iniciales. */
export async function DELETE() {
  let companyId: string | undefined;
  try {
    const context = await getAuthContext();
    companyId = context.companyId;

    const previous = await prisma.user.findFirst({
      where: { id: context.id, companyId: context.companyId },
      select: { photoUrl: true },
    });
    await prisma.user.updateMany({
      where: { id: context.id, companyId: context.companyId },
      data: { photoUrl: null },
    });

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'self_remove_photo' },
    });
    await discardPreviousPhoto(previous?.photoUrl ?? null, context.companyId, context.id);

    return NextResponse.json({ success: true, data: { url: null } });
  } catch (error) {
    return errorResponse(error, companyId);
  }
}
