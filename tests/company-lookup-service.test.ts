/**
 * Buscador de empresas (company-lookup.service.ts): con una persona esperando,
 * cada modelo se prueba una vez, la cuota agotada o el bloqueo de DuckDuckGo
 * no se vuelven a esperar en cada búsqueda, y el mensaje dice la causa real.
 * Caso real (producción, 2026-09-28): Gemini 429 "exceeded your current
 * quota" + DuckDuckGo 403, tras ~18 s de reintentos.
 */
jest.mock('@/modules/agents/services/gemini-agent', () => ({
  generateGroundedText: jest.fn(),
  generateAgentJson: jest.fn(),
  isRateLimitError: (error: unknown) => (error as { status?: number } | null)?.status === 429,
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import { generateAgentJson, generateGroundedText } from '@/modules/agents/services/gemini-agent';
import { DEFAULT_AGENT_MODEL } from '@/modules/agents/services/model-tiers';
import { lookupCompaniesByName, resetCompanyLookupState } from '@/modules/contacts/services/company-lookup.service';
import {
  lookupCacheKey,
  lookupUnavailableMessage,
  onlyRutsFoundInText,
  rutsInText,
  searchModels,
  webResultsAsText,
  type CompanyLookupCandidate,
} from '@/modules/contacts/services/company-lookup-parse';

const grounded = generateGroundedText as jest.MockedFunction<typeof generateGroundedText>;
const extractJson = generateAgentJson as jest.Mock;
const quotaError = () => Object.assign(new Error('You exceeded your current quota'), { status: 429 });
const aiAnswer = (items: unknown[]) => ({ text: JSON.stringify(items), sources: ['sii.cl'] });
const falabella = { razonSocial: 'FALABELLA S.A.', rut: '90.749.000-9', nombreFantasia: '', giro: 'Tiendas', direccion: '', comuna: '', fuente: 'sii.cl' };

const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL_SEARCH', 'GEMINI_MODEL_STANDARD', 'GEMINI_MODEL_LITE', 'TAVILY_API_KEY'] as const;
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
  extractJson.mockReset();
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

// ─── Tavily + Gemini sin búsqueda ───────────────────────────────────────────

const TAVILY_URL = 'https://api.tavily.com/search';
const tavilyResults = [
  { title: 'Falabella S.A. - RUT y datos tributarios', url: 'https://www.rutchile.cl/falabella', content: 'FALABELLA S.A. RUT 90.749.000-9, Rosas 1665, Santiago. Tiendas por departamento.', score: 0.9 },
  { title: 'Falabella | Sitio oficial', url: 'https://www.falabella.com', content: 'Compra online', score: 0.5 },
];

function routeFetch(handlers: { tavily?: () => unknown; ddg?: () => unknown }) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith(TAVILY_URL)) return Promise.resolve(handlers.tavily ? handlers.tavily() : { ok: false, status: 500, json: async () => ({}) });
    return Promise.resolve(handlers.ddg ? handlers.ddg() : { ok: false, status: 403, text: async () => 'Forbidden' });
  });
}

const tavilyOk = (results: unknown[]) => () => ({ ok: true, status: 200, json: async () => ({ query: 'x', results }) });

/** Gemini "ordena" los resultados: se ejecuta el `parse` real del servicio. */
function aiExtracts(items: unknown[]) {
  extractJson.mockImplementation((_system: string, _user: string, _schema: unknown, parse: (raw: unknown) => unknown) => Promise.resolve(parse(items)));
}

