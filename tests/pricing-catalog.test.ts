import { MODULE_KEYS } from '@/lib/auth/modules';
import {
  CORE_PRICE_UF,
  MODULE_PRICES,
  PACKAGES,
  PACKAGE_NAMES,
  formatUf,
  looseTotalUf,
  packageFeatureFlags,
  sellableModules,
} from '@/lib/pricing/catalog';

describe('catálogo de precios', () => {
  it('todo módulo del sistema tiene precio', () => {
    for (const key of MODULE_KEYS) expect(MODULE_PRICES[key]).toBeDefined();
  });

  it('la facturación electrónica no se ofrece mientras no exista el envío al SII', () => {
    expect(MODULE_PRICES.hasDteBilling.sellable).toBe(false);
    expect(sellableModules()).not.toContain('hasDteBilling');
    for (const name of PACKAGE_NAMES) expect(PACKAGES[name].modules).not.toContain('hasDteBilling');
  });

  it('cada paquete cuesta entre 25% y 36% menos que sus módulos sueltos', () => {
    for (const name of PACKAGE_NAMES.filter((n) => n !== 'Core')) {
      const ratio = PACKAGES[name].priceUf / looseTotalUf(name);
      expect(ratio).toBeGreaterThan(0.64);
      expect(ratio).toBeLessThan(0.75);
    }
  });

  it('el Core vale lo mismo suelto y como paquete', () => {
    expect(PACKAGES.Core.priceUf).toBe(CORE_PRICE_UF);
    expect(looseTotalUf('Core')).toBe(CORE_PRICE_UF);
  });

  it('los flags del paquete encienden el Core y solo lo contratado', () => {
    const core = packageFeatureFlags('Core');
    expect(core.hasInventory && core.hasPurchases && core.hasTeamTasks).toBe(true);
    expect(core.hasAccounting).toBe(false);
    expect(packageFeatureFlags('Completo').hasAccounting).toBe(true);
    expect(packageFeatureFlags('Gestión').hasAccounting).toBe(false);
    expect(Object.keys(core).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it('formatea la UF con coma decimal', () => {
    expect(formatUf(2.2)).toBe('2,2 UF');
    expect(formatUf(0.86)).toBe('0,86 UF');
    expect(formatUf(3.95)).toBe('3,95 UF');
  });
});
