import { attendanceRate, consecutiveAbsences, monthKey, monthsBetween, pendingMonths } from '@/lib/academy/billing';

describe('meses adeudados', () => {
  it('cruza el cambio de año', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('un inicio posterior al mes actual no debe nada', () => {
    expect(monthsBetween('2026-12', '2026-10')).toEqual([]);
  });

  it('descuenta los meses pagados', () => {
    const start = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-10-15T12:00:00Z');
    expect(pendingMonths(start, ['2026-08', '2026-10'], now)).toEqual(['2026-09']);
    expect(monthKey(now)).toBe('2026-10');
  });
});

describe('asistencia', () => {
  it('la justificada no cuenta contra la alumna', () => {
    expect(attendanceRate(['PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED'])).toBe(67);
  });

  it('sin clases medibles no inventa un porcentaje', () => {
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate(['JUSTIFIED'])).toBeNull();
  });

  it('cuenta ausencias seguidas desde la última clase', () => {
    expect(consecutiveAbsences(['ABSENT', 'JUSTIFIED', 'ABSENT', 'PRESENT', 'ABSENT'])).toBe(2);
    expect(consecutiveAbsences(['PRESENT', 'ABSENT'])).toBe(0);
  });
});
