import { requireAuthWithPermission, AuthError } from '@/lib/auth/guards';
import { reviewRequestSchema } from '@/lib/warehouse/contracts';
import { reviewWarehouseOperation } from '@/modules/inventory/services/warehouse-mobile.service';
import { assertWarehouseOrigin, warehouseBody, warehouseFailure, warehouseJson } from '@/modules/inventory/warehouse-http';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuthWithPermission('inventory:approve');
    assertWarehouseOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const input = reviewRequestSchema.parse(await warehouseBody(request));
    if (input.unitCost !== undefined && !context.permissions.includes('products:costs')) throw new AuthError('Necesitas permiso para confirmar costos de ingreso', 403);
    const outcome = await reviewWarehouseOperation({ companyId: context.companyId, id: context.id, email: context.email, canReceive: context.permissions.includes('purchases:orders') }, id, input);
    revalidatePath('/dashboard/inventory'); revalidatePath('/dashboard/products');
    return warehouseJson({ outcome });
  } catch (error) { return warehouseFailure(error); }
}
