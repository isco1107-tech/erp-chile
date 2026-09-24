import { prisma } from '@/lib/prisma';
import { apiError, apiOk, authenticateApiRequest, pagination, type ApiContext } from '@/lib/api/public-api';

export const dynamic = 'force-dynamic';

/** Documentos de venta emitidos con saldo pendiente (cuentas por cobrar). Filtro opcional `?contactId=`. */
export async function GET(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'treasury:read');
    const url = new URL(req.url);
    const { skip, take, page, pageSize } = pagination(url);
    const contactId = url.searchParams.get('contactId') ?? undefined;
    const where = {
      companyId: ctx.companyId,
      status: 'ISSUED' as const,
      paymentStatus: { not: 'PAID' as const },
      dteType: { notIn: ['COTIZACION' as const, 'GUIA_DESPACHO_52' as const, 'NOTA_CREDITO_61' as const] },
      ...(contactId ? { contactId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.salesDocument.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
        select: { id: true, dteType: true, folio: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, contact: { select: { id: true, rut: true, razonSocial: true } } },
      }),
      prisma.salesDocument.count({ where }),
    ]);
    const now = Date.now();
    return apiOk(
      rows.map((row) => ({
        ...row,
        pendingAmount: row.totalAmount - row.paidAmount,
        overdueDays: row.dueDate && row.dueDate.getTime() < now ? Math.floor((now - row.dueDate.getTime()) / 86_400_000) : 0,
      })),
      { meta: { page, pageSize, total } }
    );
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/receivables', companyId: ctx?.companyId });
  }
}
