import {
  contractPeriodNet,
  dueDateFor,
  isBillingDue,
  monthlyRecurringRevenue,
  nextBillingDate,
  periodKeyFor,
  periodLabel,
} from '@/lib/services/recurring-billing';
import { firstUpcomingBillingDate } from '@/modules/contracts/services/contracts.service';
import { parseSantiagoDateInput, santiagoDateParts, santiagoMidnightUtc, toSantiagoDateInput } from '@/lib/chile/timezone';
import { serviceContractSchema } from '@/modules/contracts/schema';

/**
 * Facturación recurrente: si una de estas fechas se corre, un cliente recibe
 * dos facturas en un mes o ninguna. Todo se razona en el calendario de
 * Santiago, no en UTC.
 */

const d = (year: number, month: number, day: number) => santiagoMidnightUtc(year, month, day);
const parts = (date: Date) => santiagoDateParts(date);

describe('medianoche en Santiago los días de cambio de hora', () => {
  it('fin del horario de verano (abril): la medianoche cae en la fecha pedida, no a las 23:00 del día anterior', () => {
    const midnight = santiagoMidnightUtc(2026, 4, 5);
    expect(parts(midnight)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(parts(new Date(midnight.getTime() - 1))).toEqual({ year: 2026, month: 4, day: 4 });
  });

  it('inicio del horario de verano (septiembre): el día empieza en la fecha correcta', () => {
    const start = santiagoMidnightUtc(2026, 9, 6);
    expect(parts(start)).toEqual({ year: 2026, month: 9, day: 6 });
    expect(parts(new Date(start.getTime() - 1))).toEqual({ year: 2026, month: 9, day: 5 });
  });

  it('cualquier día del año es la medianoche exacta de esa fecha', () => {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 5, 15, 28]) {
        const midnight = santiagoMidnightUtc(2026, month, day);
        expect(parts(midnight)).toEqual({ year: 2026, month, day });
        expect(parts(new Date(midnight.getTime() - 1)).day).not.toBe(day);
      }
    }
  });
});

