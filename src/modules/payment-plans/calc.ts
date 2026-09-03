import type { PAYMENT_PLAN_FREQUENCIES } from './schema';

/**
 * Reparte `totalAmount` entre `installmentCount` cuotas sin perder ni inventar
 * un peso por redondeo — método del resto mayor, mismo criterio que
 * `distributeIva` en `src/modules/sales/calc.ts`. Sin dependencias de Prisma
 * a propósito: se importa tanto desde el servicio (servidor) como desde el
 * preview del formulario (cliente).
 */
export function distributeInstallmentAmounts(totalAmount: number, installmentCount: number): number[] {
  const base = Math.floor(totalAmount / installmentCount);
  let remainder = totalAmount - base * installmentCount;

  const amounts = new Array<number>(installmentCount).fill(base);
  // El resto (siempre < installmentCount) se reparte de a 1 peso en las
  // primeras cuotas, hasta agotarlo.
  for (let i = 0; i < installmentCount && remainder > 0; i++) {
    amounts[i]! += 1;
    remainder--;
  }
  return amounts;
}

/** Vencimiento de la cuota `index` (0-based) a partir de `startDate`, según la frecuencia del plan. */
export function computeDueDate(startDate: Date, frequency: (typeof PAYMENT_PLAN_FREQUENCIES)[number], index: number): Date {
  const date = new Date(startDate);
  if (index === 0) return date;

  if (frequency === 'WEEKLY') {
    date.setDate(date.getDate() + 7 * index);
  } else if (frequency === 'BIWEEKLY') {
    date.setDate(date.getDate() + 14 * index);
  } else {
    date.setMonth(date.getMonth() + index);
  }
  return date;
}
