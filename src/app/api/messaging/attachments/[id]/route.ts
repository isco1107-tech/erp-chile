import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { decryptFileBuffer } from '@/lib/messaging/crypto';
import { captureException } from '@/lib/observability';
import { getAttachmentForDownload } from '@/modules/messaging/services/messaging.service';

/**
 * Único punto de descarga de un adjunto de mensajería. El blob de Vercel es
 * técnicamente público, pero su URL nunca sale del servidor: el cliente solo
 * conoce el `id` del adjunto, y esta ruta exige ser participante de la
 * conversación antes de traer el blob y descifrarlo.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthWithPermission('messaging:use');
    const { id } = await params;

    const attachment = await getAttachmentForDownload(session.companyId, session.id, id);

    const blobResponse = await fetch(attachment.blobUrl);
    if (!blobResponse.ok) throw new Error('Archivo no encontrado');
    const encryptedBuffer = Buffer.from(await blobResponse.arrayBuffer());
    const plainBuffer = decryptFileBuffer(encryptedBuffer);

    return new NextResponse(new Uint8Array(plainBuffer), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
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
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    captureException(error, { module: 'messaging' });
    return NextResponse.json({ success: false, error: 'No se pudo descargar el archivo' }, { status: 500 });
  }
}
