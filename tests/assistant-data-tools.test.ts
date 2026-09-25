import { DATA_TOOLS, availableDataTools, canSeeMargins } from '@/modules/agents/assistant-data-tools';
import { buildManualSystemPrompt } from '@/modules/manual/prompt';
import { DEFAULT_FEATURES } from '@/lib/auth/modules';

describe('availableDataTools', () => {
  it('sin permisos de datos no ofrece ninguna consulta', () => {
    expect(availableDataTools([])).toEqual([]);
  });

  it('cada consulta exige todos sus permisos (y con ellos, el módulo contratado)', () => {
    expect(availableDataTools(['sales:read'])).toEqual(['getSalesMarginSummary']);
    expect(availableDataTools(['treasury:read'])).toEqual(['getOverdueBalances']);
    // IVA cruza ventas y compras: sin el módulo de Compras no se ofrece.
    expect(availableDataTools(['sales:read', 'treasury:read'])).not.toContain('getVatProjection');
    expect(availableDataTools(['sales:read', 'purchases:read', 'treasury:read'])).toEqual([
      'getSalesMarginSummary',
      'getOverdueBalances',
      'getVatProjection',
    ]);
  });

  it('el margen solo se muestra a quien puede ver costos', () => {
    expect(canSeeMargins(['sales:read'])).toBe(false);
    expect(canSeeMargins(['sales:read', 'products:costs'])).toBe(true);
  });

  it('las declaraciones usan el nombre de la consulta', () => {
    for (const [name, tool] of Object.entries(DATA_TOOLS)) expect(tool.declaration.name).toBe(name);
  });
});

describe('buildManualSystemPrompt con consultas de datos', () => {
  const base = { features: { ...DEFAULT_FEATURES }, permissions: [], companyName: 'Demo', userName: 'Ana' };

  it('sin consultas, dice que no tiene acceso a los datos y ya no deriva a un Copiloto', () => {
    const prompt = buildManualSystemPrompt(base);
    expect(prompt).toContain('No tienes acceso a los datos reales');
    expect(prompt).not.toContain('Copiloto');
  });

  it('con consultas, lista solo las habilitadas', () => {
    const prompt = buildManualSystemPrompt({ ...base, dataTools: [{ name: 'getOverdueBalances', summary: 'morosos' }] });
    expect(prompt).toContain('`getOverdueBalances` (morosos)');
    expect(prompt).not.toContain('getSalesMarginSummary');
  });
});
