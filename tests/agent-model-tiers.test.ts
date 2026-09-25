import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_NVIDIA_REASONING_MODEL,
  resolveAgentModel,
  resolveNvidiaTarget,
} from '@/modules/agents/services/model-tiers';

describe('resolveAgentModel', () => {
  it('sin configuración, todos los niveles usan el modelo de siempre', () => {
    expect(resolveAgentModel('lite', {})).toBe(DEFAULT_AGENT_MODEL);
    expect(resolveAgentModel('standard', {})).toBe(DEFAULT_AGENT_MODEL);
    expect(resolveAgentModel('reasoning', {})).toBe(DEFAULT_AGENT_MODEL);
  });

  it('cada nivel lee solo su propia variable', () => {
    const env = { GEMINI_MODEL_REASONING: 'modelo-razonamiento', GEMINI_MODEL_LITE: 'modelo-liviano' };
    expect(resolveAgentModel('reasoning', env)).toBe('modelo-razonamiento');
    expect(resolveAgentModel('lite', env)).toBe('modelo-liviano');
    expect(resolveAgentModel('standard', env)).toBe(DEFAULT_AGENT_MODEL);
  });

  it('una variable vacía o con espacios no deja la llamada sin modelo', () => {
    expect(resolveAgentModel('standard', { GEMINI_MODEL_STANDARD: '   ' })).toBe(DEFAULT_AGENT_MODEL);
  });
});

describe('resolveNvidiaTarget', () => {
  it('sin NVIDIA_API_KEY nada cambia: todo sigue en Gemini', () => {
    expect(resolveNvidiaTarget('reasoning', {})).toBeNull();
    expect(resolveNvidiaTarget('reasoning', { NVIDIA_API_KEY: '   ' })).toBeNull();
  });

  it('con la key, solo el nivel reasoning va a NVIDIA', () => {
    const env = { NVIDIA_API_KEY: 'nvapi-test' };
    expect(resolveNvidiaTarget('reasoning', env)).toEqual({ apiKey: 'nvapi-test', model: DEFAULT_NVIDIA_REASONING_MODEL });
    expect(resolveNvidiaTarget('standard', env)).toBeNull();
    expect(resolveNvidiaTarget('lite', env)).toBeNull();
  });

  it('respeta el modelo configurado', () => {
    const env = { NVIDIA_API_KEY: 'nvapi-test', NVIDIA_MODEL_REASONING: ' moonshotai/kimi-k2.6 ' };
    expect(resolveNvidiaTarget('reasoning', env)?.model).toBe('moonshotai/kimi-k2.6');
  });
});
