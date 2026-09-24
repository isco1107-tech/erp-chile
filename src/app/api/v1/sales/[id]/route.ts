import { prisma } from '@/lib/prisma';
import { ApiError, apiError, apiOk, authenticateApiRequest, type ApiContext } from '@/lib/api/public-api';
import { serializeSale } from '../serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'sales:read');
    const { id } = await params;
    const doc = await prisma.salesDocument.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { contact: { select: { id: true, rut: true, razonSocial: true } }, items: true },
    });
    if (!doc) throw new ApiError('Documento no encontrado', 404, 'not_found');
    return apiOk(serializeSale(doc));
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/sales/[id]', companyId: ctx?.companyId });
  }
}
