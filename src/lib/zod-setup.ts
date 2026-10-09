/**
 * Mensajes de validación de Zod en español, configurados UNA vez por proceso.
 *
 * Por qué hace falta: ~280 validaciones del proyecto (`.min()`, `.positive()`,
 * `.int()`, `.email()`…) no llevan mensaje propio y Zod 4 las muestra en
 * inglés ("Too small: expected number to be >0"). Los formularios muestran
 * `issue.message` tal cual, así que el usuario lo veía en inglés.
 *
 * Cómo funciona: `z.config()` guarda el idioma en `globalThis.__zod_globalConfig`
 * (ver `node_modules/zod/v4/core/core.js`), no en una variable del módulo. Por
 * eso una sola llamada vale para todas las copias de Zod que Next empaquete
 * (capas RSC, acciones, SSR) mientras sea el mismo proceso/ventana. Lo que se
 * debe garantizar es que esta línea corra en cada "mundo":
 *   - servidor: `src/instrumentation.ts` (`register`) y el layout raíz;
 *   - navegador: `ZodLocale` (componente cliente) dentro del layout raíz.
 *
 * Los mensajes escritos a mano en cada esquema siguen mandando: la config
 * global solo se usa cuando la regla no trae mensaje.
 *
 * Para los casos más comunes se usa un texto más claro que la traducción
 * literal de Zod ("Este campo es obligatorio" en vez de "Demasiado pequeño:
 * se esperaba que texto tuviera >=1 caracteres"); el resto cae al idioma
 * `es` oficial de Zod.
 */
import { z } from 'zod';

type RawIssue = z.core.$ZodRawIssue;

const es = z.locales.es();

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** Texto claro para los casos frecuentes; `undefined` = usar la traducción de Zod. */
export function friendlyIssueMessage(issue: RawIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type': {
      const input = (issue as { input?: unknown }).input;
      if (input === undefined || input === null) return 'Este campo es obligatorio';
      const expected = (issue as { expected?: string }).expected;
      const format = (issue as { format?: string }).format;
      if (expected === 'number' || expected === 'int' || expected === 'bigint') {
        if (typeof input === 'number' && Number.isNaN(input)) return 'Ingresa un número válido';
        if (typeof input === 'number' && format) return 'Debe ser un número entero, sin decimales';
        return 'Ingresa un número válido';
      }
      if (expected === 'string') return 'Ingresa un texto válido';
      if (expected === 'boolean') return 'Elige una opción (sí o no)';
      if (expected === 'array') return 'Selecciona al menos una opción';
      if (expected === 'date') return 'Ingresa una fecha válida';
      return undefined;
    }
    case 'too_small': {
      const { origin, minimum, inclusive } = issue as { origin: string; minimum: number | bigint; inclusive?: boolean };
      if (origin === 'string') {
        const n = Number(minimum);
        return n <= 1 ? 'Este campo es obligatorio' : `Debe tener al menos ${n} caracteres`;
      }
      if (origin === 'array' || origin === 'set') {
        const n = Number(minimum);
        return n <= 1 ? 'Agrega al menos un elemento' : `Agrega al menos ${n} elementos`;
      }
      if (origin === 'number' || origin === 'int' || origin === 'bigint') {
        const n = Number(minimum);
        if (inclusive === false) return n === 0 ? 'Debe ser mayor que 0' : `Debe ser mayor que ${n}`;
        return n === 0 ? 'No puede ser negativo' : `Debe ser ${n} o más`;
      }
      return undefined;
    }
    case 'too_big': {
      const { origin, maximum, inclusive } = issue as { origin: string; maximum: number | bigint; inclusive?: boolean };
      const n = Number(maximum);
      if (origin === 'string') return `Puede tener como máximo ${n} ${plural(n, 'carácter', 'caracteres')}`;
      if (origin === 'array' || origin === 'set') return `Puede tener como máximo ${n} ${plural(n, 'elemento', 'elementos')}`;
      if (origin === 'number' || origin === 'int' || origin === 'bigint') {
        return inclusive === false ? `Debe ser menor que ${n}` : `No puede ser mayor que ${n}`;
      }
      return undefined;
    }
    case 'invalid_format': {
      const format = (issue as { format?: string }).format;
      if (format === 'email') return 'Ingresa un correo electrónico válido (ej. nombre@empresa.cl)';
      if (format === 'url') return 'Ingresa un enlace válido (debe comenzar con https://)';
      if (format === 'uuid' || format === 'guid') return 'El identificador no es válido';
      return undefined;
    }
    case 'invalid_value':
      return 'Elige una de las opciones disponibles';
    case 'invalid_union':
      return 'El valor ingresado no es válido';
    default:
      return undefined;
  }
}

let configured = false;

/** Idempotente. Se llama sola al importar el módulo. */
export function setupZodSpanish(): void {
  if (configured) return;
  configured = true;
  // `customError` y no `localeError`: cada copia de Zod que se carga después
  // ejecuta `config(en())` y pisaría `localeError` con el inglés, pero nunca
  // toca `customError`, que además se consulta antes que el idioma.
  z.config({
    customError: (issue) => friendlyIssueMessage(issue) ?? es.localeError(issue),
  });
}

setupZodSpanish();
