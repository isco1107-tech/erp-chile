import { workflowRuleInputSchema } from '@/modules/automation/schema';

/**
 * Es la única puerta de entrada al `Json` de `WorkflowRule` — lo que pase
 * este schema se guarda tal cual y el motor lo ejecuta después sin volver a
 * validarlo. Por eso importa que rechace lo inválido, no solo que acepte lo
 * válido.
 */

function baseRule(overrides: Partial<Parameters<typeof workflowRuleInputSchema.parse>[0]> = {}) {
  return {
    name: 'Mi regla',
    trigger: 'SALE_ISSUED',
    conditions: [],
    actions: [{ type: 'SEND_EMAIL', to: 'a@b.cl', subject: 'x', body: 'y' }],
    isActive: true,
    ...overrides,
  };
}

describe('Validación de una regla de automatización', () => {
  it('acepta una regla mínima válida', () => {
    expect(workflowRuleInputSchema.safeParse(baseRule()).success).toBe(true);
  });

  it('rechaza un nombre vacío', () => {
    expect(workflowRuleInputSchema.safeParse(baseRule({ name: '' })).success).toBe(false);
  });

  it('rechaza una regla sin ninguna acción', () => {
    expect(workflowRuleInputSchema.safeParse(baseRule({ actions: [] })).success).toBe(false);
  });

  it('rechaza un disparador que no existe', () => {
    expect(workflowRuleInputSchema.safeParse(baseRule({ trigger: 'ALGO_INVENTADO' })).success).toBe(false);
  });

  it('rechaza un webhook con URL http (no cifrada)', () => {
    const result = workflowRuleInputSchema.safeParse(baseRule({ actions: [{ type: 'CALL_WEBHOOK', url: 'http://example.com' }] }));
    expect(result.success).toBe(false);
  });

  it('rechaza un webhook que apunta a una IP privada', () => {
    const result = workflowRuleInputSchema.safeParse(baseRule({ actions: [{ type: 'CALL_WEBHOOK', url: 'https://192.168.1.1/hook' }] }));
    expect(result.success).toBe(false);
  });

  it('acepta un webhook con URL https pública', () => {
    const result = workflowRuleInputSchema.safeParse(baseRule({ actions: [{ type: 'CALL_WEBHOOK', url: 'https://hooks.zapier.com/x' }] }));
    expect(result.success).toBe(true);
  });

  it('rechaza una notificación con severidad fuera de catálogo', () => {
    const result = workflowRuleInputSchema.safeParse(
      baseRule({ actions: [{ type: 'CREATE_NOTIFICATION', title: 't', message: 'm', severity: 'URGENTE' }] })
    );
    expect(result.success).toBe(false);
  });

  it('rechaza más de 10 condiciones', () => {
    const conditions = Array.from({ length: 11 }, () => ({ field: 'totalAmount', operator: 'equals' as const, value: '1' }));
    expect(workflowRuleInputSchema.safeParse(baseRule({ conditions })).success).toBe(false);
  });

  it('rechaza un operador de condición desconocido', () => {
    const result = workflowRuleInputSchema.safeParse(baseRule({ conditions: [{ field: 'totalAmount', operator: 'parecido_a', value: '1' }] }));
    expect(result.success).toBe(false);
  });
});
