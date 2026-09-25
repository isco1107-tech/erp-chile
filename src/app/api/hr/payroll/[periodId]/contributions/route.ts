import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { buildContributionsWorkbook } from '@/modules/hr/services/payroll.service';

/**
 * Planilla de cotizaciones del período (resumen por institución + detalle). El proxy no intercepta /api:
 * la autorización vive aquí, con el mismo permiso que ver las liquidaciones.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const { buffer, filename } = await buildContributionsWorkbook(session.companyId, periodId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'PayrollPeriod',
      entityId: periodId,
      metadata: { file: 'contributions' },
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual. Contacta al administrador para habilitarlo' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof Error && error.message.startsWith('El período no existe')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith('El período aún no tiene')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    captureException(error, { module: 'remuneraciones', extra: { periodId } });
    return NextResponse.json({ success: false, error: 'No se pudo generar la planilla de cotizaciones' }, { status: 500 });
  }
}
