import { WAREHOUSE_PHOTO_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { receivePhoto } from '@/modules/warehouse-mobile/photo-upload';

/**
 * Sube la foto de respaldo de una salida de bodega (merma, mal estado,
 * degustación…). Basta el permiso de mover inventario: quien descuenta el stock
 * debe poder dejar la foto, aunque no pueda editar el catálogo. Va a su propia
 * carpeta, `inventory-evidence/{companyId}/`, y el movimiento solo acepta una
 * foto que esté ahí (ver `sync.service.ts`).
 */
export async function POST(req: Request) {
  return withBodegaAuth({ permission: 'inventory:write', limit: WAREHOUSE_PHOTO_RATE_LIMIT }, (context) => receivePhoto(req, `inventory-evidence/${context.companyId}`));
}
