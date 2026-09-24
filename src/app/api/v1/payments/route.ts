import { z } from 'zod';
import { apiError, apiOk, apiValidationError, authenticateApiRequest, type ApiContext } from '@/lib/api/public-api';
import { PAYMENT_METHOD_TYPES } from '@/modules/treasury/schema';
import { registerSalesPayment } from '@/modules/treasury/services/treasury.service';
import { emitPaymentEvent } from '@/modules/treasury/services/movements.service';

export const dynamic = 'force-dynamic';

const apiPaymentSchema = z.object({
  salesDocumentId: z.string().min(1),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(PAYMENT_METHOD_TYPES),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().max(120).optional(),
  treasuryAccountId: z.string().min(1).optional(),
});

/** Registra el cobro (total o parcial) de un documento de venta, igual que "Registrar abono" en Tesorería. */
export async function POST(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'treasury:write');
    const body: unknown = await req.json().catch(() => null);
    const parsed = apiPaymentSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error.issues);
    const { salesDocumentId, ...data } = parsed.data;
    const payment = await registerSalesPayment(ctx.companyId, salesDocumentId, { ...data, notes: 'Registrado vía API' });
    emitPaymentEvent(ctx.companyId, payment);
    return apiOk(
      { id: payment.id, salesDocumentId, amount: payment.amount, paymentMethod: payment.paymentMethod, paymentDate: payment.paymentDate, treasuryAccountId: payment.treasuryAccountId },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error, { route: 'POST /api/v1/payments', companyId: ctx?.companyId });
  }
}
