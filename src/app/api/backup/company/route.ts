import { NextResponse } from 'next/server';
import {
  AuthError,
  ModuleNotEnabledError,
  TenantInactiveError,
  requireAuthWithPermission,
} from '@/lib/auth/guards';
import { createAuditLog, getRequestIp } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException, logger } from '@/lib/observability';
import { backupFileName, streamCompanyBackup, summarizeCompanyBackup } from '@/modules/backup/services/company-backup.service';

/**
 * Descarga del respaldo completo de la empresa en sesión.
 *
 * `GET  /api/backup/company` → descarga el archivo JSON.
 * `GET  /api/backup/company?resumen=1` → solo el conteo de filas por tabla,
 * para que la pantalla pueda decir "vas a descargar 48.203 registros" antes de
 * gatillar una descarga que puede tardar.
 *
 * Va en un Route Handler y no en una Server Action porque una Server Action
 * devuelve un valor serializado, no un archivo: acá la respuesta se emite en
 * streaming a medida que se lee la base (ver `streamCompanyBackup`).
 *
 * La empresa exportada es SIEMPRE la de la sesión (`session.companyId`), nunca
 * un id que venga en la query: ese es el aislamiento multi-tenant de esta ruta.
 */

// El respaldo lee la base entera del tenant; no puede servirse desde caché.
export const dynamic = 'force-dynamic';
// Un tenant grande tarda más que el default de 10 s de Vercel.
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('company:export');

    if (new URL(req.url).searchParams.get('resumen') === '1') {
      const summary = await summarizeCompanyBackup(session.companyId);
      return NextResponse.json({ success: true, data: summary });
    }

    const company = await prisma.company.findUnique({
      where: { id: session.companyId },
      select: { id: true, businessName: true, rut: true },
    });
    if (!company) {
      return NextResponse.json({ success: false, error: 'La empresa no existe' }, { status: 404 });
    }

    // La auditoría se escribe ANTES de empezar a emitir: una vez que la
    // respuesta arrancó ya no se puede cambiar el código de estado, y el
    // registro de "quién se llevó los datos" es justamente lo que no puede
    // perderse si la descarga se corta a la mitad.
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'Company',
      entityId: session.companyId,
      metadata: { scope: 'respaldo-completo' },
      ipAddress: await getRequestIp(),
    });

    const encoder = new TextEncoder();
    const chunks = streamCompanyBackup(session.companyId);

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await chunks.next();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(value));
        } catch (error) {
          // El cliente recibirá un JSON truncado: es inevitable una vez que la
          // respuesta empezó. Lo que sí se puede es dejar registro del motivo,
          // que antes se perdía por completo.
          captureException(error, {
            module: 'backup',
            companyId: session.companyId,
            userId: session.id,
          });
          controller.error(error);
        }
      },
      cancel(reason) {
        // El usuario cerró la pestaña o canceló la descarga: no es un error.
        logger.info('Descarga de respaldo cancelada por el cliente', {
          module: 'backup',
          companyId: session.companyId,
          reason: String(reason),
        });
        void chunks.return(undefined);
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backupFileName(company)}"`,
        // Sin esto algunos proxies intentan bufferear la respuesta completa,
        // que es justo lo que el streaming evita.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    captureException(error, { module: 'backup' });
    return NextResponse.json({ success: false, error: 'No se pudo generar el respaldo' }, { status: 500 });
  }
}
