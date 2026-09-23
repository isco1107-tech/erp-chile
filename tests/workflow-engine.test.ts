import { prisma } from '@/lib/prisma';

/**
 * Orquestación del motor: qué reglas corren, en qué orden se ejecutan sus
 * acciones, y qué se persiste como historial. El motor tiene un contrato
 * explícito de "nunca lanza" — un error acá no debe poder tumbar la venta o
 * el pago que lo disparó — así que se prueba también que sostiene eso ante
 * un error de base de datos.
 */

jest.mock('@/lib/workflows/action-runner', () => ({
  runWorkflowAction: jest.fn(),
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn() }));

import { runWorkflowAction } from '@/lib/workflows/action-runner';
import { captureException } from '@/lib/observability';
import { emitWorkflowEvent } from '@/lib/workflows/engine';

const mockRunAction = runWorkflowAction as jest.Mock;

function ruleFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rule_1',
    name: 'Regla de prueba',
    conditions: [],
    actions: [{ type: 'SEND_EMAIL', to: 'a@b.cl', subject: 'x', body: 'y' }],
    signingSecret: 'secreto',
    ...overrides,
  };
}

describe('emitWorkflowEvent', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockRunAction.mockReset();
  });

  it('no hace nada si no hay reglas activas para ese disparador', async () => {
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([]);
    const create = jest.spyOn(prisma.workflowExecution, 'create');

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', { totalAmount: 100 });

    expect(create).not.toHaveBeenCalled();
  });

  it('no ejecuta acciones ni registra ejecución si las condiciones no matchean', async () => {
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([
      ruleFixture({ conditions: [{ field: 'totalAmount', operator: 'greater_than', value: '1000' }] }),
    ] as never);
    const create = jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', { totalAmount: 100 });

    expect(mockRunAction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('ejecuta las acciones en el orden declarado', async () => {
    const orden: string[] = [];
    mockRunAction.mockImplementation(async (action: { type: string }) => {
      orden.push(action.type);
      return { type: action.type, success: true, detail: 'ok' };
    });
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([
      ruleFixture({
        actions: [
          { type: 'SEND_EMAIL', to: 'a@b.cl', subject: 'x', body: 'y' },
          { type: 'CREATE_NOTIFICATION', title: 't', message: 'm', severity: 'INFO' },
          { type: 'CALL_WEBHOOK', url: 'https://example.com' },
        ],
      }),
    ] as never);
    jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {});

    expect(orden).toEqual(['SEND_EMAIL', 'CREATE_NOTIFICATION', 'CALL_WEBHOOK']);
  });

  it('marca SUCCESS cuando todas las acciones tienen éxito', async () => {
    mockRunAction.mockResolvedValue({ type: 'SEND_EMAIL', success: true, detail: 'ok' });
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([ruleFixture()] as never);
    const create = jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {});

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }));
  });

  it('marca FAILED cuando ninguna acción tiene éxito', async () => {
    mockRunAction.mockResolvedValue({ type: 'SEND_EMAIL', success: false, detail: 'error' });
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([ruleFixture()] as never);
    const create = jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {});

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('marca PARTIAL_FAILURE cuando algunas acciones fallan y otras no', async () => {
    mockRunAction
      .mockResolvedValueOnce({ type: 'SEND_EMAIL', success: true, detail: 'ok' })
      .mockResolvedValueOnce({ type: 'CALL_WEBHOOK', success: false, detail: 'error' });
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([
      ruleFixture({ actions: [{ type: 'SEND_EMAIL', to: 'a@b.cl', subject: 'x', body: 'y' }, { type: 'CALL_WEBHOOK', url: 'https://example.com' }] }),
    ] as never);
    const create = jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {});

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PARTIAL_FAILURE' }) }));
  });

  it('evalúa cada regla activa del disparador de forma independiente', async () => {
    mockRunAction.mockResolvedValue({ type: 'SEND_EMAIL', success: true, detail: 'ok' });
    jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([ruleFixture({ id: 'rule_1' }), ruleFixture({ id: 'rule_2' })] as never);
    const create = jest.spyOn(prisma.workflowExecution, 'create').mockResolvedValue({} as never);

    await emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {});

    expect(create).toHaveBeenCalledTimes(2);
  });

  it('nunca lanza: un error de base de datos se reporta a observabilidad, no se propaga', async () => {
    jest.spyOn(prisma.workflowRule, 'findMany').mockRejectedValue(new Error('conexión perdida'));

    await expect(emitWorkflowEvent('cmp_1', 'SALE_ISSUED', {})).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });

  it('solo consulta reglas activas del disparador y la empresa correctos', async () => {
    const findMany = jest.spyOn(prisma.workflowRule, 'findMany').mockResolvedValue([]);

    await emitWorkflowEvent('cmp_42', 'RECEIVABLE_OVERDUE', {});

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'cmp_42', trigger: 'RECEIVABLE_OVERDUE', isActive: true } }));
  });
});
