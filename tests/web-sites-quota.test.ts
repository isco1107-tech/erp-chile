/**
 * Cupo de sitios web de una empresa (src/lib/web-sites/quota.ts): lo fija la
 * Supersuite con `limites.ajustar`/`sitiosMax`, cuentan los sitios no archivados
 * y nunca queda "sin límite".
 */
import { DEFAULT_MAX_WEB_SITES, MAX_WEB_SITES_CEILING } from '@/lib/web-sites/constants';
import { quotaReachedMessage, siteQuota } from '@/lib/web-sites/quota';
import { companyCreateSchema, companyPlanUpdateSchema } from '@/modules/platform/schema';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';

describe('siteQuota', () => {
  it('calcula lo usado, lo que queda y si llegó al tope', () => {
    expect(siteQuota(3, 10)).toEqual({ used: 3, max: 10, remaining: 7, reached: false });
    expect(siteQuota(10, 10)).toEqual({ used: 10, max: 10, remaining: 0, reached: true });
  });

  it('una empresa que ya tenía más sitios que su nuevo tope sigue con sus sitios y solo queda sin cupo', () => {
    expect(siteQuota(12, 5)).toEqual({ used: 12, max: 5, remaining: 0, reached: true });
  });

  it('sin tope conocido rige el de siempre, nunca "sin límite"', () => {
    for (const max of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(siteQuota(1, max as number | null | undefined).max).toBe(DEFAULT_MAX_WEB_SITES);
    }
    expect(DEFAULT_MAX_WEB_SITES).toBe(30);
  });

  it('un tope de 0 deja la cuenta sin cupo (la Supersuite exige al menos 1, pero el cálculo no se rompe)', () => {
    expect(siteQuota(0, 0)).toMatchObject({ remaining: 0, reached: true });
  });

  it('el mensaje dice cuántos sitios incluye la cuenta y qué hacer, en singular y plural', () => {
    expect(quotaReachedMessage({ max: 1 })).toContain('1 sitio activo');
    expect(quotaReachedMessage({ max: 5 })).toContain('5 sitios activos');
    expect(quotaReachedMessage({ max: 5 })).toMatch(/Archiva o elimina/);
  });
});

describe('el tope en el esquema de la plataforma', () => {
  const base = { planName: 'Base', maxUsers: 2, maxWarehouses: 1, features: DEFAULT_FEATURES };

  it('es opcional (quien no habla de sitios no lo toca) pero, si viene, va de 1 al techo', () => {
    expect(companyPlanUpdateSchema.safeParse(base).success).toBe(true);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWebSites: 1 }).success).toBe(true);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWebSites: MAX_WEB_SITES_CEILING }).success).toBe(true);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWebSites: 0 }).success).toBe(false);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWebSites: MAX_WEB_SITES_CEILING + 1 }).success).toBe(false);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWebSites: 2.5 }).success).toBe(false);
  });

  it('al crear una empresa también es opcional y con el mismo rango', () => {
    const create = { rut: '76.123.456-0', businessName: 'X SpA', planName: 'Base', maxUsers: 2, maxWarehouses: 1, status: 'ACTIVE', features: DEFAULT_FEATURES, adminName: 'Ana', adminEmail: 'ana@x.cl' };
    // El RUT de prueba puede no validar: lo que importa es que el error nunca sea el del tope.
    const issues = (extra: object) => companyCreateSchema.safeParse({ ...create, ...extra }).error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(issues({})).not.toContain('maxWebSites');
    expect(issues({ maxWebSites: 10 })).not.toContain('maxWebSites');
    expect(issues({ maxWebSites: 0 })).toContain('maxWebSites');
  });
});
