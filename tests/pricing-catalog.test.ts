import { DEFAULT_FEATURES, MODULES, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { PRICED_MODULES, PRICING_PLANS, UNPRICED_FEATURES, INCLUDED_IN_BASE } from '@/lib/pricing/catalog';
import { buildModuleRequestEmail, moduleRequestSchema, quoteModuleRequest } from '@/lib/pricing/module-request';
import { MAX_WAREHOUSES, PLAN_NAMES, inferPlanName, PLAN_PRESETS, planListPrice, tenantListPrice } from '@/lib/pricing/presets';
import { buildQuote, comparePlan, isModuleContracted } from '@/lib/pricing/quote';

/**
 * Tarifario para clientes (Configuración → Planes y módulos). Estas pruebas
 * fijan que cada módulo vendible tenga precio, que los planes no inventen
 * módulos y que la cotización (que el servidor recalcula) no cobre dos veces.
 */

const NONE: CompanyFeatureFlags = { ...DEFAULT_FEATURES };
const withFeatures = (...keys: (keyof CompanyFeatureFlags)[]): CompanyFeatureFlags => ({
  ...NONE,
  ...Object.fromEntries(keys.map((k) => [k, true])),
});

describe('catálogo de precios', () => {
  it('todo módulo de CompanyFeatures está cotizado, incluido en la base o explícitamente sin precio', () => {
    const covered = new Set<string>([
      ...PRICED_MODULES.flatMap((m) => m.grants),
      ...INCLUDED_IN_BASE.flatMap((m) => m.grants),
      ...UNPRICED_FEATURES,
    ]);
    expect(MODULES.map((m) => m.key).filter((key) => !covered.has(key))).toEqual([]);
  });

  it('ids únicos y precios enteros positivos', () => {
    const ids = PRICED_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of PRICED_MODULES) {
      expect(Number.isInteger(m.price)).toBe(true);
      expect(m.price).toBeGreaterThan(0);
    }
  });

  it('ningún módulo se vende dos veces bajo ítems distintos', () => {
    const grants = PRICED_MODULES.flatMap((m) => m.grants);
    expect(new Set(grants).size).toBe(grants.length);
  });

  it('los planes solo referencian ítems que existen y el plan Total los trae todos', () => {
    const ids = new Set(PRICED_MODULES.map((m) => m.id));
    for (const plan of PRICING_PLANS) for (const id of plan.moduleIds) expect(ids.has(id)).toBe(true);
    expect(PRICING_PLANS.find((p) => p.id === 'total')!.moduleIds.length).toBe(PRICED_MODULES.length);
  });

  it('cada plan cuesta menos que comprar sus módulos por separado', () => {
    for (const plan of PRICING_PLANS) {
      const cmp = comparePlan(plan, NONE);
      expect(plan.price).toBeLessThan(cmp.separateTotal);
      expect(cmp.savings).toBeGreaterThan(0);
    }
  });

  it('ningún texto de cara al cliente trae costos internos', () => {
    const serialized = JSON.stringify({ PRICED_MODULES, PRICING_PLANS });
    expect(serialized).not.toMatch(/margen|costo variable|costo infra/i);
  });
});

describe('cotización', () => {
  it('suma módulos sueltos y calcula el IVA con redondeo estándar', () => {
    const quote = buildQuote(['pos', 'purchases'], null, NONE);
    expect(quote.net).toBe(9990 + 8990);
    expect(quote.iva).toBe(Math.round(quote.net * 0.19));
    expect(quote.total).toBe(quote.net + quote.iva);
  });

  it('no cobra lo que la empresa ya tiene ni ids repetidos o desconocidos', () => {
    const quote = buildQuote(['pos', 'pos', 'no-existe', 'treasury'], null, withFeatures('hasPos'));
    expect(quote.items.map((m) => m.id)).toEqual(['treasury']);
  });

  it('un ítem que activa dos módulos cuenta como contratado solo si tiene ambos', () => {
    const ticketing = PRICED_MODULES.find((m) => m.id === 'ticketing-voting')!;
    expect(isModuleContracted(ticketing, withFeatures('hasTicketing'))).toBe(false);
    expect(isModuleContracted(ticketing, withFeatures('hasTicketing', 'hasPublicVoting'))).toBe(true);
  });

  it('con un plan elegido cobra el plan y no vuelve a cobrar sus módulos', () => {
    const quote = buildQuote(['pos', 'accounting', 'payroll'], 'comercio', NONE);
    // pos ya viene en Comercio; accounting y payroll no.
    expect(quote.items.map((m) => m.id)).toEqual(['accounting', 'payroll']);
    expect(quote.net).toBe(32990 + 17990 + 12990);
  });

  it('un plan desconocido se ignora', () => {
    expect(buildQuote([], 'inventado', NONE).plan).toBeNull();
  });
});

