import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { pipelineFiltersSchema } from '@/modules/crm/schema';
import { buildOpportunitiesWorkbook } from '@/modules/crm/services/export.service';

/**
 * Exporta el embudo comercial a Excel. Route Handler (no Server Action) para
 * devolver el binario directo, mismo criterio que `candidates/export`. Los
 * filtros llegan por query string y pasan por el mismo Zod que el tablero.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('crm:read');
    const url = new URL(req.url);
    const parsed = pipelineFiltersSchema.safeParse({
      mine: url.searchParams.get('mine') === '1' ? true : undefined,
      dealType: url.searchParams.get('dealType') || undefined,
      projectId: url.searchParams.get('projectId') || undefined,
      priority: url.searchParams.get('priority') || undefined,
      tag: url.searchParams.get('tag') || undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Filtros inválidos' }, { status: 400 });

    const filters = { ...parsed.data, ownerUserId: parsed.data.mine ? session.id : undefined };
    const buffer = await buildOpportunitiesWorkbook(session.companyId, filters);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'Opportunity',
      entityId: 'all',
      metadata: { filters: parsed.data },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="oportunidades-crm.xlsx"',
        'Cache-Control': 'no-store',
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
    captureException(error, { module: 'crm', extra: { reason: 'export' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
