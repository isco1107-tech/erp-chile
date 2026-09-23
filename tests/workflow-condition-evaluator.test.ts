import { evaluateConditions } from '@/lib/workflows/condition-evaluator';
import type { WorkflowCondition } from '@/lib/workflows/types';

/**
 * El evaluador decide si una regla de automatización dispara sus acciones
 * (correos reales, webhooks a servicios externos) — una condición mal
 * evaluada dispara de más (spam a un cliente) o de menos (una alerta crítica
 * que nunca llega).
 */

function cond(field: string, operator: WorkflowCondition['operator'], value: string): WorkflowCondition {
  return { field, operator, value };
}

describe('Condiciones de una regla', () => {
  it('sin condiciones siempre dispara', () => {
    expect(evaluateConditions([], { totalAmount: 100 })).toBe(true);
  });

  it('combina varias condiciones en AND', () => {
    const conditions = [cond('totalAmount', 'greater_than', '1000'), cond('dteType', 'equals', 'FACTURA_33')];
    expect(evaluateConditions(conditions, { totalAmount: 2000, dteType: 'FACTURA_33' })).toBe(true);
    expect(evaluateConditions(conditions, { totalAmount: 500, dteType: 'FACTURA_33' })).toBe(false);
  });

  it('un campo ausente del payload hace fallar la condición, incluso not_equals', () => {
    // Más seguro que asumir "ausente" = "distinto": un typo en el nombre del
    // campo no debe convertirse en "dispara siempre".
    expect(evaluateConditions([cond('folio', 'not_equals', '100')], { totalAmount: 100 })).toBe(false);
  });

  it('un valor null en el payload nunca hace match, ni con not_equals', () => {
    expect(evaluateConditions([cond('contactId', 'not_equals', 'algo')], { contactId: null })).toBe(false);
  });

  it('compara números cuando ambos lados son numéricos', () => {
    expect(evaluateConditions([cond('totalAmount', 'greater_or_equal', '1000')], { totalAmount: 1000 })).toBe(true);
    expect(evaluateConditions([cond('totalAmount', 'less_than', '1000')], { totalAmount: 1000 })).toBe(false);
  });

  it('compara texto sin distinguir mayúsculas/minúsculas', () => {
    expect(evaluateConditions([cond('dteType', 'equals', 'factura_33')], { dteType: 'FACTURA_33' })).toBe(true);
  });

  it('contains busca subcadena, no igualdad exacta', () => {
    expect(evaluateConditions([cond('contactName', 'contains', 'sociedad')], { contactName: 'Sociedad Anónima ABC' })).toBe(true);
    expect(evaluateConditions([cond('contactName', 'contains', 'zzz')], { contactName: 'Sociedad Anónima ABC' })).toBe(false);
  });

  it('los operadores numéricos fallan si el valor configurado no es numérico', () => {
    expect(evaluateConditions([cond('totalAmount', 'greater_than', 'no-es-numero')], { totalAmount: 100 })).toBe(false);
  });

  it('evalúa un booleano comparándolo como texto', () => {
    expect(evaluateConditions([cond('isDte', 'equals', 'true')], { isDte: true })).toBe(true);
    expect(evaluateConditions([cond('isDte', 'equals', 'true')], { isDte: false })).toBe(false);
  });
});