describe('solicitud de contratación', () => {
  it('exige al menos un módulo o un plan', () => {
    expect(moduleRequestSchema.safeParse({ itemIds: [] }).success).toBe(false);
    expect(moduleRequestSchema.safeParse({ itemIds: [], planId: 'total' }).success).toBe(true);
    expect(moduleRequestSchema.safeParse({ itemIds: [], planId: 'inventado' }).success).toBe(false);
  });

  it('devuelve null cuando todo lo pedido ya está contratado', () => {
    const input = moduleRequestSchema.parse({ itemIds: ['pos'] });
    expect(quoteModuleRequest(input, withFeatures('hasPos'))).toBeNull();
  });

  it('el correo a ventas lleva el total recalculado y escapa el HTML', () => {
    const quote = buildQuote(['pos'], null, NONE);
    const email = buildModuleRequestEmail(
      quote,
      { businessName: '<b>Empresa</b> & Cía', rut: '76.123.456-7', userName: 'Ana', userEmail: 'ana@empresa.cl' },
      '<script>x</script>'
    );
    expect(email.text).toContain('Total mensual: $11.888');
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>Empresa</b>');
    expect(email.html).toContain('&lt;b&gt;Empresa&lt;/b&gt;');
  });
});

describe('planes al crear una empresa', () => {
  it('ofrece Base y los cuatro planes del presupuesto, en orden', () => {
    expect([...PLAN_NAMES]).toEqual(['Base', 'Comercio', 'Gestión', 'Eventos', 'Total']);
  });

  it('cada plan activa exactamente los módulos que muestra el tarifario, más la base', () => {
    for (const plan of PRICING_PLANS) {
      const preset = PLAN_PRESETS[plan.label]!;
      const expected = new Set<string>([
        ...INCLUDED_IN_BASE.flatMap((m) => m.grants),
        ...PRICED_MODULES.filter((m) => plan.moduleIds.includes(m.id)).flatMap((m) => m.grants),
      ]);
      const on = Object.entries(preset.features).filter(([, v]) => v).map(([k]) => k);
      expect(new Set(on)).toEqual(expected);
      expect(preset.maxUsers).toBe(plan.includedUsers);
    }
  });

  it('Base es solo inventario y costeo PMP con los usuarios de la plataforma base', () => {
    const on = Object.entries(PLAN_PRESETS.Base!.features).filter(([, v]) => v).map(([k]) => k).sort();
    expect(on).toEqual(['hasInventory', 'hasPmpCosting']);
    expect(PLAN_PRESETS.Base!.maxUsers).toBe(2);
    expect(PLAN_PRESETS.Base!.maxWarehouses).toBe(1);
  });

  it('solo los planes con Multibodega permiten más de una bodega, y nunca más de 5', () => {
    expect(MAX_WAREHOUSES).toBe(5);
    for (const preset of Object.values(PLAN_PRESETS)) {
      expect(preset.maxWarehouses).toBe(preset.features.hasMultipleWarehouses ? 5 : 1);
      expect(preset.maxWarehouses).toBeLessThanOrEqual(5);
    }
    expect(PLAN_PRESETS.Gestión!.maxWarehouses).toBe(5);
    expect(PLAN_PRESETS.Total!.maxWarehouses).toBe(5);
  });

  it('la plataforma rechaza más de 5 bodegas al crear y al editar', () => {
    const { companyPlanUpdateSchema } = jest.requireActual('@/modules/platform/schema') as typeof import('@/modules/platform/schema');
    const base = { planName: 'Total', maxUsers: 25, features: PLAN_PRESETS.Total!.features };
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWarehouses: 5 }).success).toBe(true);
    expect(companyPlanUpdateSchema.safeParse({ ...base, maxWarehouses: 6 }).success).toBe(false);
  });

  it('el precio de lista de una empresa suma plan, módulos extra y usuarios extra', () => {
    const features = { ...PLAN_PRESETS.Comercio!.features, hasAccounting: true };
    const price = tenantListPrice('Comercio', features, 5)!;
    expect(price.extras.map((m) => m.id)).toEqual(['accounting']);
    expect(price.extraUsers).toBe(2);
    expect(price.net).toBe(32990 + 17990 + 2 * 2990);
  });

  it('un plan anterior no tiene precio de lista inventado', () => {
    expect(planListPrice('Starter')).toBeNull();
    expect(tenantListPrice('Starter', PLAN_PRESETS.Base!.features, 3)).toBeNull();
  });

  it('informa los módulos del plan que la empresa tiene apagados sin rebajar el precio', () => {
    const features = { ...PLAN_PRESETS.Comercio!.features, hasPos: false };
    const price = tenantListPrice('Comercio', features, 3)!;
    expect(price.missingFromPlan.map((m) => m.id)).toEqual(['pos']);
    expect(price.net).toBe(32990);
  });
});

