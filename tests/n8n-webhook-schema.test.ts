import { paymentConfirmedEventSchema, n8nWebhookEnvelopeSchema } from '@/modules/webhooks/schema';

/**
 * El payload de `payment.confirmed` llega desde una automatización externa
 * (n8n leyendo una cartola bancaria) — a diferencia de un formulario del
 * ERP, nadie revisa esto antes de que dispare un cobro real en Tesorería
 * (`registerSalesPayment`/`registerPurchasePayment`), así que el schema es
 * la única barrera contra un payload malformado o un monto negativo.
 */
describe('paymentConfirmedEventSchema', () => {
  const valid = {
    documentType: 'sales' as const,
    folio: '1245',
    amount: 89000,
    paymentMethod: 'TRANSFERENCIA' as const,
  };

  it('acepta un payload válido mínimo', () => {
    expect(paymentConfirmedEventSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza documentType fuera de sales/purchase', () => {
    const result = paymentConfirmedEventSchema.safeParse({ ...valid, documentType: 'invoice' });
    expect(result.success).toBe(false);
  });

  it('rechaza monto cero o negativo', () => {
    expect(paymentConfirmedEventSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(paymentConfirmedEventSchema.safeParse({ ...valid, amount: -100 }).success).toBe(false);
  });

  it('rechaza monto no entero', () => {
    expect(paymentConfirmedEventSchema.safeParse({ ...valid, amount: 89000.5 }).success).toBe(false);
  });

  it('rechaza folio vacío', () => {
    expect(paymentConfirmedEventSchema.safeParse({ ...valid, folio: '' }).success).toBe(false);
  });

  it('rechaza forma de pago fuera del catálogo chileno', () => {
    expect(paymentConfirmedEventSchema.safeParse({ ...valid, paymentMethod: 'BITCOIN' }).success).toBe(false);
  });

  it('usa TRANSFERENCIA por defecto si no se especifica forma de pago', () => {
    const { documentType, folio, amount } = valid;
    const result = paymentConfirmedEventSchema.safeParse({ documentType, folio, amount });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentMethod).toBe('TRANSFERENCIA');
  });
});

describe('n8nWebhookEnvelopeSchema', () => {
  it('exige eventId y eventType', () => {
    expect(n8nWebhookEnvelopeSchema.safeParse({ eventId: 'evt-1', eventType: 'payment.confirmed' }).success).toBe(true);
    expect(n8nWebhookEnvelopeSchema.safeParse({ eventType: 'payment.confirmed' }).success).toBe(false);
    expect(n8nWebhookEnvelopeSchema.safeParse({ eventId: 'evt-1' }).success).toBe(false);
  });

  it('permite payload ausente y lo normaliza a objeto vacío', () => {
    const result = n8nWebhookEnvelopeSchema.safeParse({ eventId: 'evt-1', eventType: 'payment.confirmed' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.payload).toEqual({});
  });
});