describe('próxima fecha de facturación', () => {
  it('mensual avanza un mes conservando el día', () => {
    expect(parts(nextBillingDate(d(2026, 3, 5), 'MONTHLY', d(2026, 1, 5)))).toEqual({ year: 2026, month: 4, day: 5 });
  });

  it('un contrato del 31 se factura el último día de febrero y vuelve al 31 en marzo', () => {
    const anchor = d(2026, 1, 31);
    const feb = nextBillingDate(anchor, 'MONTHLY', anchor);
    expect(parts(feb)).toEqual({ year: 2026, month: 2, day: 28 });
    const mar = nextBillingDate(feb, 'MONTHLY', anchor);
    expect(parts(mar)).toEqual({ year: 2026, month: 3, day: 31 });
  });

  it('trimestral, semestral y anual saltan los meses correctos y cruzan de año', () => {
    const anchor = d(2026, 11, 15);
    expect(parts(nextBillingDate(anchor, 'QUARTERLY', anchor))).toEqual({ year: 2027, month: 2, day: 15 });
    expect(parts(nextBillingDate(anchor, 'SEMIANNUAL', anchor))).toEqual({ year: 2027, month: 5, day: 15 });
    expect(parts(nextBillingDate(anchor, 'ANNUAL', anchor))).toEqual({ year: 2027, month: 11, day: 15 });
    expect(parts(nextBillingDate(anchor, 'BIMONTHLY', anchor))).toEqual({ year: 2027, month: 1, day: 15 });
  });

  it('un contrato con inicio en el pasado no factura en bloque los períodos atrasados', () => {
    const start = d(2025, 6, 10);
    const today = d(2026, 9, 23);
    const first = firstUpcomingBillingDate(start, 'MONTHLY', today);
    expect(parts(first)).toEqual({ year: 2026, month: 10, day: 10 });
    expect(first.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });

  it('si el inicio es futuro, la primera factura es el mismo día de inicio', () => {
    const start = d(2026, 12, 1);
    expect(firstUpcomingBillingDate(start, 'MONTHLY', d(2026, 9, 23)).getTime()).toBe(start.getTime());
  });
});

describe('período facturado', () => {
  it('la llave es año-mes en Santiago (llave de idempotencia)', () => {
    expect(periodKeyFor(d(2026, 9, 1))).toBe('2026-09');
    expect(periodKeyFor(d(2027, 1, 31))).toBe('2027-01');
  });

  it('la glosa muestra el rango cuando el período abarca varios meses', () => {
    expect(periodLabel(d(2026, 9, 1), 'MONTHLY')).toBe('septiembre 2026');
    expect(periodLabel(d(2026, 10, 1), 'QUARTERLY')).toBe('octubre–diciembre 2026');
    expect(periodLabel(d(2026, 11, 1), 'QUARTERLY')).toBe('noviembre 2026–enero 2027');
  });
});

describe('¿toca facturar?', () => {
  const now = d(2026, 9, 23);
  it('solo contratos activos, con fecha alcanzada y dentro de su vigencia', () => {
    expect(isBillingDue({ status: 'ACTIVE', nextBillingDate: d(2026, 9, 1), endDate: null }, now)).toBe(true);
    expect(isBillingDue({ status: 'PAUSED', nextBillingDate: d(2026, 9, 1), endDate: null }, now)).toBe(false);
    expect(isBillingDue({ status: 'ACTIVE', nextBillingDate: d(2026, 10, 1), endDate: null }, now)).toBe(false);
    expect(isBillingDue({ status: 'ACTIVE', nextBillingDate: d(2026, 9, 1), endDate: d(2026, 8, 31) }, now)).toBe(false);
  });
});

describe('montos', () => {
  const lines = [
    { quantity: 1, unitPrice: 450_000 },
    { quantity: 2.5, unitPrice: 18_333 },
  ];

  it('el neto por período se redondea por línea a pesos enteros', () => {
    expect(contractPeriodNet(lines)).toBe(450_000 + Math.round(2.5 * 18_333));
  });

  it('el ingreso mensual recurrente normaliza por la frecuencia', () => {
    expect(monthlyRecurringRevenue([{ quantity: 1, unitPrice: 1_200_000 }], 'ANNUAL')).toBe(100_000);
    expect(monthlyRecurringRevenue([{ quantity: 1, unitPrice: 300_000 }], 'QUARTERLY')).toBe(100_000);
    expect(monthlyRecurringRevenue([{ quantity: 1, unitPrice: 100_000 }], 'MONTHLY')).toBe(100_000);
  });

  it('el vencimiento suma los días de plazo', () => {
    const issued = d(2026, 9, 1);
    expect(dueDateFor(issued, 30).getTime() - issued.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(dueDateFor(issued, -5).getTime()).toBe(issued.getTime());
  });
});

describe('fechas de formulario en hora de Santiago', () => {
  it('"YYYY-MM-DD" es la medianoche de ese día en Santiago, no en UTC', () => {
    const date = parseSantiagoDateInput('2026-04-05');
    expect(date).not.toBeNull();
    expect(parts(date!)).toEqual({ year: 2026, month: 4, day: 5 });
    expect(date!.getTime()).toBe(d(2026, 4, 5).getTime());
  });

  it('rechaza fechas inexistentes o mal formadas', () => {
    expect(parseSantiagoDateInput('2026-02-30')).toBeNull();
    expect(parseSantiagoDateInput('05/04/2026')).toBeNull();
    expect(parseSantiagoDateInput('')).toBeNull();
  });

  it('ida y vuelta con el input de fecha, incluso el día que cambia la hora', () => {
    for (const value of ['2026-04-05', '2026-09-06', '2026-01-01', '2026-12-31']) {
      expect(toSantiagoDateInput(parseSantiagoDateInput(value)!)).toBe(value);
    }
  });

  it('el esquema del contrato deja inicio y término en el día correcto', () => {
    const parsed = serviceContractSchema.safeParse({
      contactId: 'c1',
      name: 'Mantención',
      dteType: 'FACTURA_33',
      startDate: '2026-04-05',
      endDate: '2026-04-05',
      lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parts(parsed.data.startDate)).toEqual({ year: 2026, month: 4, day: 5 });
      expect(parsed.data.endDate?.getTime()).toBe(parsed.data.startDate.getTime());
    }
  });
});
