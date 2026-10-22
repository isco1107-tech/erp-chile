import { prisma } from '@/lib/prisma';
import type { AppliedOpResult, RecentOp } from '../types';

/** Lo último que aplicó esta persona desde la app, para el inicio y para revisar "¿ya lo subí?". */
export async function listRecentOps(companyId: string, userId: string, limit = 30): Promise<RecentOp[]> {
  const rows = await prisma.warehouseMobileOp.findMany({
    where: { companyId, userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { clientOpId: true, result: true, createdAt: true },
  });
  return rows.flatMap((row) => {
    const result = row.result as Partial<AppliedOpResult> | null;
    // Una fila reclamada pero sin resultado no debería existir (se deshace junto con el movimiento).
    if (!result?.mode || !result.name) return [];
    return [
      {
        clientOpId: row.clientOpId,
        mode: result.mode,
        name: result.name,
        sku: result.sku ?? '',
        unit: result.unit ?? 'UN',
        quantity: result.quantity ?? 0,
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}
