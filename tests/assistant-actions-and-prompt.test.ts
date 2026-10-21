import { MODULE_KEYS, type CompanyFeatureFlags, type FeatureKey } from '@/lib/auth/modules';
import { ALL_PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import { AGENT_ACTIONS, availableAgentActions, type AgentActor } from '@/modules/agent-actions/registry';
import { FULL_MANUAL_PROMPT_LIMIT, MANUAL_LOOKUP_TOOL, buildManualSystemPrompt, lookupManual } from '@/modules/manual/prompt';

/**
 * El asistente ahora puede dejar listas más cosas (producto, tarea,
 * solicitud de compra, cotización en borrador…). Lo que importa: que solo
 * ofrezca lo que el rol permite, que traduzca bien lo que dice la persona
 * (precio con IVA → neto) y que el resumen muestre lo que se va a guardar.
 */

function features(enabled: FeatureKey[]): CompanyFeatureFlags {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, enabled.includes(key)])) as CompanyFeatureFlags;
}

const actor = (permissions: Permission[]): AgentActor => ({ companyId: 'cmp_1', userId: 'usr_1', userName: 'Ana', permissions });

describe('Acciones del asistente', () => {
  it('solo ofrece las acciones cuyo permiso tiene el usuario', () => {
    expect(availableAgentActions([]).map((action) => action.type)).toEqual([]);
    expect(availableAgentActions(['products:write', 'tasks:write']).map((action) => action.type).sort()).toEqual(['CREATE_PRODUCT', 'CREATE_TASK']);
  });

  it('ninguna acción emite documentos tributarios, mueve stock ni registra pagos', () => {
    const forbidden = /emitir|emite el|registrar pago|registra un pago|anular/i;
    for (const action of Object.values(AGENT_ACTIONS)) {
      expect(action.description).not.toMatch(forbidden);
      expect(action.auditEntity).toBeTruthy();
    }
  });

  it('CREATE_PRODUCT convierte un precio con IVA a neto y lo muestra en el resumen', async () => {
    const resolved = await AGENT_ACTIONS.CREATE_PRODUCT!.resolve(actor(['products:write']), { sku: 'cafe-500', name: 'Café de grano 500 g', price: 11900, priceIncludesVat: true });
    expect(resolved.payload).toMatchObject({ sku: 'CAFE-500', netPrice: 10000, isExempt: false, unit: 'UN' });
    expect(resolved.summary).toContain('$10.000 neto');
    expect(resolved.summary).toContain('$11.900 con IVA');
  });

  it('CREATE_PRODUCT no descuenta IVA a un producto exento', async () => {
    const resolved = await AGENT_ACTIONS.CREATE_PRODUCT!.resolve(actor(['products:write']), { sku: 'LIBRO', name: 'Libro', price: 15000, priceIncludesVat: true, isExempt: true });
    expect(resolved.payload).toMatchObject({ netPrice: 15000, isExempt: true });
    expect(resolved.summary).toContain('exento');
  });

  it('CREATE_PRODUCT rechaza un precio ausente', async () => {
    await expect(AGENT_ACTIONS.CREATE_PRODUCT!.resolve(actor(['products:write']), { sku: 'X', name: 'Algo' })).rejects.toThrow('precio');
  });

  it('CREATE_TASK propia, repetitiva y con plazo', async () => {
    const resolved = await AGENT_ACTIONS.CREATE_TASK!.resolve(actor(['tasks:write']), { title: 'Revisar el stock crítico', dueDate: '2026-10-05', recurrence: 'WEEKLY', priority: 'HIGH' });
    expect(resolved.payload).toMatchObject({ title: 'Revisar el stock crítico', dueDate: '2026-10-05', recurrence: 'WEEKLY', priority: 'HIGH', assigneeId: null });
    expect(resolved.summary).toContain('para ti');
    expect(resolved.summary).toContain('cada semana');
  });

  it('CREATE_PURCHASE_REQUEST queda en borrador salvo que se pida enviarla', async () => {
    const draft = await AGENT_ACTIONS.CREATE_PURCHASE_REQUEST!.resolve(actor(['purchases:request']), { title: 'Insumos de aseo', items: [{ description: 'Cloro', quantity: 5, unit: 'LT' }] });
    expect(draft.payload).toMatchObject({ submit: false });
    expect(draft.summary).toContain('en borrador');
    const submitted = await AGENT_ACTIONS.CREATE_PURCHASE_REQUEST!.resolve(actor(['purchases:request']), { title: 'Insumos de aseo', items: [{ description: 'Cloro', quantity: 5 }], submit: true });
    expect(submitted.summary).toContain('enviada a aprobación');
  });
});

describe('Prompt del asistente con manual grande', () => {
  const base = { companyName: 'Demo', userName: 'Ana' };
  const ALL = features([...MODULE_KEYS]);

  it('con todos los módulos usa el índice y la herramienta de consulta', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: ALL, permissions: ALL_PERMISSIONS, currentPath: '/dashboard/treasury/banks' });
    expect(prompt).toContain('ÍNDICE DEL MANUAL');
    expect(prompt).toContain(MANUAL_LOOKUP_TOOL);
    // El detalle de la pantalla actual va completo igual.
    expect(prompt).toContain('Conciliar la cartola');
    expect(prompt).toContain('"Conciliar automáticamente"');
  });

  it('una empresa chica recibe el manual completo, sin índice', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: features(['hasInventory']), permissions: ['products:read', 'products:write', 'contacts:read'] });
    expect(prompt).toContain('MANUAL POR MÓDULO');
    expect(prompt).not.toContain('ÍNDICE DEL MANUAL');
    expect(prompt.length).toBeLessThan(FULL_MANUAL_PROMPT_LIMIT + 40_000);
  });

  it('pide responder con enlaces a pantallas reales', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: ALL, permissions: ALL_PERMISSIONS });
    expect(prompt).toContain('[Cuentas por Cobrar](/dashboard/treasury/cxc)');
  });

  it('lista las acciones nuevas con sus campos', () => {
    const prompt = buildManualSystemPrompt({ ...base, features: ALL, permissions: ALL_PERMISSIONS });
    for (const type of ['CREATE_PRODUCT', 'CREATE_QUOTATION', 'CREATE_TASK', 'CREATE_OPPORTUNITY', 'CREATE_PROJECT', 'CREATE_PURCHASE_REQUEST']) expect(prompt).toContain(type);
  });
});

describe('consultarManual', () => {
  const ALL = features([...MODULE_KEYS]);

  it('devuelve los pasos de una sección por id', () => {
    const text = lookupManual(ALL, ALL_PERMISSIONS, { seccion: 'cheques' });
    expect(text).toContain('Registrar un cheque');
    expect(text).toContain('/dashboard/manual#cheques');
  });

  it('busca por palabras clave sin tildes', () => {
    expect(lookupManual(ALL, ALL_PERMISSIONS, { consulta: 'liquidacion' })).toContain('Calcular las liquidaciones del mes');
  });

  it('no revela módulos no contratados ni temas que el rol no puede hacer', () => {
    expect(lookupManual(features(['hasInventory']), ALL_PERMISSIONS, { seccion: 'remuneraciones' })).toContain('No hay nada en el manual');
    expect(lookupManual(ALL, ['products:read'], { seccion: 'catalogo-inventario' })).not.toContain('Agregar un producto al catálogo');
  });
});
