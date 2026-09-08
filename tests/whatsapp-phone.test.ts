import { normalizeToWhatsappFormat, buildWhatsappLink } from '@/lib/chile/phone';

describe('normalizeToWhatsappFormat', () => {
  it('acepta un celular ya con +56 (con símbolos y espacios)', () => {
    expect(normalizeToWhatsappFormat('+56 9 1234 5678')).toEqual({ ok: true, digits: '56912345678' });
  });

  it('acepta un celular sin código de país, anteponiendo 56', () => {
    expect(normalizeToWhatsappFormat('912345678')).toEqual({ ok: true, digits: '56912345678' });
  });

  it('acepta un celular sin el 9 inicial ni código de país (8 dígitos)', () => {
    expect(normalizeToWhatsappFormat('12345678')).toEqual({ ok: true, digits: '56912345678' });
  });

  it('acepta un número que ya viene con 56 + 10 dígitos (fijo con área), tal cual', () => {
    expect(normalizeToWhatsappFormat('56221234567')).toEqual({ ok: true, digits: '56221234567' });
  });

  it('rechaza un número con 56 pero un largo intermedio no reconocible (9 dígitos tras el prefijo)', () => {
    expect(normalizeToWhatsappFormat('562212345').ok).toBe(false);
  });

  it('deja tal cual un número con otro código de país plausible', () => {
    expect(normalizeToWhatsappFormat('+541123456789')).toEqual({ ok: true, digits: '541123456789' });
  });

  it('rechaza un teléfono vacío', () => {
    expect(normalizeToWhatsappFormat('   ')).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rechaza un teléfono sin dígitos reconocibles', () => {
    expect(normalizeToWhatsappFormat('abc')).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe('buildWhatsappLink', () => {
  it('arma el link wa.me con mensaje precargado codificado', () => {
    const result = buildWhatsappLink('+56912345678', 'Hola María');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe('https://wa.me/56912345678?text=Hola%20Mar%C3%ADa');
    }
  });

  it('arma el link wa.me sin mensaje cuando no se pasa uno', () => {
    const result = buildWhatsappLink('912345678');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe('https://wa.me/56912345678');
    }
  });

  it('no genera url cuando el teléfono no se puede normalizar', () => {
    const result = buildWhatsappLink('');
    expect(result.ok).toBe(false);
    expect('url' in result ? result.url : undefined).toBeUndefined();
  });
});
