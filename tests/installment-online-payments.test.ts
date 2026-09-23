import { prisma } from '@/lib/prisma';

/**
 * Pago en línea de cuotas de candidatas (portal `/pagar/[token]` + Khipu).
 *
 * Lo que se protege acá: que ninguna cuota quede pagada sin que Khipu lo
 * confirme con el monto exacto de la orden, que el monto a cobrar salga del
 * saldo en base de datos (nunca del navegador) y que un pago que llega sobre
 * una cuota ya saldada se informe como excedente en vez de inventarse.
 */

jest.mock('@/lib/email/mailer', () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: 'logged', provider: 'none' }),
  getAppUrl: () => 'https://erp.test',
}));

jest.mock('@/lib/payments/khipu', () => ({
  createKhipuPayment: jest.fn(),
  getKhipuPayment: jest.fn(),
}));

process.env.TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || 'clave-de-prueba-para-tests';

import { createKhipuPayment, getKhipuPayment } from '@/lib/payments/khipu';
import { decryptPaymentCredential, encryptPaymentCredential } from '@/lib/payments/crypto';
import { allocateOrderPayment, evaluateKhipuPayment, formatReceiptNumber, maskPersonName } from '@/modules/payment-plans/online-payment-calc';
import { publicInstallmentCheckoutSchema } from '@/modules/payment-plans/schema';
import {
  createOnlinePaymentOrder,
  InstallmentSelectionError,
  OnlinePaymentsDisabledError,
  PortalNotFoundError,
  syncOrderWithProvider,
} from '@/modules/payment-plans/services/online-payment.service';
import { buildInstallmentReceiptPdf } from '@/modules/payment-plans/services/receipt-pdf.service';
import { buildInstallmentPaymentReceiptEmail } from '@/lib/email/templates';

const TOKEN = 'a'.repeat(64);
const VALID_RUT = '12.345.678-5';

describe('evaluateKhipuPayment', () => {
  const order = { id: 'ord_1', amount: 150000 };
  const done = { status: 'done', status_detail: 'normal', amount: 150000, currency: 'CLP', transaction_id: 'ord_1' };

  it('acepta un cobro terminado que calza en monto, moneda y orden', () => {
    expect(evaluateKhipuPayment(done, order)).toEqual({ outcome: 'PAID' });
  });

  it('deja en espera un cobro pendiente o en verificación', () => {
    expect(evaluateKhipuPayment({ ...done, status: 'pending' }, order).outcome).toBe('PENDING');
    expect(evaluateKhipuPayment({ ...done, status: 'verifying' }, order).outcome).toBe('PENDING');
  });

  it('no aplica un cobro de otro monto ni de otra orden', () => {
    expect(evaluateKhipuPayment({ ...done, amount: 1000 }, order).outcome).toBe('MISMATCH');
    expect(evaluateKhipuPayment({ ...done, transaction_id: 'ord_2' }, order).outcome).toBe('MISMATCH');
    expect(evaluateKhipuPayment({ ...done, currency: 'USD' }, order).outcome).toBe('MISMATCH');
  });

  it('trata un cobro revertido o rechazado como fallido aunque diga done', () => {
    expect(evaluateKhipuPayment({ ...done, status_detail: 'reversed' }, order).outcome).toBe('FAILED');
    expect(evaluateKhipuPayment({ ...done, status: 'pending', status_detail: 'rejected-by-payer' }, order).outcome).toBe('FAILED');
  });
});

describe('allocateOrderPayment', () => {
  it('salda cada cuota con lo que la orden le asignó', () => {
    const result = allocateOrderPayment(
      [
        { installmentId: 'i1', amount: 50000 },
        { installmentId: 'i2', amount: 50000 },
      ],
      [
        { id: 'i1', amount: 50000, paidAmount: 0 },
        { id: 'i2', amount: 50000, paidAmount: 0 },
      ]
    );
    expect(result.excess).toBe(0);
    expect(result.allocations.map((a) => a.paymentStatus)).toEqual(['PAID', 'PAID']);
  });

  it('informa como excedente lo que ya se había pagado a mano mientras la orden estaba en curso', () => {
    const result = allocateOrderPayment([{ installmentId: 'i1', amount: 50000 }], [{ id: 'i1', amount: 50000, paidAmount: 20000 }]);
    expect(result.allocations[0]).toMatchObject({ applied: 30000, newPaidAmount: 50000, paymentStatus: 'PAID' });
    expect(result.excess).toBe(20000);
  });

  it('una cuota que ya no existe va entera al excedente', () => {
    const result = allocateOrderPayment([{ installmentId: 'borrada', amount: 10000 }], []);
    expect(result.allocations).toHaveLength(0);
    expect(result.excess).toBe(10000);
  });
});

