import { prisma } from '@/lib/prisma';
import { visionBudgetFromEnv, visionEnabledFromEnv, type VisionBudgetConfig } from '@/lib/warehouse-mobile/budget';
import { visionConfigured } from './vision.service';
import type { AppliedOpResult } from '../types';

/**
 * Lo que ve un administrador sobre el uso de la app del bodeguero: si la
 * identificación por foto está disponible, cuánto se ha usado y quién la usa.
 * Todo sale de las tablas de la propia empresa (nunca de otra).
 */

export interface MobileOverview {
  vision: {
    status: 'ok' | 'disabled' | 'not-configured';
    usedLast24h: number;
    limits: VisionBudgetConfig;
  };
  activity: {
    days: number;
    total: number;
    createdProducts: number;
    byUser: Array<{ userId: string; name: string; count: number; lastAt: string }>;
  };
  /** Productos que el bodeguero dio de alta desde el celular, para completarles precio y categoría. */
  recentProducts: Array<{ productId: string; sku: string; name: string; createdAt: string; missingPrice: boolean }>;
}

const ACTIVITY_DAYS = 7;
const MAX_OPS_SCANNED = 3000;

export async function getMobileOverview(companyId: string): Promise<MobileOverview> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60_000);
  const [ops, usedLast24h] = await Promise.all([
    prisma.warehouseMobileOp.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: { userId: true, kind: true, result: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_OPS_SCANNED,
    }),
    prisma.productPhotoScan.count({ where: { companyId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
  ]);

  const perUser = new Map<string, { count: number; lastAt: Date }>();
  const created: Array<{ productId: string; createdAt: Date }> = [];
  for (const op of ops) {
    const key = op.userId ?? 'desconocido';
    const entry = perUser.get(key);
    if (entry) entry.count++;
    else perUser.set(key, { count: 1, lastAt: op.createdAt });
    const result = op.result as Partial<AppliedOpResult> | null;
    if (op.kind === 'CREATE_PRODUCT' && result?.createdProduct && result.productId) created.push({ productId: result.productId, createdAt: op.createdAt });
  }

  const userIds = [...perUser.keys()].filter((id) => id !== 'desconocido');
  const users = userIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  const products = created.length > 0 ? await prisma.product.findMany({ where: { companyId, id: { in: created.slice(0, 20).map((entry) => entry.productId) } }, select: { id: true, sku: true, name: true, netPrice: true } }) : [];
  const byId = new Map(products.map((product) => [product.id, product]));

  return {
    vision: {
      status: !visionEnabledFromEnv() ? 'disabled' : visionConfigured() ? 'ok' : 'not-configured',
      usedLast24h,
      limits: visionBudgetFromEnv(),
    },
    activity: {
      days: ACTIVITY_DAYS,
      total: ops.length,
      createdProducts: created.length,
      byUser: [...perUser.entries()]
        .map(([userId, entry]) => ({ userId, name: names.get(userId) ?? 'Usuario', count: entry.count, lastAt: entry.lastAt.toISOString() }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    recentProducts: created
      .slice(0, 20)
      .flatMap((entry) => {
        const product = byId.get(entry.productId);
        return product ? [{ productId: product.id, sku: product.sku, name: product.name, createdAt: entry.createdAt.toISOString(), missingPrice: product.netPrice === 0 }] : [];
      })
      .slice(0, 8),
  };
}
