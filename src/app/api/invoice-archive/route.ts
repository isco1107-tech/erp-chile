import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { del, put } from '@/lib/storage/blob';
import { AuthError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { sniffCertificateType, SNIFFED_CERTIFICATE_EXTENSION } from '@/lib/security/file-signature';
import { captureException } from '@/lib/observability';
import { archivedInvoiceSchema } from '@/modules/invoice-archive/schema';
import { createArchivedInvoice } from '@/modules/invoice-archive/services/invoice-archive.service';

/**
 * Ingresa una factura al archivo: datos + imagen o PDF en un solo envío
 * `multipart/form-data`. Va en un Route Handler (no Server Action) por el
 * límite de 1 MB de cuerpo de las Server Actions. El formato real del archivo
 * se confirma por sus primeros bytes, no por lo que declara el navegador.
 */

const MAX_FILE_BYTES = 4 * 1024 * 1024; // bajo el tope de ~4,5 MB por solicitud de Vercel

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function field(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' ? value : undefined;
}

export async function POST(req: Request) {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('invoicearchive:write');
    companyId = session.companyId;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError('No se pudo leer el formulario', 400);
    }

    const totalRaw = field(form, 'totalAmount');
    const parsed = archivedInvoiceSchema.safeParse({
      supplierName: field(form, 'supplierName'),
      contactId: field(form, 'contactId'),
      invoiceNumber: field(form, 'invoiceNumber'),
      issueDate: field(form, 'issueDate'),
      totalAmount: totalRaw && totalRaw.trim() !== '' ? Number(totalRaw) : undefined,
      notes: field(form, 'notes'),
    });
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);

    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return jsonError('Adjunta la imagen o el PDF de la factura', 400);
    if (file.size > MAX_FILE_BYTES) return jsonError('El archivo supera los 4 MB. Prueba con una foto más liviana o un PDF comprimido.', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffCertificateType(bytes);
    if (!sniffed) return jsonError('Formato no admitido. Usa una foto JPG o PNG, o un PDF.', 400);

    const pathname = `invoice-archive/${session.companyId}/${crypto.randomUUID()}.${SNIFFED_CERTIFICATE_EXTENSION[sniffed]}`;
    const blob = await put(pathname, Buffer.from(bytes), { access: 'public', contentType: sniffed, addRandomSuffix: false });

    try {
      const invoice = await createArchivedInvoice(session.companyId, session.id, parsed.data, {
        url: blob.url,
        mimeType: sniffed,
        sizeBytes: bytes.byteLength,
      });
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'CREATE',
        entity: 'ArchivedInvoice',
        entityId: invoice.id,
        metadata: { supplier: invoice.supplierName, total: invoice.totalAmount },
      });
      return NextResponse.json({ success: true, data: { id: invoice.id, supplierKey: invoice.supplierKey } });
    } catch (error) {
      // La fila no se creó: el archivo recién subido quedaría huérfano.
      await del(blob.url).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    if (error instanceof TenantInactiveError) return jsonError(error.message, 403);
    captureException(error, { module: 'invoice-archive', companyId });
    return jsonError('No se pudo guardar la factura. Intenta de nuevo.', 500);
  }
}
