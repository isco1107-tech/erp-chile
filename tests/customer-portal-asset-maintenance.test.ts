import { hashPortalToken, isPortalTokenShape, newPortalToken } from '@/lib/security/portal-token';
import { maintenanceSchema } from '@/modules/fixed-assets/schema';

/**
 * Ola 6 · Portal de clientes (enlace sin cuenta, guardado como hash) y
 * bitácora de mantenciones del activo fijo.
 */

describe('Enlace del portal de clientes', () => {
  it('genera tokens largos, aleatorios y con forma de URL', () => {
    const a = newPortalToken();
    const b = newPortalToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isPortalTokenShape(a)).toBe(true);
  });

  it('guarda solo el hash: el mismo token da el mismo hash y no se puede invertir', () => {
    const token = newPortalToken();
    expect(hashPortalToken(token)).toBe(hashPortalToken(token));
    expect(hashPortalToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPortalToken(token)).not.toContain(token);
  });

  it('descarta formas inválidas antes de consultar la base', () => {
    expect(isPortalTokenShape('corto')).toBe(false);
    expect(isPortalTokenShape("x'; DROP TABLE \"Contact\"; --aaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isPortalTokenShape('a'.repeat(65))).toBe(false);
  });
});

describe('Mantenciones de activo fijo', () => {
  const base = { date: '2026-09-10', kind: 'PREVENTIVE' as const, description: 'Cambio de filtros', cost: 45_000 };

  it('acepta una mantención con próxima fecha posterior', () => {
    expect(maintenanceSchema.safeParse({ ...base, nextDueDate: '2027-03-10', provider: 'Clima Sur' }).success).toBe(true);
    expect(maintenanceSchema.safeParse({ ...base, nextDueDate: '' }).success).toBe(true);
  });

  it('rechaza una próxima mantención que no es posterior, costos con decimales o descripciones vacías', () => {
    expect(maintenanceSchema.safeParse({ ...base, nextDueDate: '2026-09-10' }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, cost: 10.5 }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, description: 'x' }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, kind: 'OTRA' }).success).toBe(false);
  });
});
