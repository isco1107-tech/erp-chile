/**
 * Atribución de campañas del marketing propio de Aether (ADR 0015):
 * `src/lib/marketing/attribution.ts`. Fija que (1) solo se guardan fichas
 * cortas de una lista cerrada de caracteres, (2) del origen solo viaja el
 * dominio, (3) se conserva el primer contacto y se reemplaza el último dentro
 * de 90 días y (4) una atribución inválida se descarta sin romper nada.
 */
import {
  attributionLabel,
  mergeAttribution,
  normalizeToken,
  parseAttributionPayload,
  readStoredAttribution,
  referrerHostOf,
  touchFromUrl,
  touchSignature,
  type Attribution,
} from '@/lib/marketing/attribution';
import { datosDeLead, datosDeVisita, LEAD_REF_RE, newLeadRef } from '@/lib/marketing/supersuite-events';

const NOW = new Date('2026-10-30T15:00:00Z');
const url = (qs: string, path = '/') => new URL(`https://aether.cl${path}${qs}`);

describe('normalizeToken', () => {
  it('deja el valor en minúsculas, sin tildes, con guiones y solo caracteres seguros', () => {
    expect(normalizeToken('Lanzamiento POS Señal')).toBe('lanzamiento-pos-senal');
    expect(normalizeToken('  Instagram ')).toBe('instagram');
    expect(normalizeToken('cierre_de_caja.v2')).toBe('cierre_de_caja.v2');
    expect(normalizeToken('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(normalizeToken('--hola')).toBe('hola');
  });

  it('vacío o irrecuperable no deja nada, y nunca pasa de 80 caracteres', () => {
    expect(normalizeToken('')).toBeUndefined();
    expect(normalizeToken('¿¡!?')).toBeUndefined();
    expect(normalizeToken(null)).toBeUndefined();
    expect(normalizeToken('a'.repeat(200))).toHaveLength(80);
  });
});

describe('touchFromUrl', () => {
  it('lee la campaña del enlace con su página de llegada', () => {
    const touch = touchFromUrl(url('?utm_source=Instagram&utm_medium=social&utm_campaign=pos-cierre&utm_content=carrusel-01', '/modulos/punto-de-venta'), 'https://l.instagram.com/x?u=1', NOW);
    expect(touch).toEqual({
      source: 'instagram',
      medium: 'social',
      campaign: 'pos-cierre',
      content: 'carrusel-01',
      landingPath: '/modulos/punto-de-venta',
      referrerHost: 'l.instagram.com',
      at: NOW.toISOString(),
    });
  });

  it('sin utm_source no hay campaña (una visita directa no pisa la anterior)', () => {
    expect(touchFromUrl(url('?utm_campaign=algo'), null, NOW)).toBeNull();
    expect(touchFromUrl(url(''), 'https://google.com', NOW)).toBeNull();
  });

  it('`ref` sirve de atajo para enlaces de referidos', () => {
    expect(touchFromUrl(url('?ref=Hecho con Aether'), null, NOW)).toMatchObject({ source: 'hecho-con-aether', medium: 'referral' });
  });

  it('del origen solo el dominio, y nada si es el propio sitio', () => {
    expect(referrerHostOf('https://www.facebook.com/groups/123?id=persona', 'aether.cl')).toBe('facebook.com');
    expect(referrerHostOf('https://aether.cl/empresas', 'aether.cl')).toBeUndefined();
    expect(referrerHostOf('no es una url', 'aether.cl')).toBeUndefined();
  });

  it('el resultado siempre calza con el esquema estricto que valida el servidor', () => {
    const touch = touchFromUrl(url('?utm_source=x&utm_term=palabra clave'), null, NOW)!;
    expect(parseAttributionPayload({ first: touch, last: touch })).not.toBeNull();
  });
});

describe('primer y último contacto', () => {
  const ig = touchFromUrl(url('?utm_source=instagram&utm_campaign=a'), null, new Date('2026-10-01T00:00:00Z'))!;
  const li = touchFromUrl(url('?utm_source=linkedin&utm_campaign=b'), null, NOW)!;

  it('conserva el primero y reemplaza el último', () => {
    const first = mergeAttribution(null, ig, ig.at ? new Date(ig.at) : NOW)!;
    const both = mergeAttribution(first, li, NOW)!;
    expect(both.first.source).toBe('instagram');
    expect(both.last.source).toBe('linkedin');
    expect(mergeAttribution(both, null, NOW)).toBe(both);
  });

  it('pasados 90 días la campaña vieja ya no explica nada', () => {
    const stored: Attribution = { first: ig, last: ig };
    const later = new Date('2027-01-15T00:00:00Z');
    expect(readStoredAttribution(JSON.stringify(stored), later)).toBeNull();
    expect(mergeAttribution(stored, null, later)).toBeNull();
    expect(mergeAttribution(stored, { ...li, at: later.toISOString() }, later)!.first.source).toBe('linkedin');
  });

  it('lo guardado roto o manipulado se ignora', () => {
    expect(readStoredAttribution('{no es json', NOW)).toBeNull();
    expect(readStoredAttribution(JSON.stringify({ first: ig, last: { ...ig, source: 'Con Espacios' } }), NOW)).toBeNull();
    expect(readStoredAttribution(JSON.stringify({ first: ig, last: ig, email: 'a@b.cl' }), NOW)).toBeNull();
  });

  it('la firma ignora la hora y la página: la misma campaña cuenta una vez por pestaña', () => {
    expect(touchSignature(li)).toBe(touchSignature({ ...li, at: ig.at, landingPath: '/empresas' }));
    expect(touchSignature(li)).not.toBe(touchSignature(ig));
  });
});

describe('lo que viaja a la Supersuite', () => {
  const touch = touchFromUrl(url('?utm_source=instagram&utm_medium=social&utm_campaign=pos'), 'https://l.instagram.com/', NOW)!;
  const attribution: Attribution = { first: touch, last: touch };

  it('la referencia del lead es opaca y con letras que no se confunden', () => {
    const refs = new Set(Array.from({ length: 200 }, () => newLeadRef()));
    expect(refs.size).toBe(200);
    for (const ref of refs) expect(ref).toMatch(LEAD_REF_RE);
  });

  it('el lead lleva la campaña y fichas de listas cerradas, nunca datos de la persona', () => {
    const datos = datosDeLead({ ref: 'L-ABCD2345', formulario: 'demo', equipo: '6 a 20 personas', areas: ['Ventas e inventario'], attribution });
    expect(datos).toEqual({
      ref: 'L-ABCD2345',
      formulario: 'demo',
      equipo: '6 a 20 personas',
      areas: ['Ventas e inventario'],
      toque: { fuente: 'instagram', medio: 'social', campana: 'pos', pagina: '/', referente: 'l.instagram.com', fecha: NOW.toISOString() },
      primerToque: { fuente: 'instagram', medio: 'social', campana: 'pos', pagina: '/', referente: 'l.instagram.com', fecha: NOW.toISOString() },
    });
    expect(datosDeLead({ ref: 'L-ABCD2345', formulario: 'cotizacion-modulos', modulos: ['pos'], attribution: null })).toEqual({ ref: 'L-ABCD2345', formulario: 'cotizacion-modulos', modulos: ['pos'], toque: null });
    expect(datosDeVisita(attribution)).toHaveProperty('toque.fuente', 'instagram');
  });

  it('el correo de ventas dice de qué campaña vino', () => {
    expect(attributionLabel(attribution)).toBe('instagram / social / pos');
    expect(attributionLabel({ first: touch, last: { ...touch, content: 'reel-02' } })).toBe('instagram / social / pos (pieza reel-02)');
    expect(attributionLabel(null)).toContain('Sin campaña');
  });
});
