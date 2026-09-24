import { prisma } from '@/lib/prisma';
import { apiError, apiOk, authenticateApiRequest } from '@/lib/api/public-api';

export const dynamic = 'force-dynamic';

/** Verifica la llave: devuelve la empresa y los permisos que tiene. Útil para probar la conexión. */
export async function GET(req: Request) {
  try {
    const ctx = await authenticateApiRequest(req, null);
    const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { businessName: true, rut: true } });
    return apiOk({ company: { name: company?.businessName ?? null, rut: company?.rut ?? null }, scopes: ctx.scopes });
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/me' });
  }
}
