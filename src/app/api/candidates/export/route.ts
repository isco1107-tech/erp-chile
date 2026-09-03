import { NextResponse } from 'next/server';
import type { CandidateStatus } from '@prisma/client';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { buildCandidateApplicationsWorkbook } from '@/modules/candidates/services/export.service';

/**
 * Exporta las postulaciones filtradas a Excel (Sección 6). Va en Route
 * Handler, no Server Action, para poder devolver el binario directamente
 * (mismo motivo que `judging/export`). Requiere `candidates:sensitive`: un
 * export en bloque de RUT/email/teléfono es, en esencia, el mismo dato de
 * contacto que esa ficha individual — no tiene sentido bloquear la ficha y
 * dejar el CSV masivo abierto con solo `candidates:read`.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuthWithPermission('candidates:sensitive');

    const url = new URL(req.url);
    const filters = {
      projectId: url.searchParams.get('projectId') || undefined,
      status: (url.searchParams.get('status') as CandidateStatus | null) || undefined,
      comuna: url.searchParams.get('comuna') || undefined,
      minAge: url.searchParams.get('minAge') ? Number(url.searchParams.get('minAge')) : undefined,
      maxAge: url.searchParams.get('maxAge') ? Number(url.searchParams.get('maxAge')) : undefined,
      search: url.searchParams.get('search') || undefined,
    };

    const buffer = await buildCandidateApplicationsWorkbook(session.companyId, filters);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'Candidate',
      entityId: filters.projectId ?? 'all',
      metadata: { filters },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="postulaciones.xlsx"',
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
    console.error('Candidate export failed:', error);
    return NextResponse.json({ success: false, error: 'No se pudo generar el archivo' }, { status: 500 });
  }
}
