/**
 * Buscador de empresas (company-lookup.service.ts): con una persona esperando,
 * cada modelo se prueba una vez, la cuota agotada o el bloqueo de DuckDuckGo
 * no se vuelven a esperar en cada búsqueda, y el mensaje dice la causa real.
 * Caso real (producción, 2026-09-28): Gemini 429 "exceeded your current
 * quota" + DuckDuckGo 403, tras ~18 s de reintentos.
 */
jest.mock('@/modules/agents/services/gemini-agent', () => ({
  generateGroundedText: jest.fn(),
  isRateLimitError: (error: unknown) => (error as { status?: number } | null)?.status === 429,
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import { generateGroundedText } from '@/modules/agents/services/gemini-agent';
import { DEFAULT_AGENT_MODEL } from '@/modules/agents/services/model-tiers';
import { lookupCompaniesByName, resetCompanyLookupState } from '@/modules/contacts/services/company-lookup.service';
import { lookupCacheKey, lookupUnavailableMessage, searchModels } from '@/modules/contacts/services/company-lookup-parse';

const grounded = generateGroundedText as jest.MockedFunction<typeof generateGroundedText>;
const quotaError = () => Object.assign(new Error('You exceeded your current quota'), { status: 429 });
const aiAnswer = (items: unknown[]) => ({ text: JSON.stringify(items), sources: ['sii.cl'] });
const falabella = { razonSocial: 'FALABELLA S.A.', rut: '90.749.000-9', nombreFantasia: '', giro: 'Tiendas', direccion: '', comuna: '', fuente: 'sii.cl' };

const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL_SEARCH', 'GEMINI_MODEL_STANDARD', 'GEMINI_MODEL_LITE'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
let fetchMock: jest.Mock;

function duckDuckGoBlocked() {
  fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.GEMINI_API_KEY = 'test-key';
  resetCompanyLookupState();
  grounded.mockReset();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('lookupCompaniesByName', () => {
  it('con la IA disponible devuelve sus resultados, y la misma búsqueda no vuelve a gastar cuota', async () => {
    grounded.mockResolvedValue(aiAnswer([falabella]));
    const first = await lookupCompaniesByName('Falabella');
    expect(first[0]).toMatchObject({ razonSocial: 'FALABELLA S.A.', rut: '90.749.000-9', rutVerified: true });

    await expect(lookupCompaniesByName('  falabella ')).resolves.toEqual(first);
    expect(grounded).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prueba el modelo una sola vez, sin los reintentos de los agentes', async () => {
    grounded.mockResolvedValue(aiAnswer([falabella]));
    await lookupCompaniesByName('Falabella');
    expect(grounded).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Falabella'), 'standard', { model: DEFAULT_AGENT_MODEL, maxRetries: 0 });
  });

  it('sin cuota y con DuckDuckGo bloqueado: dice que es la cuota, y la próxima búsqueda responde al instante', async () => {
    grounded.mockRejectedValue(quotaError());
    duckDuckGoBlocked();
    await expect(lookupCompaniesByName('Falabella')).rejects.toThrow(lookupUnavailableMessage('quota'));

    await expect(lookupCompaniesByName('Arauco')).rejects.toThrow(lookupUnavailableMessage('quota'));
    expect(grounded).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si la IA buscó y no encontró nada, es "sin resultados" aunque DuckDuckGo esté bloqueado', async () => {
    grounded.mockResolvedValue(aiAnswer([]));
    duckDuckGoBlocked();
    await expect(lookupCompaniesByName('Empresa inexistente')).resolves.toEqual([]);
  });

  it('con un modelo de búsqueda configurado sin cuota, prueba el siguiente (otra cuota)', async () => {
    process.env.GEMINI_MODEL_SEARCH = 'modelo-busqueda';
    grounded.mockRejectedValueOnce(quotaError()).mockResolvedValueOnce(aiAnswer([falabella]));
    const result = await lookupCompaniesByName('Falabella');
    expect(result).toHaveLength(1);
    expect(grounded.mock.calls.map((call) => call[3]?.model)).toEqual(['modelo-busqueda', DEFAULT_AGENT_MODEL]);
  });

  it('sin GEMINI_API_KEY y sin DuckDuckGo: avisa que no está configurada', async () => {
    delete process.env.GEMINI_API_KEY;
    duckDuckGoBlocked();
    await expect(lookupCompaniesByName('Falabella')).rejects.toThrow(lookupUnavailableMessage('not-configured'));
    expect(grounded).not.toHaveBeenCalled();
  });

  it('otra falla de la IA: mensaje genérico de "no disponible"', async () => {
    grounded.mockRejectedValue(Object.assign(new Error('model not found'), { status: 404 }));
    duckDuckGoBlocked();
    await expect(lookupCompaniesByName('Falabella')).rejects.toThrow(lookupUnavailableMessage('error'));
  });

  it('pide al menos 2 caracteres', async () => {
    await expect(lookupCompaniesByName(' a ')).rejects.toThrow(/al menos 2 caracteres/);
  });
});

describe('reglas del buscador', () => {
  it('modelos a probar: el de búsqueda primero, sin repetir', () => {
    const tierModel = (tier: 'standard' | 'lite') => (tier === 'standard' ? 'flash' : 'flash');
    expect(searchModels({}, tierModel)).toEqual(['flash']);
    expect(searchModels({ GEMINI_MODEL_SEARCH: ' busqueda ' }, (tier) => (tier === 'standard' ? 'flash' : 'lite'))).toEqual(['busqueda', 'flash', 'lite']);
  });

  it('la clave de caché ignora mayúsculas, tildes y espacios de más', () => {
    expect(lookupCacheKey('  Compañía   Minera  Ñuble ')).toBe(lookupCacheKey('compañia minera ñuble'));
  });

  it('cada causa tiene su propio mensaje', () => {
    const messages = (['quota', 'not-configured', 'error'] as const).map(lookupUnavailableMessage);
    expect(new Set(messages).size).toBe(3);
    expect(lookupUnavailableMessage('quota')).toMatch(/límite de consultas/);
  });
});
