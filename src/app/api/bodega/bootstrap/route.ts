import { can } from '@/lib/auth/guards';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { UNITS } from '@/modules/inventory/schema';
import { MAX_OPS_PER_BATCH } from '@/modules/warehouse-mobile/schema';
import { fail, ok, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { listCategoryOptions, listSupplierOptions, listWarehouseOptions } from '@/modules/warehouse-mobile/services/catalog.service';
import { visionAvailable } from '@/modules/warehouse-mobile/services/identify.service';
import { MAX_PHOTO_BYTES } from '@/modules/warehouse-mobile/photo';
import type { BootstrapResponse } from '@/modules/warehouse-mobile/types';

/**
 * Lo que la app necesita al abrir: quién es, qué bodegas hay y qué puede hacer.
 * También sirve de "ping autenticado": si responde 200, hay sesión y señal.
 */
export async function GET() {
  return withBodegaAuth({ permission: 'products:read' }, async (context) => {
    const canMove = can(context, 'inventory:write');
    const [warehouses, categories, suppliers] = await Promise.all([
      listWarehouseOptions(context.companyId),
      listCategoryOptions(context.companyId),
      // Elegir de quién llega la mercadería es parte de recibirla: no depende de poder ver Contactos.
      canMove ? listSupplierOptions(context.companyId) : Promise.resolve([]),
    ]);
    if (warehouses.length === 0) return fail('La empresa no tiene bodegas creadas. Pide a un administrador que cree una.', 409);
    const data: BootstrapResponse = {
      user: { id: context.id, name: context.name, roleLabel: context.customRoleName ?? ROLE_LABELS[context.role] },
      company: { id: context.companyId, name: context.companyName },
      warehouses,
      categories,
      suppliers,
      units: [...UNITS],
      can: {
        move: canMove,
        createProduct: can(context, 'products:write') && can(context, 'inventory:write'),
        seeCosts: can(context, 'products:costs'),
      },
      ai: { enabled: visionAvailable() },
      limits: { maxOpsPerBatch: MAX_OPS_PER_BATCH, maxPhotoBytes: MAX_PHOTO_BYTES },
    };
    return ok(data, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}
