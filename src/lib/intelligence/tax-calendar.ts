import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';

/**
 * Calendario de obligaciones tributarias y previsionales recurrentes.
 *
 * Fechas de referencia (verificar cambios anuales en sii.cl y previred.com):
 *  - F29 (IVA, PPM, retenciones): día 20 del mes siguiente para quien emite
 *    facturas electrónicas y declara por internet; día 12 en otro caso.
 *  - Cotizaciones previsionales (Previred): día 13 si se pagan por internet.
 *  - Operación Renta (F22): hasta el 30 de abril.
 *  - Patente municipal: cuotas hasta fin de enero y fin de julio.
 *
 * Si el vencimiento cae sábado o domingo se corre al lunes siguiente. Los
 * feriados legales no se modelan: la fecha mostrada es la máxima posible,
 * nunca una posterior a la real salvo por un feriado.
 */

export interface TaxObligation {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  daysLeft: number;
  kind: 'tax' | 'payroll' | 'municipal';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function monthName(month: number): string {
  return MONTH_NAMES[(month - 1 + 12) % 12];
}

/** Corre un vencimiento de fin de semana al lunes siguiente. */
function nextBusinessDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const shift = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  const shifted = new Date(Date.UTC(year, month - 1, day + shift));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * Próximo vencimiento mensual en `day`: el de este mes si todavía no pasa
 * (comparando contra el día ya corrido a hábil), si no el del mes siguiente.
 */
function nextMonthly(today: { year: number; month: number; day: number }, day: number) {
  const thisMonth = nextBusinessDay(today.year, today.month, day);
  const sameMonth = thisMonth.year === today.year && thisMonth.month === today.month;
  if (!sameMonth || thisMonth.day >= today.day) {
    return { due: thisMonth, periodMonth: addMonths(today.year, today.month, -1) };
  }
  const next = addMonths(today.year, today.month, 1);
  return { due: nextBusinessDay(next.year, next.month, day), periodMonth: { year: today.year, month: today.month } };
}

export function upcomingTaxObligations(
  now: Date,
  options: { hasPayroll: boolean; electronicInvoicing: boolean; withholdsHonorarium?: boolean }
): TaxObligation[] {
  const today = santiagoDateParts(now);
  const todayStart = santiagoMidnightUtc(today.year, today.month, today.day);
  const obligations: TaxObligation[] = [];

  const push = (id: string, title: string, description: string, due: { year: number; month: number; day: number }, kind: TaxObligation['kind']) => {
    const dueDate = santiagoMidnightUtc(due.year, due.month, due.day);
    obligations.push({ id, title, description, dueDate, kind, daysLeft: Math.round((dueDate.getTime() - todayStart.getTime()) / DAY_MS) });
  };

  const f29Day = options.electronicInvoicing ? 20 : 12;
  const f29 = nextMonthly(today, f29Day);
  push(
    'f29',
    `F29 de ${monthName(f29.periodMonth.month)}`,
    `Declaración y pago de IVA y PPM${options.withholdsHonorarium ? ', más retenciones de honorarios' : ''} del período ${monthName(f29.periodMonth.month)} ${f29.periodMonth.year}.`,
    f29.due,
    'tax'
  );

  if (options.hasPayroll) {
    const previred = nextMonthly(today, 13);
    push(
      'previred',
      `Cotizaciones de ${monthName(previred.periodMonth.month)}`,
      'Pago de AFP, salud, seguro de cesantía, SIS y mutual en Previred (pago electrónico).',
      previred.due,
      'payroll'
    );
  }

  const rentaYear = today.month > 4 || (today.month === 4 && today.day > 30) ? today.year + 1 : today.year;
  push('f22', `Operación Renta ${rentaYear}`, `Formulario 22 con los resultados del año comercial ${rentaYear - 1}.`, nextBusinessDay(rentaYear, 4, 30), 'tax');

  const patenteMonth = today.month <= 1 ? { year: today.year, month: 1 } : today.month <= 7 ? { year: today.year, month: 7 } : { year: today.year + 1, month: 1 };
  const patenteLastDay = new Date(Date.UTC(patenteMonth.year, patenteMonth.month, 0)).getUTCDate();
  push(
    'patente',
    `Patente municipal (${patenteMonth.month === 1 ? '1ª' : '2ª'} cuota)`,
    'Pago semestral de la patente comercial en tu municipalidad.',
    nextBusinessDay(patenteMonth.year, patenteMonth.month, patenteLastDay),
    'municipal'
  );

  return obligations.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
