import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { messageFilterSchema } from '@/modules/web-sites/schema';
import { buildMessagesWorkbook } from '@/modules/web-sites/services/messages-export.service';

/**
 * Exporta la bandeja de formularios a Excel (de un sitio o de toda la
 * empresa). Route Handler (no Server Action) para devolver el binario
 * directo, mismo criterio que `crm/export`. Los filtros llegan por query
 * string y pasan por el mismo Zod que la bandeja. Los datos son personales:
 * cada descarga queda en la bitácora.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('websites:read');
    const url = new URL(req.url);
    const read = (key: string) => url.searchParams.get(key) || undefined;
    const parsed = messageFilterSchema.safeParse({
      siteId: read('siteId'),
      formId: read('formId'),
      purpose: read('purpose'),
      destination: read('destination'),
      tag: read('tag'),
      status: read('status'),
      q: read('q'),
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Filtros inválidos' }, { status: 400 });

    const buffer = await buildMessagesWorkbook(session.companyId, parsed.data);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'WebSiteMessage',
      entityId: parsed.data.siteId ?? 'all',
      metadata: { filters: parsed.data },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="formularios-sitios-web.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    captureException(error, { module: 'sitios-web', extra: { reason: 'messages-export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