describe('utilidades del portal', () => {
  it('enmascara el nombre de la candidata', () => {
    expect(maskPersonName('María José González Pérez')).toBe('María J. G. P.');
    expect(maskPersonName('  Ana  ')).toBe('Ana');
  });

  it('formatea el número de comprobante', () => {
    expect(formatReceiptNumber(42)).toBe('N° 000042');
  });

  it('cifra la API key de Khipu y detecta alteraciones', () => {
    const stored = encryptPaymentCredential('llave-secreta-khipu');
    expect(stored).not.toContain('llave-secreta-khipu');
    expect(decryptPaymentCredential(stored)).toBe('llave-secreta-khipu');
    const [iv, tag, data] = stored.split('.');
    const tampered = [iv, tag, Buffer.from('otro-contenido').toString('base64')].join('.');
    expect(() => decryptPaymentCredential(tampered)).toThrow();
    expect(data).toBeDefined();
  });

  it('el checkout exige RUT válido y cuotas sin repetir', () => {
    const base = { rut: VALID_RUT, installmentIds: ['i1'], payerName: 'Ana Pérez', payerEmail: 'ana@test.cl' };
    expect(publicInstallmentCheckoutSchema.safeParse(base).success).toBe(true);
    expect(publicInstallmentCheckoutSchema.safeParse({ ...base, rut: '12.345.678-9' }).success).toBe(false);
    expect(publicInstallmentCheckoutSchema.safeParse({ ...base, installmentIds: ['i1', 'i1'] }).success).toBe(false);
    expect(publicInstallmentCheckoutSchema.safeParse({ ...base, installmentIds: [] }).success).toBe(false);
  });

  it('genera el comprobante PDF aunque el nombre traiga caracteres fuera de Latin-1', async () => {
    const pdf = await buildInstallmentReceiptPdf({
      companyName: 'Producciones “Aether”',
      companyRut: '76123456-0',
      receiptNumber: 7,
      paidAt: new Date('2026-09-23T15:00:00Z'),
      payerName: 'Papá de Ana 👑',
      payerEmail: 'papa@test.cl',
      candidateName: 'Ana Pérez',
      candidateRutClean: '123456785',
      projectName: 'Miss Valparaíso 2026',
      items: [{ installmentNumber: 1, amount: 50000 }],
      installmentCount: 6,
      amount: 50000,
      providerLabel: 'Transferencia vía Khipu',
      providerPaymentId: 'kh_1',
      payerBank: 'Banco Estado',
    });
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('el correo de confirmación escapa el HTML de los nombres', () => {
    const email = buildInstallmentPaymentReceiptEmail({
      companyName: 'Aether',
      recipientName: '<script>x</script>',
      candidateName: 'Ana P.',
      projectName: null,
      receiptLabel: 'N° 000001',
      paidAtLabel: '23-09-2026 12:00',
      items: [{ installmentNumber: 2, amount: 50000 }],
      installmentCount: 6,
      amount: 50000,
      receiptUrl: 'https://erp.test/pagar/estado/abc',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('$50.000');
    expect(email.subject).toContain('N° 2');
  });
});

describe('createOnlinePaymentOrder', () => {
  function mockPortal(khipuApiCredential: string | null) {
    jest.spyOn(prisma.companySettings, 'findUnique').mockResolvedValue({
      companyId: 'cmp_1',
      bankTransferInfo: null,
      khipuApiCredential,
      company: { businessName: 'Aether', status: 'ACTIVE', features: { hasInstallmentPlans: true } },
    } as never);
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.mocked(createKhipuPayment).mockReset();
  });

  const input = { rut: VALID_RUT, installmentIds: ['i2', 'i1'], payerName: 'Ana Pérez', payerEmail: 'Ana@Test.cl' };

  it('rechaza un token mal formado sin consultar la base', async () => {
    const spy = jest.spyOn(prisma.companySettings, 'findUnique');
    await expect(createOnlinePaymentOrder('corto', input)).rejects.toBeInstanceOf(PortalNotFoundError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sin cuenta de Khipu conectada no crea ninguna orden', async () => {
    mockPortal(null);
    const tx = jest.spyOn(prisma, '$transaction');
    await expect(createOnlinePaymentOrder(TOKEN, input)).rejects.toBeInstanceOf(OnlinePaymentsDisabledError);
    expect(tx).not.toHaveBeenCalled();
  });

  it('cobra el saldo pendiente leído de la base, no un monto del cliente', async () => {
    mockPortal(encryptPaymentCredential('api-key-de-prueba'));
    const created: Array<Record<string, unknown>> = [];
    jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: unknown) => {
      const tx = {
        $queryRaw: async () => [],
        paymentPlanInstallment: {
          findMany: async () => [
            { id: 'i1', installmentNumber: 1, paymentPlanId: 'plan_1', amount: 50000, paidAmount: 10000, paymentStatus: 'PARTIAL', onlinePayments: [], paymentPlan: { id: 'plan_1', candidate: { fullName: 'Ana Pérez', project: { name: 'Miss 2026' } } } },
            { id: 'i2', installmentNumber: 2, paymentPlanId: 'plan_1', amount: 50000, paidAmount: 0, paymentStatus: 'UNPAID', onlinePayments: [], paymentPlan: { id: 'plan_1', candidate: { fullName: 'Ana Pérez', project: { name: 'Miss 2026' } } } },
          ],
        },
        installmentPaymentOrder: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created.push(data);
            return { id: 'ord_1', paymentUrl: null, items: [], ...data };
          },
        },
      };
      return (callback as (client: unknown) => Promise<unknown>)(tx);
    }) as never);
    jest.spyOn(prisma.installmentPaymentOrder, 'updateMany').mockResolvedValue({ count: 1 } as never);
    jest.mocked(createKhipuPayment).mockResolvedValue({ paymentId: 'kh_1', paymentUrl: 'https://khipu.com/payment/info/kh_1' });

    const result = await createOnlinePaymentOrder(TOKEN, input);

    expect(result.paymentUrl).toBe('https://khipu.com/payment/info/kh_1');
    expect(created[0]).toMatchObject({ amount: 90000, payerEmail: 'ana@test.cl', candidateRutClean: '123456785' });
    const khipuCall = jest.mocked(createKhipuPayment).mock.calls[0]!;
    expect(khipuCall[0]).toBe('api-key-de-prueba');
    expect(khipuCall[1]).toMatchObject({ amount: 90000, transactionId: 'ord_1', notifyUrl: 'https://erp.test/api/public/installments/khipu/notify' });
  });

  it('rechaza cuotas que no pertenecen a la candidata de ese RUT', async () => {
    mockPortal(encryptPaymentCredential('api-key-de-prueba'));
    jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: unknown) => {
      const tx = { $queryRaw: async () => [], paymentPlanInstallment: { findMany: async () => [] } };
      return (callback as (client: unknown) => Promise<unknown>)(tx);
    }) as never);

    await expect(createOnlinePaymentOrder(TOKEN, input)).rejects.toBeInstanceOf(InstallmentSelectionError);
    expect(createKhipuPayment).not.toHaveBeenCalled();
  });
});

