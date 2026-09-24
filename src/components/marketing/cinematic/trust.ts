import { guarantees } from '../Security';

/**
 * En `/` las ocho garantías viven juntas en Seguridad. La landing v2 las
 * reparte: las dos de agentes de IA y automatizaciones van con los módulos
 * (escena 7) y las seis de seguridad quedan en su escena. Ninguna se repite
 * ni se pierde: tests/cinematic-sequence.test.ts lo comprueba.
 */
const INTELLIGENCE_TITLES = new Set(['Agentes con visión de negocio', 'El seguimiento continúa solo']);

export const intelligenceItems = guarantees.filter(item => INTELLIGENCE_TITLES.has(item.title));
export const securityItems = guarantees.filter(item => !INTELLIGENCE_TITLES.has(item.title));
