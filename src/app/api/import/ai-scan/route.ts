import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { scanInvoiceImages, type AllowedImageMimeType } from '@/modules/import/services/ai-scan.service';
import { ENTITY_WRITE_PERMISSION, MAX_AI_SCAN_IMAGES, MAX_AI_SCAN_IMAGE_BYTES } from '@/modules/import/schema';

/**
 * Escaneo de facturas/boletas en papel vía IA (Gemini 2.5 Flash, tier gratuito).
 *
 * Recibe uno o varios archivos de imagen y devuelve, por cada uno, una fila
 * candidata en el mismo formato que produce el import por Excel/CSV para
 * `historicalSales`/`historicalPurchases` — nada se guarda en la base de datos
 * acá. El usuario revisa/corrige en pantalla y confirma vía
 * `POST /api/import/commit-rows`, que reutiliza el mismo commit que el flujo de
 * planilla.
 *
 * Va en Route Handler, no Server Action, por el mismo límite de payload de 1 MB
 * que ya documenta `/api/import` — varias fotos de teléfono superan eso con
 * facilidad.
 */

const ALLOWED_TYPES: Record<string, AllowedImageMimeType> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('import:data');

    // El escaneo puede producir tanto filas de venta como de compra en el
    // mismo lote (fotos mezcladas de boletas emitidas y facturas recibidas),
    // así que se exige tener ambos permisos de escritura — evita que alguien
    // sin `purchases:write` reciba de todos modos filas de compra listas para
    // confirmar en otra pantalla.
    if (!can(session, ENTITY_WRITE_PERMISSION.historicalSales) || !can(session, ENTITY_WRITE_PERMISSION.historicalPurchases)) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para importar ventas y compras históricas' },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'Adjunta al menos una foto' }, { status: 400 });
    }
    if (files.length > MAX_AI_SCAN_IMAGES) {
      return NextResponse.json(
        { success: false, error: `Máximo ${MAX_AI_SCAN_IMAGES} fotos por envío. Sube el resto en otro lote` },
        { status: 400 }
      );
    }

    const images: Array<{ fileName: string; buffer: Buffer; mimeType: AllowedImageMimeType }> = [];
    for (const file of files) {
      const mimeType = ALLOWED_TYPES[file.type];
      if (!mimeType) {
        return NextResponse.json(
          { success: false, error: `"${file.name}": solo se aceptan imágenes JPG, PNG o WEBP` },
          { status: 400 }
        );
      }
      if (file.size === 0) {
        return NextResponse.json({ success: false, error: `"${file.name}" está vacío` }, { status: 400 });
      }
      if (file.size > MAX_AI_SCAN_IMAGE_BYTES) {
        return NextResponse.json({ success: false, error: `"${file.name}" supera los 5 MB` }, { status: 413 });
      }
      images.push({ fileName: file.name, buffer: Buffer.from(await file.arrayBuffer()), mimeType });
    }

    const rows = await scanInvoiceImages(session.companyId, images);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json(
        { success: false, error: 'Módulo no incluido en tu plan actual. Contacta al administrador para habilitarlo' },
        { status: 403 }
      );
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      console.error('AI scan misconfigured:', error);
      return NextResponse.json(
        { success: false, error: 'El escaneo por IA no está configurado en el servidor. Contacta al administrador' },
        { status: 503 }
      );
    }
    console.error('AI scan failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudieron escanear las imágenes' }, { status: 500 });
  }
}