describe('syncOrderWithProvider', () => {
  const pendingOrder = {
    id: 'ord_1',
    companyId: 'cmp_1',
    status: 'PENDING',
    amount: 90000,
    providerPaymentId: 'kh_1',
    expiresAt: new Date(Date.now() + 60_000),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(prisma.installmentPaymentOrder, 'findUnique').mockResolvedValue(pendingOrder as never);
    jest.spyOn(prisma.companySettings, 'findUnique').mockResolvedValue({ khipuApiCredential: encryptPaymentCredential('k') } as never);
  });

  it('no marca pagado mientras Khipu diga que el cobro sigue pendiente', async () => {
    jest.mocked(getKhipuPayment).mockResolvedValue({ payment_id: 'kh_1', status: 'pending', amount: 90000, currency: 'CLP', transaction_id: 'ord_1' });
    const tx = jest.spyOn(prisma, '$transaction');
    await expect(syncOrderWithProvider('ord_1')).resolves.toBe('PENDING');
    expect(tx).not.toHaveBeenCalled();
  });

  it('no aplica un cobro "done" cuyo monto no calza con la orden', async () => {
    jest.mocked(getKhipuPayment).mockResolvedValue({ payment_id: 'kh_1', status: 'done', amount: 100, currency: 'CLP', transaction_id: 'ord_1' });
    const tx = jest.spyOn(prisma, '$transaction');
    await expect(syncOrderWithProvider('ord_1')).resolves.toBe('PENDING');
    expect(tx).not.toHaveBeenCalled();
  });

  it('una orden ya pagada no vuelve a consultar ni a aplicar nada', async () => {
    jest.spyOn(prisma.installmentPaymentOrder, 'findUnique').mockResolvedValue({ ...pendingOrder, status: 'PAID' } as never);
    jest.mocked(getKhipuPayment).mockClear();
    await expect(syncOrderWithProvider('ord_1')).resolves.toBe('PAID');
    expect(getKhipuPayment).not.toHaveBeenCalled();
  });
});
