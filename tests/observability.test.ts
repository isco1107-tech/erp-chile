import { redact, redactContext, REDACTED } from '@/lib/observability/redact';
import { buildRecord, toError } from '@/lib/observability/logger';

/**
 * El valor de esta capa es que un incidente quede registrado SIN arrastrar
 * credenciales a un servicio externo. Los casos de abajo son justamente los
 * objetos que se adjuntan a un error en la práctica: el payload que llegó, la
 * sesión, las cabeceras del request.
 */

describe('Saneamiento de datos antes de registrarlos', () => {
  it('censura el valor de las claves sensibles y conserva el resto', () => {
    const entrada = {
      email: 'usuario@empresa.cl',
      password: 'sup3rsecreta',
      companyId: 'cmp_123',
    };

    expect(redact(entrada)).toEqual({
      email: 'usuario@empresa.cl',
      password: REDACTED,
      companyId: 'cmp_123',
    });
  });

  it('censura las credenciales que realmente circulan en este proyecto', () => {
    const entrada = {
      passwordHash: 'bcrypt$…',
      totpSecret: 'JBSWY3DP',
      CRON_SECRET: 'abc',
      authorization: 'Bearer xyz',
      cookie: 'session=eyJ…',
      R2_SECRET_ACCESS_KEY: 'clave',
      n8nWebhookSecret: 'token',
      privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----',
    };

    const salida = redact(entrada) as Record<string, unknown>;
    for (const clave of Object.keys(entrada)) {
      expect(salida[clave]).toBe(REDACTED);
    }
  });

  it('censura en profundidad, no solo en el primer nivel', () => {
    const salida = redact({ request: { headers: { cookie: 'session=abc' } } }) as {
      request: { headers: { cookie: string } };
    };
    expect(salida.request.headers.cookie).toBe(REDACTED);
  });

  it('no se cuelga ante una referencia circular', () => {
    const nodo: Record<string, unknown> = { nombre: 'raíz' };
    nodo.self = nodo;
    expect(() => redact(nodo)).not.toThrow();
    expect(JSON.stringify(redact(nodo))).toContain('referencia circular');
  });

  it('corta la recursión en estructuras muy profundas', () => {
    let profundo: Record<string, unknown> = { valor: 1 };
    for (let i = 0; i < 20; i += 1) profundo = { anidado: profundo };
    expect(JSON.stringify(redact(profundo))).toContain('profundidad máxima');
  });

  it('acota arrays largos y cadenas enormes', () => {
    const arreglo = redact(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(arreglo.length).toBeLessThanOrEqual(21);
    expect(String(arreglo[arreglo.length - 1])).toContain('más');

    const largo = redact('x'.repeat(5_000)) as string;
    expect(largo.length).toBeLessThan(5_000);
    expect(largo).toContain('truncado');
  });

  it('convierte a texto los tipos que no sobreviven a JSON', () => {
    const salida = redact({
      fecha: new Date('2026-09-10T12:00:00Z'),
      fn: () => null,
      mapa: new Map([['a', 1]]),
      conjunto: new Set([1, 2]),
      grande: 10n,
    }) as Record<string, unknown>;

    expect(salida.fecha).toBe('2026-09-10T12:00:00.000Z');
    expect(salida.fn).toBe('[función]');
    expect(salida.mapa).toBe('[Map de 1]');
    expect(salida.conjunto).toBe('[Set de 2]');
    expect(salida.grande).toBe('10n');
  });

  it('siempre devuelve un objeto plano desde redactContext', () => {
    expect(redactContext(undefined)).toEqual({});
    expect(redactContext({ companyId: 'x' })).toEqual({ companyId: 'x' });
  });
});

describe('Normalización de errores', () => {
  it('deja pasar un Error tal cual', () => {
    const original = new Error('falló');
    expect(toError(original)).toBe(original);
  });

  it('convierte a Error lo que se lanzó sin serlo', () => {
    // En JavaScript se puede lanzar cualquier cosa; un `throw 'texto'` no debe
    // perder el mensaje al registrarse.
    expect(toError('texto suelto').message).toBe('texto suelto');
    expect(toError({ code: 'P2002' }).message).toContain('P2002');
    expect(toError(undefined)).toBeInstanceOf(Error);
  });
});

describe('Registro estructurado', () => {
  it('incluye nivel, mensaje, marca de tiempo y contexto', () => {
    const registro = buildRecord('error', 'algo falló', { companyId: 'cmp_1', module: 'dte' });

    expect(registro.level).toBe('error');
    expect(registro.message).toBe('algo falló');
    expect(registro.context).toEqual({ companyId: 'cmp_1', module: 'dte' });
    expect(new Date(registro.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('adjunta el error con su stack', () => {
    const registro = buildRecord('error', 'boom', { module: 'x' }, new Error('detalle'));
    expect(registro.error?.message).toBe('detalle');
    expect(registro.error?.stack).toContain('Error');
  });

  it('censura el contexto también en el registro', () => {
    // Es el punto de todo esto: nada sensible puede llegar al log ni al
    // servicio externo aunque el llamador lo haya adjuntado sin pensar.
    const registro = buildRecord('error', 'boom', { module: 'auth', password: 'secreta' });
    expect(registro.context.password).toBe(REDACTED);
  });
});
