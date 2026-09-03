import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { parsePromptToRows } from '@/modules/import/services/ai-prompt-import.service';
import { ENTITY_WRITE_PERMISSION, MAX_AI_PROMPT_CHARS } from '@/modules/import/schema';

/**
 * Interpreta un prompt de texto libre describiendo boletas/facturas/ventas y
 * devuelve filas candidatas en el mismo formato que produce el import por
 * Excel/CSV o el escaneo de fotos para `historicalSales`/`historicalPurchases`
 * — nada se guarda en la base de datos acá. El usuario revisa/corrige en
 * pantalla y confirma vía `POST /api/import/commit-rows`, el mismo commit que
 * usan los otros dos flujos.
 */

const bodySchema = z.object({
  text: z.string().trim().min(1, 'Escribe una descripción del documento').max(MAX_AI_PROMPT_CHARS, `El texto no puede superar ${MAX_AI_PROMPT_CHARS} caracteres`),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('import:data');

    // El prompt puede producir tanto filas de venta como de compra en el
    // mismo envío, igual que el escaneo de fotos: se exige tener ambos
    // permisos de escritura.
    if (!can(session, ENTITY_WRITE_PERMISSION.historicalSales) || !can(session, ENTITY_WRITE_PERMISSION.historicalPurchases)) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para importar ventas y compras históricas' },
        { status: 403 }
      );
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Texto no válido' }, { status: 400 });
    }

    const rows = await parsePromptToRows(session.companyId, parsed.data.text);
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
      console.error('AI prompt import misconfigured:', error);
      return NextResponse.json(
        { success: false, error: 'La importación por texto no está configurada en el servidor. Contacta al administrador' },
        { status: 503 }
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('AI prompt import failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo interpretar el texto' }, { status: 500 });
  }
}
