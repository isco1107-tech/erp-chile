import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Conexión con Hermes (lógica pura). Hermes es la agenda del ecosistema Aether; con esta llave su
 * caja consulta el catálogo con stock de UNA bodega y registra ventas de productos (boleta, mismo
 * camino del POS y la tienda en línea). La llave identifica a la empresa: nunca se acepta un
 * `companyId` del cuerpo. En la base solo vive su SHA-256 (se muestra una sola vez).
 */

export const HERMES_KEY_PREFIX = 'hk_';

/** Llave nueva: `hk_` + 32 bytes aleatorios en base64url (256 bits). */
export function generateHermesKey(): string {
  return `${HERMES_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashHermesKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex');
}

/** Lo que se muestra en pantalla para reconocerla sin revelarla. */
export function hermesKeyPrefix(key: string): string {
  return key.trim().slice(0, HERMES_KEY_PREFIX.length + 6);
}

/** `Authorization: Bearer hk_…` → la llave, o null si no tiene la forma esperada. */
export function readHermesKey(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(hk_[A-Za-z0-9_-]{20,80})\s*$/i.exec(authorization);
  return match?.[1] ?? null;
}

/** Medios de pago que Hermes puede informar (los mismos de la tienda en línea). */
export const HERMES_PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO'] as const;

/** Venta desde la caja de Hermes: del cuerpo solo viajan producto y cantidad, jamás un precio. */
export const hermesSaleSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8, 'Falta la clave de idempotencia').max(120),
    paymentMethod: z.enum(HERMES_PAYMENT_METHODS),
    items: z
      .array(z.object({ productId: z.string().trim().min(1).max(40), quantity: z.number().int('La cantidad va en unidades enteras').min(1).max(999) }).strict())
      .min(1, 'Agrega al menos un producto')
      .max(30, 'Máximo 30 productos por venta'),
  })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, { message: 'Un producto aparece dos veces: junta las cantidades' });
export type HermesSaleInput = z.infer<typeof hermesSaleSchema>;

export const hermesProductQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/** Boleta exenta solo si TODOS los productos son exentos; si no, boleta afecta (las líneas exentas van con IndExe). */
export function boletaTypeFor(items: readonly { isExempt: boolean }[]): 'BOLETA_39' | 'BOLETA_EXENTA_41' {
  return items.length > 0 && items.every((i) => i.isExempt) ? 'BOLETA_EXENTA_41' : 'BOLETA_39';
}
