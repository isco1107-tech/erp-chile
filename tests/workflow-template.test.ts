import { renderTemplate } from '@/lib/workflows/template';

/**
 * Sustitución de `{{campo}}` en los textos de las acciones (asunto de correo,
 * mensaje de la notificación). Corre sobre payloads de eventos de negocio
 * reales, así que un campo mal resuelto puede terminar en un correo real a
 * un cliente.
 */

describe('Plantilla {{campo}}', () => {
  it('sustituye un campo presente en el payload', () => {
    const result = renderTemplate('Hola {{contactName}}, tu total es {{totalAmount}}', { contactName: 'Ana', totalAmount: 5000 });
    expect(result.text).toBe('Hola Ana, tu total es 5000');
    expect(result.unknownFields).toEqual([]);
  });

  it('un campo desconocido se reemplaza por texto vacío, no deja el {{...}} literal', () => {
    const result = renderTemplate('Hola {{nombreQueNoExiste}}', { contactName: 'Ana' });
    expect(result.text).toBe('Hola ');
    expect(result.unknownFields).toEqual(['nombreQueNoExiste']);
  });

  it('reporta cada campo desconocido una sola vez aunque se repita', () => {
    const result = renderTemplate('{{x}} y otra vez {{x}}', {});
    expect(result.unknownFields).toEqual(['x']);
  });

  it('un valor null se reemplaza por texto vacío, no por la palabra "null"', () => {
    const result = renderTemplate('Referencia: {{reason}}', { reason: null });
    expect(result.text).toBe('Referencia: ');
  });

  it('un texto sin placeholders se devuelve intacto', () => {
    const result = renderTemplate('Texto fijo sin variables', { anything: 1 });
    expect(result.text).toBe('Texto fijo sin variables');
    expect(result.unknownFields).toEqual([]);
  });

  it('tolera espacios dentro de las llaves', () => {
    const result = renderTemplate('{{ contactName }}', { contactName: 'Ana' });
    expect(result.text).toBe('Ana');
  });
});
