import { prisma } from '@/lib/prisma';

/**
 * Disparadores nuevos del motor de automatizaciones: se emiten recién después
 * de que la transacción de negocio confirmó, nunca si falló (CLAUDE.md §1,
 * "Motor de automatizaciones").
 */

jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { WORKFLOW_TRIGGER_DEFINITIONS } from '@/lib/workflows/types';
import { registerInstallmentPayment } from '@/modules/payment-plans/services/payment-plans.service';

const installment = { id: 'cuota1', paymentPlanId: 'plan1', amount: 50000, paidAmount: 0 };

function fakeTx() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    paymentPlanInstallment: {
      findFirst: jest.fn().mockResolvedValue(installment),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ paymentStatus: 'PARTIAL' }]),
    },
    paymentPlan: {
      updateMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ contactId: 'contact1' }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'payment1' }) },
  };
  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (t: typeof tx) => unknown) => callback(tx)) as never);
  jest.spyOn(prisma.paymentPlan, 'findFirst').mockResolvedValue({ candidate: { fullName: 'Valentina Rojas' } } as never);
  return tx;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(emitWorkflowEvent).mockClear();
});

describe('INSTALLMENT_PAID (pago presencial)', () => {
  it('se emite con la beneficiaria y el canal MANUAL tras confirmar el cobro', async () => {
    fakeTx();
    await registerInstallmentPayment('c1', 'cuota1', 20000, 'TRANSFERENCIA');

    expect(emitWorkflowEvent).toHaveBeenCalledWith('c1', 'INSTALLMENT_PAID', {
      paymentPlanId: 'plan1',
      candidateName: 'Valentina Rojas',
      amount: 20000,
      channel: 'MANUAL',
      payerEmail: null,
    });
  });

  // N-15 (auditoría 2026-09-14): sin este `Payment`, `getCashFlow` no veía el cobro.
  it('genera un Payment INCOME vinculado al plan y a la cuota', async () => {
    const tx = fakeTx();
    await registerInstallmentPayment('c1', 'cuota1', 20000, 'TRANSFERENCIA');

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: {
        companyId: 'c1',
        type: 'INCOME',
        contactId: 'contact1',
        paymentPlanId: 'plan1',
        paymentPlanInstallmentId: 'cuota1',
        amount: 20000,
        paymentMethod: 'TRANSFERENCIA',
        paymentDate: expect.any(Date),
      },
    });
  });

  it('no se emite si el cobro se rechaza', async () => {
    fakeTx();
    await expect(registerInstallmentPayment('c1', 'cuota1', 999999, 'TRANSFERENCIA')).rejects.toThrow('supera el saldo');
    expect(emitWorkflowEvent).not.toHaveBeenCalled();
  });
});

describe('Catálogo de disparadores', () => {
  it('cada disparador nuevo declara campos que una regla puede usar en condiciones', () => {
    for (const trigger of ['INSTALLMENT_PAID', 'PROMISSORY_NOTE_PAID', 'FEE_DOCUMENT_PAID', 'CASH_SHIFT_CLOSED', 'PURCHASE_REVIEWED', 'GOODS_RECEIPT_CREATED', 'LEAVE_REQUEST_REVIEWED'] as const) {
      expect(WORKFLOW_TRIGGER_DEFINITIONS[trigger].event).toBe(trigger);
      expect(WORKFLOW_TRIGGER_DEFINITIONS[trigger].fields.length).toBeGreaterThan(0);
    }
  });
});
