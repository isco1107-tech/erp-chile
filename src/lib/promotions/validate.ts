import { parseDayIndex } from './dates';
import { MAX_PERCENT_BPS, type Promotion, type PromotionRule } from './types';

export function isValidPercentBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PERCENT_BPS;
}

function ruleErrors(rule: PromotionRule, path: string): string[] {
  switch (rule.type) {
    case 'EXPIRY_BEFORE':
      return parseDayIndex(rule.date) === null ? [`${path}: la fecha de vencimiento no es válida (use AAAA-MM-DD).`] : [];
    case 'EXPIRY_WITHIN_DAYS':
      return Number.isInteger(rule.days) && rule.days >= 0 ? [] : [`${path}: los días deben ser un entero desde 0.`];
    case 'CATEGORY':
    case 'PRODUCER':
    case 'PRODUCTS':
      return rule.ids.length > 0 ? [] : [`${path}: elija al menos un elemento.`];
    case 'ALL':
    case 'ANY':
      return rule.rules.length > 0
        ? rule.rules.flatMap((r, i) => ruleErrors(r, `${path}.${i + 1}`))
        : [`${path}: la combinación no tiene reglas.`];
  }
}

/** Errores de configuración de una promoción, en español. Lista vacía = válida. */
export function validatePromotion(promotion: Promotion): string[] {
  const errors: string[] = [];
  if (!promotion.name.trim()) errors.push('La promoción necesita un nombre.');
  if (!isValidPercentBps(promotion.percentBps)) errors.push('El descuento debe estar entre 0 % y 90 %.');
  else if (promotion.percentBps === 0) errors.push('Un descuento de 0 % no rebaja nada.');
  if (Number.isNaN(promotion.startsAt.getTime())) errors.push('La fecha de inicio no es válida.');
  if (promotion.endsAt && (Number.isNaN(promotion.endsAt.getTime()) || promotion.endsAt <= promotion.startsAt)) {
    errors.push('El término debe ser posterior al inicio.');
  }
  errors.push(...ruleErrors(promotion.rules, 'Regla'));
  return errors;
}
