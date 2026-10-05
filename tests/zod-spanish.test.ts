import { z } from 'zod';
import '@/lib/zod-setup';

function msg(schema: z.ZodType, value: unknown): string {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('Se esperaba un error de validación');
  return result.error.issues[0]?.message ?? '';
}

describe('Zod en español (src/lib/zod-setup.ts)', () => {
  it('traduce las reglas sin mensaje propio', () => {
    expect(msg(z.number().positive(), 0)).toBe('Debe ser mayor que 0');
    expect(msg(z.number().min(5), 2)).toBe('Debe ser 5 o más');
    expect(msg(z.number().nonnegative(), -1)).toBe('No puede ser negativo');
    expect(msg(z.number().max(10), 11)).toBe('No puede ser mayor que 10');
    expect(msg(z.number().int(), 1.5)).toBe('Debe ser un número entero, sin decimales');
    expect(msg(z.string().min(1), '')).toBe('Este campo es obligatorio');
    expect(msg(z.string().min(3), 'ab')).toBe('Debe tener al menos 3 caracteres');
    expect(msg(z.string().max(5), 'abcdefg')).toBe('Puede tener como máximo 5 caracteres');
    expect(msg(z.string().email(), 'no-es-correo')).toMatch(/correo electrónico/);
    expect(msg(z.array(z.string()).min(1), [])).toBe('Agrega al menos un elemento');
    expect(msg(z.enum(['A', 'B']), 'C')).toBe('Elige una de las opciones disponibles');
    expect(msg(z.object({ a: z.string() }), {})).toBe('Este campo es obligatorio');
    expect(msg(z.number(), 'abc')).toBe('Ingresa un número válido');
    expect(msg(z.number(), Number.NaN)).toBe('Ingresa un número válido');
  });

  it('un mensaje escrito a mano en el esquema sigue ganando', () => {
    expect(msg(z.number().positive('El monto debe ser mayor a cero'), 0)).toBe('El monto debe ser mayor a cero');
    expect(msg(z.string().min(1, 'Falta el nombre'), '')).toBe('Falta el nombre');
    expect(msg(z.number({ error: 'Monto inválido' }), 'x')).toBe('Monto inválido');
  });

  it('ningún mensaje por defecto queda en inglés', () => {
    const cases: Array<[z.ZodType, unknown]> = [
      [z.number().positive(), 0],
      [z.string().regex(/^\d+$/), 'abc'],
      [z.string().url(), 'x'],
      [z.string().uuid(), 'x'],
      [z.boolean(), 'x'],
      [z.union([z.string(), z.number()]), true],
      [z.number().multipleOf(5), 3],
      [z.strictObject({ a: z.string() }), { a: 'x', b: 1 }],
      [z.string().startsWith('a'), 'b'],
      [z.date(), 'x'],
    ];
    for (const [schema, value] of cases) {
      const message = msg(schema, value);
      expect(message).not.toMatch(/Too (small|big)|Invalid|expected|Unrecognized/);
    }
  });
});

describe('alcance de la configuración', () => {
  it('vale también para otra copia de Zod cargada por separado (el idioma vive en globalThis)', () => {
    let otraCopia: typeof z | undefined;
    jest.isolateModules(() => {
      otraCopia = require('zod').z as typeof z;
    });
    expect(otraCopia).not.toBe(z);
    const result = otraCopia!.number().positive().safeParse(0);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Debe ser mayor que 0');
  });
});
