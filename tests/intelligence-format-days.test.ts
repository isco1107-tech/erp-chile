import { formatDays } from '@/lib/intelligence/format';

describe('formatDays', () => {
  /** El CRM mostraba "Ciclo de venta: -0 días" al redondear una mediana negativa chica. */
  it('nunca muestra "-0 días"', () => {
    expect(formatDays(-0.3)).toBe('0 días');
  });

  it('singular y sin dato', () => {
    expect(formatDays(1)).toBe('1 día');
    expect(formatDays(12.4)).toBe('12 días');
    expect(formatDays(null)).toBe('—');
  });
});
