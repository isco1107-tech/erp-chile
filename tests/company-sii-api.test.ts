import { buildSiiApiHeaders, buildSiiApiUrl } from '@/lib/sii/company-sii-api';

describe('Integración SII por empresa', () => {
  it('normaliza la URL base y agrega el endpoint solicitado', () => {
    expect(buildSiiApiUrl('https://api.sii.cl/', '/status')).toBe('https://api.sii.cl/status');
    expect(buildSiiApiUrl('https://api.sii.cl', 'status')).toBe('https://api.sii.cl/status');
  });

  it('arma headers con las credenciales por empresa', () => {
    expect(buildSiiApiHeaders('api-key-123', 'secret-456')).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer api-key-123',
      'X-API-Key': 'api-key-123',
      'X-API-Secret': 'secret-456',
    });
  });
});
