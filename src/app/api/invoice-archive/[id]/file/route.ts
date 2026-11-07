import { NextResponse } from 'next/server';
import { AuthError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { isAllowedStoredFile, isPrivateRef } from '@/lib/security/blob-url';
import { getPrivate } from '@/lib/storage/blob';
import { captureException, captureMessage } from '@/lib/observability';

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

/**
 * Único punto para ver el archivo (foto o PDF) de una factura archivada. La
 * ubicación real en el almacenamiento nunca viaja al navegador: el panel solo
 * conoce esta ruta, que exige sesión, el permiso del módulo y que la factura
 * sea de la empresa. Los archivos nuevos van al bucket privado; los anteriores
 * (URL pública con nombre impredecible) se siguen sirviendo por acá.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireAuthWithPermission('invoicearchive:read');
    const invoice = await prisma.archivedInvoice.findFirst({
      where: { id, companyId: session.companyId },
      select: { fileUrl: true, mimeType: true },
    });
    if (!invoice) return NextResponse.json({ success: false, error: 'Factura no encontrada' }, { status: 404 });

    // Defensa contra SSRF: solo nuestro almacenamiento, aunque la fila venga de otro camino.
    if (!isAllowedStoredFile(invoice.fileUrl)) {
      captureMessage('invoice-archive file: fileUrl con origen no permitido, se rechaza', 'warn', {
        module: 'invoice-archive',
        companyId: session.companyId,
        extra: { id },
      });
      return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 502 });
    }

    let body: ReadableStream;
    if (isPrivateRef(invoice.fileUrl)) {
      const stored = await getPrivate(invoice.fileUrl);
      if (!stored) return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 502 });
      body = stored.body;
    } else {
      const upstream = await fetch(invoice.fileUrl, { redirect: 'error' });
      if (!upstream.ok || !upstream.body) return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 502 });
      body = upstream.body;
    }

    const inline = INLINE_TYPES.has(invoice.mimeType);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': inline ? invoice.mimeType : 'application/octet-stream',
        'Content-Disposition': inline ? 'inline' : 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'invoice-archive', extra: { id } });
    return NextResponse.json({ success: false, error: 'No se pudo obtener el archivo' }, { status: 500 });
  }
}