describe('lookupCompaniesByName con Tavily', () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'tvly-test';
  });

  it('busca en Tavily con la clave en el encabezado y la IA ordena los resultados, sin tocar la búsqueda con Google', async () => {
    routeFetch({ tavily: tavilyOk(tavilyResults) });
    aiExtracts([{ ...falabella, direccion: 'Rosas 1665', comuna: 'Santiago' }]);

    const result = await lookupCompaniesByName('Falabella');
    expect(result[0]).toMatchObject({ razonSocial: 'FALABELLA S.A.', rut: '90.749.000-9', rutVerified: true, address: 'Rosas 1665' });
    expect(grounded).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(TAVILY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tvly-test');
    expect(JSON.parse(init.body)).toMatchObject({ query: expect.stringContaining('Falabella'), search_depth: 'basic' });
    // La IA recibe los resultados como texto, y en el nivel liviano.
    expect(extractJson.mock.calls[0]?.[1]).toContain('90.749.000-9');
    expect(extractJson.mock.calls[0]?.[4]).toBe('lite');
  });

  it('un RUT que no aparece en los resultados se descarta aunque pase Módulo 11 (la IA pudo inventarlo)', async () => {
    routeFetch({ tavily: tavilyOk(tavilyResults) });
    aiExtracts([{ ...falabella, rut: '76.086.428-5' }]);
    const [candidate] = await lookupCompaniesByName('Falabella');
    expect(candidate).toMatchObject({ razonSocial: 'FALABELLA S.A.', rut: '', rutVerified: false });
  });

  it('si la IA falla, el RUT sale de los resultados por expresión regular', async () => {
    routeFetch({ tavily: tavilyOk(tavilyResults) });
    extractJson.mockRejectedValue(new Error('429'));
    const [candidate] = await lookupCompaniesByName('Falabella');
    expect(candidate).toMatchObject({ rut: '90.749.000-9', rutVerified: true });
    expect(candidate?.sourceNote).toContain('www.rutchile.cl');
  });

  it('Tavily sin créditos: se salta un rato y el mensaje dice que es el límite', async () => {
    routeFetch({ tavily: () => ({ ok: false, status: 432, json: async () => ({}) }) });
    delete process.env.GEMINI_API_KEY;
    await expect(lookupCompaniesByName('Falabella')).rejects.toThrow(lookupUnavailableMessage('quota'));
    await expect(lookupCompaniesByName('Arauco')).rejects.toThrow(lookupUnavailableMessage('quota'));
    expect(fetchMock.mock.calls.filter(([url]) => url === TAVILY_URL)).toHaveLength(1);
  });

  it('Tavily respondió sin resultados: es "sin resultados", aunque las demás fuentes fallen', async () => {
    routeFetch({ tavily: tavilyOk([]) });
    grounded.mockRejectedValue(quotaError());
    await expect(lookupCompaniesByName('Empresa inexistente')).resolves.toEqual([]);
  });

  it('Tavily caído: sigue con las demás fuentes', async () => {
    routeFetch({ tavily: () => ({ ok: false, status: 500, json: async () => ({}) }) });
    grounded.mockResolvedValue(aiAnswer([falabella]));
    await expect(lookupCompaniesByName('Falabella')).resolves.toHaveLength(1);
  });
});

describe('RUT de resultados web', () => {
  const candidate = (rut: string): CompanyLookupCandidate => ({
    razonSocial: 'X',
    rut,
    rutVerified: rut !== '',
    nombreFantasia: '',
    giro: '',
    address: '',
    region: '',
    comuna: '',
    sourceNote: '',
  });

  it('reconoce los RUT válidos del texto, con o sin puntos', () => {
    expect([...rutsInText('RUT 90.749.000-9 y también 76086428-5; este no: 76.086.428-1')].sort()).toEqual(['760864285', '907490009']);
  });

  it('solo conserva el RUT si aparece en el texto', () => {
    const text = 'FALABELLA S.A. 90749000-9';
    expect(onlyRutsFoundInText([candidate('90.749.000-9'), candidate('76.086.428-5'), candidate('')], text).map((c) => [c.rut, c.rutVerified])).toEqual([
      ['90.749.000-9', true],
      ['', false],
      ['', false],
    ]);
  });

  it('los resultados como texto numerado, con tope de largo', () => {
    const text = webResultsAsText([{ title: 'A', url: 'a.cl', snippet: 'uno' }, { title: 'B', url: 'b.cl', snippet: 'dos' }]);
    expect(text).toBe('[1] A — a.cl\nuno\n\n[2] B — b.cl\ndos');
    expect(webResultsAsText([{ title: 'A', url: 'a.cl', snippet: 'x'.repeat(100) }], 20)).toHaveLength(20);
  });
});
