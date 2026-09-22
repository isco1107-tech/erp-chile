import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { AuditAction } from '@prisma/client';
import { AuthError, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import * as auditService from '@/lib/services/audit.service';
import { buildAuditLogWorkbook } from '@/lib/services/audit-workbook.service';
import { captureException } from '@/lib/observability';

const AUDIT_ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'ISSUE_DTE', 'CANCEL_DTE', 'STOCK_ADJUSTMENT', 'EXPORT'];

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

const MAX_ROWS = 20000;

export async function GET(req: Request) {
  try {
    // El proxy no intercepta /api, así que la autorización tiene que vivir acá.
    const session = await requireAuthWithPermission('audit:read');

    const url = new URL(req.url);
    const rawFrom = url.searchParams.get('from');
    const rawTo = url.searchParams.get('to');

    let range = defaultRange();
    if (rawFrom && rawTo) {
      const parsed = rangeSchema.safeParse({ from: rawFrom, to: rawTo });
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Rango de fechas inválido' }, { status: 400 });
      }
      range = parsed.data;
    }
    if (range.from > range.to) {
      return NextResponse.json({ success: false, error: 'La fecha inicial es posterior a la final' }, { status: 400 });
    }
    // Incluye el día completo del extremo superior.
    range.to = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999);

    const rawAction = url.searchParams.get('action');
    const action = rawAction && AUDIT_ACTIONS.includes(rawAction as AuditAction) ? (rawAction as AuditAction) : undefined;
    const query = url.searchParams.get('query') ?? undefined;

    const logs = await auditService.listAuditLogs(session.companyId, { from: range.from, to: range.to, action, query }, MAX_ROWS);
    const buffer = await buildAuditLogWorkbook(logs, session.companyName);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'EXPORT',
      entity: 'AuditLog',
      entityId: 'excel',
      metadata: { from: range.from.toISOString(), to: range.to.toISOString(), filas: logs.length },
    });

    const stamp = range.to.toISOString().slice(0, 10);
    const filename = `Auditoria_${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    captureException(error, { module: 'audit' });
    return NextResponse.json({ success: false, error: 'No se pudo generar la bitácora' }, { status: 500 });
  }
}
