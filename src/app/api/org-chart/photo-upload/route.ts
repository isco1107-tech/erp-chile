import { NextResponse } from 'next/server';
import { put } from '@/lib/storage/blob';
import { AuthError, TenantInactiveError, getAuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';

/**
 * Sube la foto de perfil del organigrama a Cloudflare R2 y la guarda en
 * `User.photoUrl`. Va en un Route Handler, no en una Server Action, por el
 * límite de 1 MB de cuerpo de las Server Actions (mismo motivo que
 * `candidates/photo-upload`).
 *
 * A diferencia de ese precedente, este endpoint es ESTRICTAMENTE
 * autoservicio: no recibe ningún `userId` desde el formulario, la autorización
 * es solo "está autenticado y su empresa tiene el módulo contratado", y la
 * fila que se actualiza es SIEMPRE la del propio usuario en sesión
 * (`context.id`). No existe ninguna rama para subir la foto de otra persona.
 */

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context.features.hasOrgChart) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte una imagen' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Formato no admitido. Use PNG, JPG o WEBP' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'La imagen supera los 5 MB' }, { status: 413 });
    }

    const extension = EXTENSION_BY_TYPE[file.type];
    const pathname = `org-chart/${context.companyId}/${context.id}-${Date.now()}.${extension}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });

    await prisma.user.updateMany({
      where: { id: context.id, companyId: context.companyId },
      data: { photoUrl: blob.url },
    });

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'User',
      entityId: context.id,
      metadata: { reason: 'self_update_photo' },
    });

    return NextResponse.json({ success: true, data: { url: blob.url } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'org-chart' });
    return NextResponse.json({ success: false, error: 'No se pudo subir la foto' }, { status: 500 });
  }
}
