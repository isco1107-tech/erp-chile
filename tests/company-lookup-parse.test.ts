import {
  extractJsonArray,
  findRutInText,
  parseAiCandidates,
  resolveLocation,
  verifiedRut,
} from '@/modules/contacts/services/company-lookup-parse';

// 76.086.428-5 y 96.792.430-K pasan Módulo 11; 76.086.428-1 no.
describe('verifiedRut', () => {
  it('formatea un RUT válido y descarta uno con dígito verificador malo', () => {
    expect(verifiedRut('76086428-5')).toBe('76.086.428-5');
    expect(verifiedRut('76.086.428-1')).toBe('');
    expect(verifiedRut('')).toBe('');
  });

  it('encuentra el RUT dentro de texto libre', () => {
    expect(findRutInText('EMPRESA SPA con RUT 96.792.430-K, Santiago')).toBe('96.792.430-K');
  });
});

describe('extractJsonArray', () => {
  it('lee un arreglo envuelto en bloque de código', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('devuelve null si no hay arreglo válido', () => {
    expect(extractJsonArray('No encontré nada')).toBeNull();
    expect(extractJsonArray('[{mal json]')).toBeNull();
  });
});

describe('resolveLocation', () => {
  it('acepta la comuna solo si calza con una real, sin importar tildes', () => {
    expect(resolveLocation('nunoa', '')).toEqual({ region: expect.stringContaining('Metropolitana'), comuna: 'Ñuñoa' });
  });

  it('infiere la comuna desde la dirección si el campo no calza', () => {
    expect(resolveLocation('', 'Av. Apoquindo 3000, Las Condes').comuna).toBe('Las Condes');
    expect(resolveLocation('Ciudad Inventada', '')).toEqual({ region: '', comuna: '' });
  });
});

describe('parseAiCandidates', () => {
  const answer = JSON.stringify([
    { razonSocial: 'Sin RUT Ltda', rut: '', giro: 'Servicios', direccion: '', comuna: '' },
    {
      razonSocial: 'Comercial Ejemplo SpA',
      rut: '76086428-5',
      nombreFantasia: 'Ejemplo',
      giro: 'Venta al por mayor',
      direccion: 'Av. Providencia 1234',
      comuna: 'Providencia',
      fuente: 'empresas.cl',
    },
    { razonSocial: 'Duplicada SpA', rut: '76.086.428-5' },
    { razonSocial: 'RUT inventado SpA', rut: '76.086.428-1' },
    { rut: '96792430-K' },
  ]);

  it('prioriza los RUT válidos, descarta duplicados y nunca precarga un RUT inválido', () => {
    const result = parseAiCandidates(answer, ['google.cl']);
    expect(result.map((c) => c.razonSocial)).toEqual(['Comercial Ejemplo SpA', 'Sin RUT Ltda', 'RUT inventado SpA']);
    expect(result[0]).toMatchObject({
      rut: '76.086.428-5',
      rutVerified: true,
      giro: 'Venta al por mayor',
      address: 'Av. Providencia 1234',
      comuna: 'Providencia',
      sourceNote: 'Búsqueda con IA — empresas.cl',
    });
    expect(result[2]).toMatchObject({ rut: '', rutVerified: false, sourceNote: 'Búsqueda con IA — google.cl' });
  });

  it('una respuesta sin JSON no rompe: devuelve vacío', () => {
    expect(parseAiCandidates('Lo siento, no encontré la empresa.', [])).toEqual([]);
  });
});
