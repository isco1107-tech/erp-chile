import { DEFAULT_AGENT_MODEL, resolveAgentModel } from '@/modules/agents/services/model-tiers';

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
