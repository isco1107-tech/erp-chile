import {
  acceleratedLifeMonths,
  annualSchedule,
  depreciationAt,
  depreciationForMonth,
  effectiveLifeMonths,
  monthsBetweenInclusive,
  type DepreciableAsset,
} from '@/lib/assets/depreciation';

const LAPTOP: DepreciableAsset = {
  acquisitionCost: 1_200_001,
  residualValue: 1,
  usefulLifeMonths: 72, // 6 años (equipos computacionales)
  method: 'LINEAL',
  depreciationStartDate: new Date('2026-01-10'),
};

describe('vida útil', () => {
  it('la acelerada es un tercio de la normal en años enteros', () => {
    expect(acceleratedLifeMonths(72)).toBe(24);
    expect(acceleratedLifeMonths(84)).toBe(24); // 7 años → 2
    expect(acceleratedLifeMonths(960)).toBe(26 * 12); // 80 años → 26
  });

  it('nunca baja de un año', () => {
    expect(acceleratedLifeMonths(24)).toBe(12);
  });

  it('los bienes que no se deprecian tienen vida 0', () => {
    expect(effectiveLifeMonths({ usefulLifeMonths: 600, method: 'SIN_DEPRECIACION' })).toBe(0);
  });
});

describe('depreciación lineal', () => {
  it('cuenta el mes de inicio como depreciado', () => {
    expect(monthsBetweenInclusive(new Date('2026-01-10'), new Date('2026-01-31'))).toBe(1);
    expect(monthsBetweenInclusive(new Date('2026-01-10'), new Date('2025-12-31'))).toBe(0);
  });

  it('deprecia la base (costo − residual) en cuotas iguales', () => {
    const state = depreciationAt(LAPTOP, new Date('2026-12-31'));
    expect(state.lifeMonths).toBe(72);
    expect(state.monthsDepreciated).toBe(12);
    expect(state.accumulated).toBe(200_000);
    expect(state.bookValue).toBe(1_000_001);
    expect(state.monthlyDepreciation).toBe(16_667);
  });

  it('al terminar la vida útil queda en el valor residual, ni un peso menos', () => {
    const state = depreciationAt(LAPTOP, new Date('2040-01-01'));
    expect(state.fullyDepreciated).toBe(true);
    expect(state.bookValue).toBe(1);
    expect(state.remainingMonths).toBe(0);
  });

  it('se detiene en la fecha de baja', () => {
    const disposed = depreciationAt({ ...LAPTOP, disposalDate: new Date('2026-06-15') }, new Date('2030-01-01'));
    expect(disposed.monthsDepreciated).toBe(6);
  });

  it('la suma de los meses cuadra al peso con el acumulado', () => {
    let total = 0;
    for (let i = 0; i < 72; i += 1) total += depreciationForMonth(LAPTOP, 2026 + Math.floor(i / 12), (i % 12) + 1);
    expect(total).toBe(1_200_000);
  });

  it('un bien que no se deprecia conserva su valor', () => {
    const land = depreciationAt({ ...LAPTOP, method: 'SIN_DEPRECIACION' }, new Date('2040-01-01'));
    expect(land.accumulated).toBe(0);
    expect(land.bookValue).toBe(LAPTOP.acquisitionCost);
  });
});

describe('calendario anual', () => {
  it('reparte la depreciación por año y termina en el residual', () => {
    const schedule = annualSchedule(LAPTOP);
    expect(schedule[0]).toMatchObject({ year: 2026, depreciation: 200_000 });
    expect(schedule[schedule.length - 1].bookValue).toBe(1);
    expect(schedule.reduce((s, r) => s + r.depreciation, 0)).toBe(1_200_000);
  });

  it('acelerada: termina en 2 años', () => {
    const schedule = annualSchedule({ ...LAPTOP, method: 'ACELERADA' });
    expect(schedule.map((r) => r.year)).toEqual([2026, 2027]);
  });
});
