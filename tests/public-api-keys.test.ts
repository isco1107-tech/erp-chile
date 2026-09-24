import { API_KEY_PREFIX, generateApiKey, hashApiKey, isApiScope, readApiKey } from '@/lib/api/api-keys';

/**
 * Llaves de la API pública: se muestran una vez y en la base queda solo el
 * hash. Lo que no puede fallar: que dos llaves nunca coincidan, que el hash
 * sea estable y que una cabecera mal formada no llegue a la base.
 */

describe('generación de llaves', () => {
  it('tiene el prefijo esperado, es única y su hash es estable', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).toBe(hashApiKey(a.plaintext));
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.prefix).toBe(a.plaintext.slice(0, 12));
    // El prefijo visible no alcanza para reconstruir la llave.
    expect(a.plaintext.length).toBeGreaterThan(40);
  });
});

describe('lectura de la cabecera', () => {
  const { plaintext } = generateApiKey();

  it('acepta Bearer y X-Api-Key', () => {
    expect(readApiKey(new Headers({ authorization: `Bearer ${plaintext}` }))).toBe(plaintext);
    expect(readApiKey(new Headers({ 'x-api-key': plaintext }))).toBe(plaintext);
  });

  it('rechaza lo que no tiene formato de llave (no se consulta la base)', () => {
    expect(readApiKey(new Headers())).toBeNull();
    expect(readApiKey(new Headers({ authorization: 'Bearer abc' }))).toBeNull();
    expect(readApiKey(new Headers({ authorization: `Basic ${plaintext}` }))).toBeNull();
    expect(readApiKey(new Headers({ authorization: `Bearer ${API_KEY_PREFIX}${'x'.repeat(200)}` }))).toBeNull();
  });
});

describe('alcances', () => {
  it('solo reconoce los alcances publicados', () => {
    expect(isApiScope('sales:write')).toBe(true);
    expect(isApiScope('settings:company')).toBe(false);
    expect(isApiScope('__proto__')).toBe(false);
  });
});
