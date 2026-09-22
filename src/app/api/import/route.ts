import { NextResponse } from 'next/server';
import {
  AuthError,
  ModuleNotEnabledError,
  TenantInactiveError,
  can,
  requireAuthWithPermission,
} from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { buildPreview, commitImport } from '@/modules/import/services/import.service';
import { ENTITY_WRITE_PERMISSION, importEntitySchema, type ImportEntity } from '@/modules/import/schema';

/** Nombre de modelo para la bitácora de auditoría. */
const AUDIT_ENTITY_NAME: Record<ImportEntity, string> = {
  products: 'Product',
  contacts: 'Contact',
  stock: 'Stock',
  historicalSales: 'SalesDocument',
  historicalPurchases: 'PurchaseDocument',
};

/**
 * Importación masiva.
 *
 * Va en un Route Handler y no en una Server Action porque las acciones tienen
 * un límite de cuerpo de 1 MB: una planilla de mil productos lo supera con
 * facilidad y fallaría con un error opaco. Acá el archivo llega como multipart.
 *
 * El archivo se sube dos veces (vista previa y confirmación) a propósito: el
 * commit re-parsea y re-valida desde el archivo en vez de confiar en lo que el
 * navegador diga que vio, así que el archivo es siempre la única fuente.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await requireAuthWithPermission('import:data');

    const form = await req.formData();
    const mode = String(form.get('mode') ?? 'preview');
    const rawEntity = String(form.get('entity') ?? '');
    const file = form.get('file');

    const parsedEntity = importEntitySchema.safeParse(rawEntity);
    if (!parsedEntity.success) {
      return NextResponse.json({ success: false, error: 'Tipo de importación no válido' }, { status: 400 });
    }
    const entity = parsedEntity.data;

    // Importar crea registros: además del permiso de importación, exige el de
    // escritura de la entidad, que a su vez depende del módulo contratado.
    if (!can(session, ENTITY_WRITE_PERMISSION[entity])) {
      return NextResponse.json(
        { success: false, error: 'No tienes permiso para crear registros de este tipo' },
        { status: 403 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Adjunte un archivo .xlsx o .csv' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo está vacío' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'El archivo supera los 5 MB. Divídelo en partes más pequeñas' },
        { status: 413 }
      );
    }

    const payload = { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) };

    if (mode === 'preview') {
      const preview = await buildPreview(session.companyId, entity, payload);
      return NextResponse.json({ success: true, data: preview });
    }

    if (mode === 'commit') {
      const result = await commitImport(session.companyId, entity, payload);
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'CREATE',
        entity: AUDIT_ENTITY_NAME[entity],
        entityId: 'import',
        metadata: { archivo: file.name, creados: result.created, fallidos: result.failedRows?.length ?? 0, tipo: entity },
      });
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({ success: false, error: 'Modo no válido' }, { status: 400 });
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
    // Los errores de parseo y validación son mensajes de negocio pensados para
    // el usuario ("faltan columnas", "12 filas con errores"), no fallos internos.
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    captureException(error, { module: 'import' });
    return NextResponse.json({ success: false, error: 'No se pudo procesar el archivo' }, { status: 500 });
  }
}
