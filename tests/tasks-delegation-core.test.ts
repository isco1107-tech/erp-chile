import type { Role } from '@prisma/client';
import { nextDueDate, isOverdue } from '@/lib/tasks/recurrence';
import { evaluateDelegation, delegatedDecisionCount, type DelegationRuleLike } from '@/lib/tasks/delegation';
import { STARTER_TASKS } from '@/lib/tasks/starter';
import { delegationRuleSchema, taskSchema } from '@/modules/tasks/schema';

const rule = (overrides: Partial<DelegationRuleLike> = {}): DelegationRuleLike => ({
  decision: 'DISCOUNT',
  delegateeId: null,
  delegateRole: null,
  maxAmount: null,
  maxPercent: null,
  isActive: true,
  ...overrides,
});
const SALES: Role = 'SALES';
const WAREHOUSE: Role = 'WAREHOUSE';
const ADMIN: Role = 'ADMIN';

describe('Tareas: recurrencia', () => {
  it('no repite lo que no se repite', () => {
    expect(nextDueDate(new Date('2026-09-25T12:00:00Z'), 'NONE', new Date('2026-09-26T12:00:00Z'))).toBeNull();
  });

  it('mantiene el ritmo semanal y no acumula tareas vencidas', () => {
    expect(nextDueDate(new Date('2026-09-25T12:00:00Z'), 'WEEKLY', new Date('2026-09-26T12:00:00Z'))).toEqual(new Date('2026-10-02T12:00:00Z'));
    // Atrasada casi un mes: salta 09-11, 09-18 y 09-25 y cae en el próximo viernes.
    expect(nextDueDate(new Date('2026-09-04T12:00:00Z'), 'WEEKLY', new Date('2026-09-30T12:00:00Z'))).toEqual(new Date('2026-10-02T12:00:00Z'));
  });

  it('calcula la repetición diaria sin fecha previa y la mensual sin desbordar febrero', () => {
    expect(nextDueDate(null, 'DAILY', new Date('2026-09-30T12:00:00Z'))).toEqual(new Date('2026-10-01T12:00:00Z'));
    expect(nextDueDate(new Date('2026-01-31T12:00:00Z'), 'MONTHLY', new Date('2026-01-31T13:00:00Z'))).toEqual(new Date('2026-02-28T12:00:00Z'));
    expect(nextDueDate(new Date('2026-12-15T12:00:00Z'), 'MONTHLY', new Date('2026-12-15T13:00:00Z'))).toEqual(new Date('2027-01-15T12:00:00Z'));
  });

  it('marca como vencida solo una tarea abierta con fecha pasada', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const yesterday = new Date('2026-09-29T12:00:00Z');
    expect(isOverdue({ status: 'TODO', dueDate: yesterday }, now)).toBe(true);
    expect(isOverdue({ status: 'DONE', dueDate: yesterday }, now)).toBe(false);
    expect(isOverdue({ status: 'TODO', dueDate: null }, now)).toBe(false);
  });
});

