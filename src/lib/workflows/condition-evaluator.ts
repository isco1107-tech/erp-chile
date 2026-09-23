import type { WorkflowCondition, WorkflowEventPayload } from './types';

/**
 * Evalúa las condiciones de una regla contra el payload del evento que la
 * disparó. Todas en AND — sin condiciones, la regla siempre corre.
 *
 * Un campo ausente en el payload SIEMPRE hace fallar la condición (incluso
 * `not_equals`): es más seguro que una automatización se quede sin disparar
 * por un typo de campo a que dispare de más por asumir que "ausente" cuenta
 * como "distinto".
 */
export function evaluateConditions(conditions: WorkflowCondition[], payload: WorkflowEventPayload): boolean {
  return conditions.every((condition) => evaluateCondition(condition, payload));
}

function evaluateCondition(condition: WorkflowCondition, payload: WorkflowEventPayload): boolean {
  // `in` también matchea propiedades heredadas (`toString`, `constructor`…):
  // si alguien nombra un campo así, `in` diría "existe" sobre un payload que
  // en realidad no lo trae.
  if (!Object.prototype.hasOwnProperty.call(payload, condition.field)) return false;
  const actual = payload[condition.field];
  if (actual === null) return false;

  const numericActual = typeof actual === 'number' ? actual : Number(actual);
  const numericExpected = Number(condition.value);
  const bothNumeric = Number.isFinite(numericActual) && Number.isFinite(numericExpected) && condition.value.trim() !== '';

  switch (condition.operator) {
    case 'equals':
      return bothNumeric ? numericActual === numericExpected : stringOf(actual) === condition.value.toLowerCase();
    case 'not_equals':
      return bothNumeric ? numericActual !== numericExpected : stringOf(actual) !== condition.value.toLowerCase();
    case 'contains':
      return stringOf(actual).includes(condition.value.toLowerCase());
    case 'greater_than':
      return bothNumeric && numericActual > numericExpected;
    case 'greater_or_equal':
      return bothNumeric && numericActual >= numericExpected;
    case 'less_than':
      return bothNumeric && numericActual < numericExpected;
    case 'less_or_equal':
      return bothNumeric && numericActual <= numericExpected;
    default:
      return false;
  }
}

function stringOf(value: string | number | boolean): string {
  return String(value).toLowerCase();
}
