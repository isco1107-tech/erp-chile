import {
  MAX_SERIES_SESSIONS,
  assignLanes,
  addDays,
  blockPosition,
  daysBetween,
  durationLabel,
  expandWeekly,
  gridRange,
  hourRangeFor,
  isIsoDay,
  isValidTimeRange,
  longDate,
  monthGrid,
  monthTitle,
  rollState,
  shiftMonth,
  startOfWeek,
  weekDays,
  weekTitle,
  weekdayIndex,
} from '@/lib/academy/calendar';

describe('fechas', () => {
  it('rechaza días que no existen', () => {
    expect(isIsoDay('2026-10-09')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('9-10-2026')).toBe(false);
  });

  it('la semana parte el lunes', () => {
    // 2026-10-09 es viernes.
    expect(weekdayIndex('2026-10-09')).toBe(4);
    expect(startOfWeek('2026-10-09')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(weekDays('2026-10-09')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
  });

  it('desplaza el mes sin saltarse el cambio de año', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 14)).toBe('2027-12');
    expect(shiftMonth('2026-10', -10)).toBe('2025-12');
  });

  it('escribe las fechas en español', () => {
    expect(monthTitle('2026-10')).toBe('octubre 2026');
    expect(longDate('2026-10-11')).toBe('domingo 11 de octubre');
    expect(weekTitle('2026-10-09')).toBe('5 – 11 de octubre 2026');
    expect(weekTitle('2026-09-30')).toBe('28 de septiembre – 4 de octubre 2026');
  });
});

describe('grilla del mes', () => {
  it('octubre 2026 ocupa 5 semanas completas de lunes a domingo', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]!.iso).toBe('2026-09-28');
    expect(weeks[4]![6]!.iso).toBe('2026-11-01');
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('febrero que empieza lunes y tiene 28 días ocupa solo 4 semanas', () => {
    // Febrero 2027 parte lunes y termina domingo.
    expect(monthGrid('2027-02')).toHaveLength(4);
  });

  it('un mes puede ocupar 6 semanas', () => {
    // Agosto 2026 parte sábado y tiene 31 días.
    expect(monthGrid('2026-08')).toHaveLength(6);
  });

  it('el rango pedido al servidor cubre los días de los meses vecinos', () => {
    expect(gridRange('2026-10')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
  });
});

describe('horas', () => {
  it('la clase termina después de empezar', () => {
    expect(isValidTimeRange('10:00', '12:00')).toBe(true);
    expect(isValidTimeRange('12:00', '12:00')).toBe(false);
    expect(isValidTimeRange('12:00', '10:00')).toBe(false);
    expect(isValidTimeRange('24:00', '25:00')).toBe(false);
    expect(isValidTimeRange('9:00', '10:00')).toBe(false);
  });

  it('describe la duración', () => {
    expect(durationLabel('10:00', '12:00')).toBe('2 h');
    expect(durationLabel('10:00', '11:30')).toBe('1 h 30 min');
    expect(durationLabel('10:00', '10:45')).toBe('45 min');
  });

  it('la franja horaria crece si hay una clase fuera del horario de siempre', () => {
    expect(hourRangeFor([])).toEqual({ startHour: 8, endHour: 21 });
    expect(hourRangeFor([{ startTime: '10:00', endTime: '12:00' }])).toEqual({ startHour: 8, endHour: 21 });
    expect(hourRangeFor([{ startTime: '06:30', endTime: '07:30' }, { startTime: '20:00', endTime: '22:15' }])).toEqual({ startHour: 6, endHour: 23 });
  });

  it('ubica la clase dentro de la franja', () => {
    const range = { startHour: 8, endHour: 20 }; // 12 horas
    expect(blockPosition('08:00', '14:00', range)).toEqual({ top: 0, height: 50 });
    expect(blockPosition('10:00', '11:00', range).top).toBeCloseTo(16.67, 1);
    expect(blockPosition('10:00', '11:00', range).height).toBeCloseTo(8.33, 1);
  });
});

