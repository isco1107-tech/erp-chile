import { requireAuthWithPermission, AuthError } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { syncRequestSchema, warehouseScope } from '@/lib/warehouse/contracts';
import { submitWarehouseOperation, operationOutcome } from '@/modules/inventory/services/warehouse-mobile.service';
import { assertWarehouseOrigin, assertWarehouseRate, warehouseBody, warehouseFailure, warehouseJson } from '@/modules/inventory/warehouse-http';

export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const context = await requireAuthWithPermission('inventory:operate');
    assertWarehouseOrigin(request);
    assertWarehouseRate(context.id);
    const input = syncRequestSchema.parse(await warehouseBody(request));
    if (input.expectedScope !== warehouseScope({ companyId: context.companyId, userId: context.id })) throw new AuthError('La empresa o la cuenta cambió. Vuelve a abrir tu bodega antes de sincronizar.', 403);
    const actor = { companyId: context.companyId, id: context.id, email: context.email, canReceive: context.permissions.includes('purchases:orders') };
    const outcomes = [];
    for (const operation of input.operations) outcomes.push(await submitWarehouseOperation(actor, operation));
    if (input.checkIds.length) {
      const saved = await prisma.warehouseOperation.findMany({ where: { companyId: context.companyId, createdById: context.id, operationId: { in: input.checkIds } } });
      const seen = new Set(outcomes.map((outcome) => outcome.id));
      outcomes.push(...saved.filter((row) => !seen.has(row.operationId)).map(operationOutcome));
    }
    if (outcomes.some((outcome) => outcome.status === 'APPLIED')) {
      revalidatePath('/dashboard/inventory'); revalidatePath('/dashboard/products'); revalidatePath('/dashboard/purchases/orders');
    }
    return warehouseJson({ outcomes });
  } catch (error) { return warehouseFailure(error); }
}
