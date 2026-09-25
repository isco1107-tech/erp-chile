import {
  contentsToOpenAiMessages,
  declarationsToOpenAiTools,
  parseChatCompletion,
  parseToolArguments,
  stripThinking,
} from '@/modules/agents/services/openai-compat';

describe('contentsToOpenAiMessages', () => {
  it('pone el prompt de sistema primero y traduce model → assistant', () => {
    const messages = contentsToOpenAiMessages('Eres el copiloto', [
      { role: 'user', parts: [{ text: '¿Cuánto vendí?' }] },
      { role: 'model', parts: [{ text: 'Vendiste $1.000' }] },
      { role: 'user', parts: [{ text: '¿Y el IVA?' }] },
    ]);
    expect(messages).toEqual([
      { role: 'system', content: 'Eres el copiloto' },
      { role: 'user', content: '¿Cuánto vendí?' },
      { role: 'assistant', content: 'Vendiste $1.000' },
      { role: 'user', content: '¿Y el IVA?' },
    ]);
  });

  it('omite turnos sin texto', () => {
    const messages = contentsToOpenAiMessages('s', [{ role: 'user', parts: [] }]);
    expect(messages).toHaveLength(1);
  });
});

describe('declarationsToOpenAiTools', () => {
  it('usa parametersJsonSchema tal cual', () => {
    const schema = { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] };
    const [tool] = declarationsToOpenAiTools([{ name: 'getSales', description: 'Ventas', parametersJsonSchema: schema }]);
    expect(tool).toEqual({ type: 'function', function: { name: 'getSales', description: 'Ventas', parameters: schema } });
  });

  it('una tool sin parámetros recibe un objeto vacío', () => {
    const [tool] = declarationsToOpenAiTools([{ name: 'ping' }]);
    expect(tool?.function.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('rechaza el formato `parameters` propio de Gemini en vez de perder los argumentos', () => {
    expect(() => declarationsToOpenAiTools([{ name: 'x', parameters: {} }])).toThrow('parametersJsonSchema');
  });
});

describe('parseChatCompletion', () => {
  it('lee texto y quita el razonamiento interno', () => {
    const parsed = parseChatCompletion({ choices: [{ message: { content: '<think>calculo…</think>\nTotal: $5.000' } }] });
    expect(parsed).toEqual({ content: 'Total: $5.000', toolCalls: [] });
  });

  it('lee tool calls con content nulo', () => {
    const parsed = parseChatCompletion({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getVatProjection', arguments: '{"month":9}' } }],
          },
        },
      ],
    });
    expect(parsed.content).toBeNull();
    expect(parsed.toolCalls).toEqual([
      { id: 'c1', type: 'function', function: { name: 'getVatProjection', arguments: '{"month":9}' } },
    ]);
  });

  it('una respuesta sin choices es un error', () => {
    expect(() => parseChatCompletion({ choices: [] })).toThrow();
    expect(() => parseChatCompletion({ error: 'x' })).toThrow();
  });
});

describe('parseToolArguments', () => {
  it('acepta un objeto JSON o vacío', () => {
    expect(parseToolArguments('{"year":2026}')).toEqual({ year: 2026 });
    expect(parseToolArguments('')).toEqual({});
  });

  it('devuelve null si no es un objeto JSON', () => {
    expect(parseToolArguments('{mal')).toBeNull();
    expect(parseToolArguments('[1,2]')).toBeNull();
    expect(parseToolArguments('null')).toBeNull();
  });
});

describe('stripThinking', () => {
  it('deja el texto intacto si no hay bloque de razonamiento', () => {
    expect(stripThinking('  Hola  ')).toBe('Hola');
  });
});
