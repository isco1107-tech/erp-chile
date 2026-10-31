import { boletaTypeFor, generateHermesKey, hashHermesKey, hermesKeyPrefix, hermesSaleSchema, readHermesKey } from '@/lib/hermes/link';

describe('conexión con Hermes (pura)', () => {
  it('genera llaves distintas, con prefijo, y solo guarda su hash', () => {
    const a = generateHermesKey();
    const b = generateHermesKey();
    expect(a).not.toBe(b);
    expect(a.startsWith('hk_')).toBe(true);
    expect(hashHermesKey(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashHermesKey(` ${a} `)).toBe(hashHermesKey(a));
    expect(hermesKeyPrefix(a)).toHaveLength(9);
  });

  it('lee la llave solo desde un Bearer con la forma esperada', () => {
    const key = generateHermesKey();
    expect(readHermesKey(`Bearer ${key}`)).toBe(key);
    expect(readHermesKey(`bearer ${key}`)).toBe(key);
    expect(readHermesKey('Bearer otra-cosa')).toBeNull();
    expect(readHermesKey(null)).toBeNull();
  });

  it('la venta no acepta precios ni productos repetidos', () => {
    const ok = { idempotencyKey: 'hermes-venta-1', paymentMethod: 'EFECTIVO', items: [{ productId: 'p1', quantity: 2 }] };
    expect(hermesSaleSchema.safeParse(ok).success).toBe(true);
    expect(hermesSaleSchema.safeParse({ ...ok, items: [{ productId: 'p1', quantity: 2, unitPrice: 1 }] }).success).toBe(false);
    expect(hermesSaleSchema.safeParse({ ...ok, companyId: 'otra' }).success).toBe(false);
    expect(hermesSaleSchema.safeParse({ ...ok, items: [{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 1 }] }).success).toBe(false);
    expect(hermesSaleSchema.safeParse({ ...ok, items: [{ productId: 'p1', quantity: 1.5 }] }).success).toBe(false);
  });

  it('boleta exenta solo si todo es exento', () => {
    expect(boletaTypeFor([{ isExempt: true }, { isExempt: true }])).toBe('BOLETA_EXENTA_41');
    expect(boletaTypeFor([{ isExempt: true }, { isExempt: false }])).toBe('BOLETA_39');
    expect(boletaTypeFor([{ isExempt: false }])).toBe('BOLETA_39');
  });
});
