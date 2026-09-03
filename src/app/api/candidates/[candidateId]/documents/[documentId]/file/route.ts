import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

/**
 * Ruta autenticada para ver/descargar un archivo de `CandidateDocument`
 * (Sección 4 y 7 del módulo: "sírvelas por una ruta autenticada... que
 * registre cada descarga"). El `fileUrl` real en Vercel Blob nunca se manda
 * al navegador — ni en la respuesta de las Server Actions ni en el HTML del
 * panel — solo esta URL de proxy, así que un enlace copiado del panel no
 * sirve sin sesión ni permiso.
 *
 * Requiere `candidates:sensitive`, no solo `candidates:read`: ver el listado
 * de postulaciones es un permiso más amplio que ver fotografías/documentos
 * de una postulante concreta (Sección 6 del módulo).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ candidateId: string; documentId: string }> }) {
  const { candidateId, documentId } = await params;

  try {
    const session = await requireAuthWithPermission('candidates:sensitive');

    const document = await prisma.candidateDocument.findFirst({
      where: { id: documentId, candidateId, companyId: session.companyId },
      select: { fileUrl: true, mimeType: true, title: true },
    });
    if (!document) return NextResponse.json({ success: false, error: 'Documento no encontrado' }, { status: 404 });

    // Defensa en profundidad contra SSRF: aunque `documentCreateSchema` ya
    // exige un `fileUrl` de Vercel Blob, esta ruta hace `fetch()` con lo que
    // sea que haya en la columna — una fila más vieja que esa validación, o
    // escrita por otro camino, no debe poder convertir este proxy en un
    // oráculo hacia una URL interna arbitraria.
    if (!isAllowedBlobUrl(document.fileUrl)) {
      console.error('candidate document file: fileUrl con origen no permitido, se rechaza', { documentId });
      return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 502 });
    }

    const upstream = await fetch(document.fileUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 502 });
    }

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DOWNLOAD',
      entity: 'CandidateDocument',
      entityId: documentId,
      metadata: { candidateId },
    });

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': document.mimeType ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
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
    console.error('candidate document file fetch failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 500 });
  }
}
