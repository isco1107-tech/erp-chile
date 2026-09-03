import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { commitHistoricalRows } from '@/modules/import/services/import.service';
import { ENTITY_WRITE_PERMISSION } from '@/modules/import/schema';

/** Nombre de modelo para la bitácora, mismo criterio que `/api/import`. */
const AUDIT_ENTITY_NAME: Record<'stock' | 'historicalSales' | 'historicalPurchases', string> = {
  stock: 'Stock',
  historicalSales: 'SalesDocument',
  historicalPurchases: 'PurchaseDocument',
};

/**
 * Confirma la inserción de filas ya revisadas por el usuario en pantalla —
 * el paso final compartido tanto por el asistente de fotos (`ai-scan`) como
 * por la vista previa editable de `stock`/`historicalSales`/`historicalPurchases`
 * cargada desde Excel/CSV. No recibe un archivo: recibe las filas tal como
 * quedaron después de que el usuario las corrigió, y las vuelve a validar por
 * completo contra la base de datos antes de insertar (la vista previa del
 * navegador nunca es la fuente de verdad).
 */

const itemSchema = z.object({
  localId: z.string(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().int(),
  productId: z.string().nullable(),
  productLabel: z.string().nullable(),
});

const rowSchema = z.object({
  rowNumber: z.number().int(),
  values: z.record(z.string(), z.string()),
  errors: z.array(z.object({ column: z.string(), message: z.string() })),
  items: z.array(itemSchema).optional(),
});

const bodySchema = z.object({
  entity: z.enum(['stock', 'historicalSales', 'historicalPurchases']),
  rows: z.array(rowSchema).min(1, 'No hay filas para importar'),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('import:data');

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos de la solicitud no válidos' }, { status: 400 });
    }
    const { entity, rows } = parsed.data;

    if (!can(session, ENTITY_WRITE_PERMISSION[entity])) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para crear registros de este tipo' },
        { status: 403 }
      );
    }

    const result = await commitHistoricalRows(session.companyId, entity, rows);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: AUDIT_ENTITY_NAME[entity],
      entityId: 'import',
      metadata: {
        tipo: entity,
        creados: result.created,
        fallidos: result.failedRows?.length ?? 0,
      },
    });

    return NextResponse.json({ success: true, data: result });
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
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Commit rows failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo procesar la importación' }, { status: 500 });
  }
}