describe('repetir cada semana', () => {
  it('sin repetición es solo el día elegido', () => {
    expect(expandWeekly('2026-10-10', null)).toEqual(['2026-10-10']);
  });

  it('cada sábado durante 4 semanas', () => {
    expect(expandWeekly('2026-10-10', { weeks: 4, weekdays: [5] })).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
  });

  it('sin días elegidos repite el día de la fecha de inicio', () => {
    expect(expandWeekly('2026-10-10', { weeks: 2, weekdays: [] })).toEqual(['2026-10-10', '2026-10-17']);
  });

  it('dos días por semana, sin fechas anteriores al inicio', () => {
    // Inicio miércoles 7: el lunes de esa semana ya pasó y no se crea.
    expect(expandWeekly('2026-10-07', { weeks: 2, weekdays: [0, 2] })).toEqual(['2026-10-07', '2026-10-12', '2026-10-14']);
  });

  it('el día de inicio siempre entra aunque no esté entre los elegidos', () => {
    expect(expandWeekly('2026-10-07', { weeks: 1, weekdays: [4] })).toEqual(['2026-10-07', '2026-10-09']);
  });

  it('cruza el cambio de año y de horario sin correr fechas', () => {
    expect(expandWeekly('2026-12-26', { weeks: 3, weekdays: [5] })).toEqual(['2026-12-26', '2027-01-02', '2027-01-09']);
  });

  it('corta en el tope de clases por vez', () => {
    const dates = expandWeekly('2026-10-05', { weeks: 52, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    expect(dates).toHaveLength(MAX_SERIES_SESSIONS);
    expect(dates[0]).toBe('2026-10-05');
  });
});

describe('estado de la lista de una clase', () => {
  const base = { isCancelled: false, date: '2026-10-09', today: '2026-10-09' };

  it('una clase cancelada no pide lista', () => {
    expect(rollState({ ...base, isCancelled: true, tally: { expected: 10, marked: 0 } })).toBe('cancelled');
  });

  it('una clase futura aún no se pasa', () => {
    expect(rollState({ ...base, date: '2026-10-10', tally: { expected: 10, marked: 0 } })).toBe('upcoming');
  });

  it('distingue pendiente, a medias y completa', () => {
    expect(rollState({ ...base, tally: { expected: 10, marked: 0 } })).toBe('pending');
    expect(rollState({ ...base, tally: { expected: 10, marked: 4 } })).toBe('partial');
    expect(rollState({ ...base, tally: { expected: 10, marked: 10 } })).toBe('done');
  });

  it('un grupo sin alumnas activas no queda como pendiente para siempre', () => {
    expect(rollState({ ...base, date: '2026-10-01', tally: { expected: 0, marked: 0 } })).toBe('empty');
  });
});

describe('clases que se encima en la vista semanal', () => {
  const at = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime });

  it('una clase sola ocupa el ancho completo', () => {
    expect(assignLanes([at('a', '10:00', '12:00')]).get('a')).toEqual({ lane: 0, lanes: 1 });
  });

  it('dos grupos a la misma hora van lado a lado', () => {
    const lanes = assignLanes([at('a', '10:00', '12:00'), at('b', '10:30', '11:30')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('clases seguidas, sin encimarse, no se achican', () => {
    const lanes = assignLanes([at('a', '10:00', '11:00'), at('b', '11:00', '12:00')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get('b')).toEqual({ lane: 0, lanes: 1 });
  });

  it('reutiliza la columna libre y solo achica a las que de verdad coinciden', () => {
    // a(10-12) y b(10-11) se encima; c(11-12) cabe en la columna de b; d(14-15) está aparte.
    const lanes = assignLanes([at('a', '10:00', '12:00'), at('b', '10:00', '11:00'), at('c', '11:00', '12:00'), at('d', '14:00', '15:00')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});
