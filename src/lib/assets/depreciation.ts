/**
 * Depreciación de activo fijo. Pura y determinística: no se persiste mes a
 * mes, se recalcula desde costo, fecha de inicio y vida útil.
 *
 * Convenciones:
 *  - Método lineal: (costo − valor residual) / vida útil en meses.
 *  - Acelerada (art. 31 N°5 bis LIR): un tercio de la vida útil normal,
 *    expresada en años enteros despreciando la fracción, mínimo 1 año.
 *  - El mes en que parte la depreciación cuenta completo; al darse de baja,
 *    se deprecia hasta el mes de la baja inclusive.
 *  - Los montos finales se redondean a pesos enteros; la cuota mensual se
 *    lleva con decimales para no arrastrar error de redondeo mes a mes.
 */

export type DepreciationMethodKey = 'LINEAL' | 'ACELERADA' | 'SIN_DEPRECIACION';

export interface DepreciableAsset {
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: DepreciationMethodKey;
  depreciationStartDate: Date;
  disposalDate?: Date | null;
}

export interface DepreciationState {
  lifeMonths: number;
  monthlyDepreciation: number;
  monthsDepreciated: number;
  accumulated: number;
  bookValue: number;
  remainingMonths: number;
  fullyDepreciated: boolean;
}

/**
 * Tabla de referencia de vida útil (años) basada en la tabla del SII
 * (Resolución Ex. N° 43 de 2002). Verifica la vigente en sii.cl: es una
 * ayuda para precargar el formulario, no una fuente oficial.
 */
export const USEFUL_LIFE_PRESETS: ReadonlyArray<{ category: string; normalYears: number | null }> = [
  { category: 'Equipos computacionales y periféricos', normalYears: 6 },
  { category: 'Muebles y enseres', normalYears: 7 },
  { category: 'Útiles de oficina', normalYears: 3 },
  { category: 'Automóviles, camionetas y jeeps', normalYears: 7 },
  { category: 'Camiones de uso general', normalYears: 7 },
  { category: 'Motos', normalYears: 3 },
  { category: 'Maquinarias y equipos en general', normalYears: 15 },
  { category: 'Herramientas pesadas', normalYears: 8 },
  { category: 'Herramientas livianas', normalYears: 3 },
  { category: 'Instalaciones (eléctricas, sanitarias, gas)', normalYears: 10 },
  { category: 'Galpones de madera o estructura metálica', normalYears: 20 },
  { category: 'Edificios de ladrillo u hormigón armado', normalYears: 50 },
  { category: 'Construcciones de acero u hormigón armado', normalYears: 80 },
  { category: 'Terrenos (no se deprecian)', normalYears: null },
];

export function acceleratedLifeMonths(normalLifeMonths: number): number {
  const normalYears = Math.floor(normalLifeMonths / 12);
  return Math.max(1, Math.floor(normalYears / 3)) * 12;
}

export function effectiveLifeMonths(asset: Pick<DepreciableAsset, 'usefulLifeMonths' | 'method'>): number {
  if (asset.method === 'SIN_DEPRECIACION') return 0;
  if (asset.method === 'ACELERADA') return acceleratedLifeMonths(asset.usefulLifeMonths);
  return Math.max(1, asset.usefulLifeMonths);
}

/** Meses calendario desde el mes de inicio hasta el mes de `asOf`, ambos inclusive (0 si aún no parte). */
export function monthsBetweenInclusive(start: Date, asOf: Date): number {
  const diff = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - start.getUTCMonth());
  return diff < 0 ? 0 : diff + 1;
}

export function depreciationAt(asset: DepreciableAsset, asOf: Date): DepreciationState {
  const lifeMonths = effectiveLifeMonths(asset);
  const base = Math.max(0, asset.acquisitionCost - asset.residualValue);
  if (lifeMonths === 0 || base === 0) {
    return { lifeMonths, monthlyDepreciation: 0, monthsDepreciated: 0, accumulated: 0, bookValue: asset.acquisitionCost, remainingMonths: 0, fullyDepreciated: false };
  }
  const cutoff = asset.disposalDate && asset.disposalDate < asOf ? asset.disposalDate : asOf;
  const months = Math.min(lifeMonths, monthsBetweenInclusive(asset.depreciationStartDate, cutoff));
  const monthly = base / lifeMonths;
  const accumulated = months >= lifeMonths ? base : Math.round(monthly * months);
  return {
    lifeMonths,
    monthlyDepreciation: Math.round(monthly),
    monthsDepreciated: months,
    accumulated,
    bookValue: asset.acquisitionCost - accumulated,
    remainingMonths: lifeMonths - months,
    fullyDepreciated: months >= lifeMonths,
  };
}

/**
 * Depreciación que corresponde exactamente a UN mes calendario: la diferencia
 * del acumulado entre el cierre de ese mes y el del mes anterior. Así la suma
 * de todos los meses cuadra al peso con el acumulado, sin error de redondeo.
 */
export function depreciationForMonth(asset: DepreciableAsset, year: number, month: number): number {
  const endOfMonth = new Date(Date.UTC(year, month - 1, 15));
  const endOfPrevious = new Date(Date.UTC(year, month - 2, 15));
  return depreciationAt(asset, endOfMonth).accumulated - depreciationAt(asset, endOfPrevious).accumulated;
}

export interface ScheduleRow {
  year: number;
  depreciation: number;
  accumulated: number;
  bookValue: number;
}

/** Calendario anual de depreciación, desde el año de inicio hasta completar la vida útil (o la baja). */
export function annualSchedule(asset: DepreciableAsset): ScheduleRow[] {
  const lifeMonths = effectiveLifeMonths(asset);
  if (lifeMonths === 0) return [];
  const startYear = asset.depreciationStartDate.getUTCFullYear();
  const endDate = new Date(Date.UTC(startYear, asset.depreciationStartDate.getUTCMonth() + lifeMonths - 1, 15));
  const lastYear = asset.disposalDate && asset.disposalDate < endDate ? asset.disposalDate.getUTCFullYear() : endDate.getUTCFullYear();
  const rows: ScheduleRow[] = [];
  let previous = 0;
  for (let year = startYear; year <= lastYear; year += 1) {
    const state = depreciationAt(asset, new Date(Date.UTC(year, 11, 15)));
    rows.push({ year, depreciation: state.accumulated - previous, accumulated: state.accumulated, bookValue: state.bookValue });
    previous = state.accumulated;
  }
  return rows;
}
