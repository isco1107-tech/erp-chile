import { WAREHOUSE_PHOTO_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { receivePhoto } from '@/modules/warehouse-mobile/photo-upload';

/**
 * Sube la foto con la que se da de alta un producto nuevo desde el celular.
 * El prefijo `products/{companyId}/` es el mismo de las fotos del catálogo, y el
 * alta lo exige al guardar el producto (ver `sync.service.ts`).
 */
export async function POST(req: Request) {
  return withBodegaAuth({ permission: 'products:write', limit: WAREHOUSE_PHOTO_RATE_LIMIT }, (context) => receivePhoto(req, `products/${context.companyId}`));
}
