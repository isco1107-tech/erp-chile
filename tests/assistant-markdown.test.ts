import { isInternalHref, parseAssistantMarkdown, parseInlines } from '@/lib/ai/assistant-markdown';

/**
 * Las respuestas del asistente se dibujan con elementos de React a partir de
 * esta estructura: nunca HTML del modelo. Y solo se enlaza a pantallas del
 * propio panel.
 */
describe('parseInlines', () => {
  it('convierte enlaces markdown a pantallas del panel', () => {
    expect(parseInlines('Ve a [Cuentas por Cobrar](/dashboard/treasury/cxc) ahora.')).toEqual([
      { type: 'text', text: 'Ve a ' },
      { type: 'link', text: 'Cuentas por Cobrar', href: '/dashboard/treasury/cxc' },
      { type: 'text', text: ' ahora.' },
    ]);
  });

  it('enlaza también una ruta suelta y respeta la puntuación que la sigue', () => {
    expect(parseInlines('Está en /dashboard/sales/orders.')).toEqual([
      { type: 'text', text: 'Está en ' },
      { type: 'link', text: '/dashboard/sales/orders', href: '/dashboard/sales/orders' },
      { type: 'text', text: '.' },
    ]);
  });

  it('acepta anclas del manual', () => {
    expect(parseInlines('[Ver en el manual](/dashboard/manual#cobranza)')).toEqual([{ type: 'link', text: 'Ver en el manual', href: '/dashboard/manual#cobranza' }]);
  });

  it('un enlace externo o con esquema queda como texto', () => {
    expect(parseInlines('[SII](https://www.sii.cl)')).toEqual([{ type: 'text', text: 'SII' }]);
    expect(parseInlines('[x](javascript:alert(1))').some((inline) => inline.type === 'link')).toBe(false);
    expect(parseInlines('[x](//evil.com/dashboard)').some((inline) => inline.type === 'link')).toBe(false);
  });

  it('negritas', () => {
    expect(parseInlines('Presiona **Emitir Documento**')).toEqual([
      { type: 'text', text: 'Presiona ' },
      { type: 'bold', text: 'Emitir Documento' },
    ]);
  });
});

describe('isInternalHref', () => {
  it.each(['/dashboard', '/dashboard/sales', '/dashboard/manual#x', '/dashboard/sales?tab=1'])('acepta %s', (href) => {
    expect(isInternalHref(href)).toBe(true);
  });
  it.each(['https://x.cl', '/login', '/dashboardx', '//evil.com', '/dashboard//evil', 'javascript:alert(1)'])('rechaza %s', (href) => {
    expect(isInternalHref(href)).toBe(false);
  });
});

describe('parseAssistantMarkdown', () => {
  it('arma párrafos y listas numeradas', () => {
    const blocks = parseAssistantMarkdown('Para cobrar:\n\n1. Abre [Cuentas por Cobrar](/dashboard/treasury/cxc).\n2. Presiona **Registrar pago**.\n\n¿Algo más?');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'paragraph', inlines: [{ type: 'text', text: 'Para cobrar:' }] });
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: true });
    expect(blocks[1]!.type === 'list' && blocks[1]!.items).toHaveLength(2);
    expect(blocks[2]).toEqual({ type: 'paragraph', inlines: [{ type: 'text', text: '¿Algo más?' }] });
  });

  it('separa una lista con viñetas de una numerada', () => {
    const blocks = parseAssistantMarkdown('- uno\n- dos\n1. tres');
    expect(blocks.map((block) => block.type === 'list' && block.ordered)).toEqual([false, true]);
  });

  it('quita los títulos markdown y une líneas de un mismo párrafo', () => {
    expect(parseAssistantMarkdown('## Paso\nuno\ndos')).toEqual([{ type: 'paragraph', inlines: [{ type: 'text', text: 'Paso uno dos' }] }]);
  });
});