describe('Delegación de decisiones', () => {
  it('el dueño decide siempre; sin regla, la decisión no está delegada', () => {
    expect(evaluateDelegation([], { decision: 'DISCOUNT', userId: 'u1', role: 'OWNER' }).allowed).toBe(true);
    const none = evaluateDelegation([], { decision: 'DISCOUNT', userId: 'u1', role: SALES });
    expect(none.allowed).toBe(false);
    expect(none.reason).toContain('no está delegada');
  });

  it('respeta el porcentaje máximo de una regla por rol', () => {
    const rules = [rule({ delegateRole: SALES, maxPercent: 10 })];
    expect(evaluateDelegation(rules, { decision: 'DISCOUNT', userId: 'u1', role: SALES, percent: 8 }).allowed).toBe(true);
    const over = evaluateDelegation(rules, { decision: 'DISCOUNT', userId: 'u1', role: SALES, percent: 15 });
    expect(over.allowed).toBe(false);
    expect(over.reason).toContain('Supera lo delegado');
  });

  it('respeta el monto máximo de una regla por persona y no aplica a otros', () => {
    const rules = [rule({ decision: 'PURCHASE_APPROVAL', delegateeId: 'u1', maxAmount: 100000 })];
    const ask = (userId: string, amount: number) => evaluateDelegation(rules, { decision: 'PURCHASE_APPROVAL', userId, role: WAREHOUSE, amount });
    expect(ask('u1', 100000).allowed).toBe(true);
    expect(ask('u1', 100001).allowed).toBe(false);
    expect(ask('u2', 50000).reason).toContain('no está delegada');
  });

  it('ignora reglas suspendidas y, con varias reglas, gana la que cubre el caso', () => {
    expect(evaluateDelegation([rule({ delegateRole: SALES, maxPercent: 10, isActive: false })], { decision: 'DISCOUNT', userId: 'u1', role: SALES, percent: 5 }).allowed).toBe(false);
    const rules = [rule({ delegateRole: SALES, maxAmount: 500 }), rule({ delegateeId: 'u1', maxAmount: 1000 })];
    expect(evaluateDelegation(rules, { decision: 'DISCOUNT', userId: 'u1', role: SALES, amount: 800 }).allowed).toBe(true);
  });

  it('sin monto informado, una regla con tope no bloquea la consulta', () => {
    const rules = [rule({ decision: 'PURCHASE_APPROVAL', delegateRole: ADMIN, maxAmount: 50000 })];
    expect(evaluateDelegation(rules, { decision: 'PURCHASE_APPROVAL', userId: 'u1', role: ADMIN }).allowed).toBe(true);
  });

  it('cuenta decisiones distintas con regla vigente', () => {
    const rules = [
      rule({ delegateRole: SALES }),
      rule({ delegateeId: 'u1' }),
      rule({ decision: 'PURCHASE_APPROVAL', delegateRole: ADMIN }),
      rule({ decision: 'STOCK_ADJUSTMENT', delegateRole: WAREHOUSE, isActive: false }),
    ];
    expect(delegatedDecisionCount(rules)).toBe(2);
  });

  it('exige persona o rol (no ambos) y no acepta delegar al dueño', () => {
    const base = { decision: 'DISCOUNT', title: 'Descuentos hasta 10%', maxPercent: 10, isActive: true };
    expect(delegationRuleSchema.safeParse({ ...base, delegateRole: 'SALES' }).success).toBe(true);
    expect(delegationRuleSchema.safeParse({ ...base, delegateeId: 'u1' }).success).toBe(true);
    expect(delegationRuleSchema.safeParse(base).success).toBe(false);
    expect(delegationRuleSchema.safeParse({ ...base, delegateeId: 'u1', delegateRole: 'SALES' }).success).toBe(false);
    expect(delegationRuleSchema.safeParse({ ...base, delegateRole: 'OWNER' }).success).toBe(false);
    expect(delegationRuleSchema.safeParse({ ...base, delegateRole: 'SALES', maxPercent: 120 }).success).toBe(false);
  });
});

describe('Tareas: datos', () => {
  it('las rutinas recomendadas tienen títulos únicos, fecha futura y al menos una semanal', () => {
    const titles = STARTER_TASKS.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of STARTER_TASKS) expect(t.dueInDays).toBeGreaterThan(0);
    expect(STARTER_TASKS.some((t) => t.recurrence === 'WEEKLY')).toBe(true);
  });

  it('valida una tarea', () => {
    expect(taskSchema.safeParse({ title: 'Ok' }).success).toBe(false);
    expect(taskSchema.safeParse({ title: 'Pedir envases', dueDate: '2026-10-05' }).success).toBe(true);
    expect(taskSchema.safeParse({ title: 'Pedir envases', dueDate: '05/10/2026' }).success).toBe(false);
  });
});
