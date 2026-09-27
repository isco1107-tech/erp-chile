import { posSaleSchema } from '@/modules/pos/schema';

/** COM-01: el terminal (PosTerminal.tsx) nunca envía unitPrice/discountPercent
 * por línea — el servidor los ignora y repriza siempre desde el catálogo — así
 * que exigirlos en el esquema rechazaba toda venta de mostrador antes de
 * llegar al servicio. */
describe('posSaleSchema acepta el payload real del terminal', () => {
  it('valida un carrito sin unitPrice ni discountPercent por línea', () => {
    const result = posSaleSchema.safeParse({
      items: [{ productId: 'p1', quantity: 2 }],
      paymentMethod: 'EFECTIVO',
      cashReceived: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('sigue rechazando un unitPrice negativo si alguien lo envía igual', () => {
    const result = posSaleSchema.safeParse({
      items: [{ productId: 'p1', quantity: 1, unitPrice: -10 }],
      paymentMethod: 'EFECTIVO',
      cashReceived: 5000,
    });
    expect(result.success).toBe(false);
  });
});