describe('retiro de la facturación electrónica y de las boletas de honorarios', () => {
  it('no se venden ni entran a ningún plan, y el catálogo no menciona al SII', () => {
    expect(PRICED_MODULES.flatMap((m) => m.grants)).not.toContain('hasDteBilling');
    expect(PRICED_MODULES.flatMap((m) => m.grants)).not.toContain('hasFeeDocuments');
    for (const preset of Object.values(PLAN_PRESETS)) {
      expect(preset.features.hasDteBilling).toBe(false);
      expect(preset.features.hasFeeDocuments).toBe(false);
    }
    expect(JSON.stringify({ PRICED_MODULES, PRICING_PLANS })).not.toMatch(/\bSII\b|\bDTE\b|facturaci[oó]n|honorario/i);
  });
});

describe('plan que le corresponde a una empresa existente', () => {
  it('con solo la base, Base', () => {
    expect(inferPlanName(PLAN_PRESETS.Base!.features, 2).planName).toBe('Base');
  });

  it('con exactamente los módulos de un plan, ese plan', () => {
    for (const name of ['Comercio', 'Gestión', 'Eventos', 'Total']) {
      const preset = PLAN_PRESETS[name]!;
      const fit = inferPlanName(preset.features, preset.maxUsers);
      expect(fit.planName).toBe(name);
      expect(fit.price.extras).toEqual([]);
    }
  });

  it('un plan con módulos que la empresa no tiene no califica: se cobraría lo que no usa', () => {
    const features = { ...PLAN_PRESETS.Comercio!.features, hasPurchases: false };
    // Comercio exige Compras; sin ellas queda Base + Punto de Venta suelto.
    const fit = inferPlanName(features, 3);
    expect(fit.planName).toBe('Base');
    expect(fit.price.extras.map((m) => m.id)).toEqual(['pos']);
  });

  it('elige el plan más barato contando extras: Comercio + un módulo vs. Gestión', () => {
    const features = { ...PLAN_PRESETS.Comercio!.features, hasAccounting: true };
    const fit = inferPlanName(features, 3);
    expect(fit.planName).toBe('Comercio');
    expect(fit.price.net).toBe(32990 + 17990);
  });

  it('entradas y votación cuentan como contratadas solo si están las dos', () => {
    const half = { ...PLAN_PRESETS.Base!.features, hasTicketing: true };
    expect(inferPlanName(half, 2).price.extras).toEqual([]);
    const both = { ...half, hasPublicVoting: true };
    expect(inferPlanName(both, 2).price.extras.map((m) => m.id)).toEqual(['ticketing-voting']);
  });
});
