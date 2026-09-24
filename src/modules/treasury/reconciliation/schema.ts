import { z } from 'zod';

/** Contrapartidas permitidas al registrar un movimiento de cartola que no es cobro/pago de un documento. */
export const STATEMENT_COUNTERPARTS = {
  GASTOS_FINANCIEROS: { label: 'Comisión o gasto bancario', direction: 'EXPENSE' },
  GASTOS_OPERACIONALES: { label: 'Otro gasto de la empresa', direction: 'EXPENSE' },
  OTROS_INGRESOS: { label: 'Otro ingreso (intereses, reintegros)', direction: 'INCOME' },
  COBROS_POR_DOCUMENTAR: { label: 'Cobro sin documento (boleta/factura pendiente)', direction: 'INCOME' },
} as const;

export type StatementCounterpart = keyof typeof STATEMENT_COUNTERPARTS;

export const statementActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MATCH'), paymentId: z.string().min(1) }),
  z.object({ kind: z.literal('SALES_DOCUMENT'), salesDocumentId: z.string().min(1) }),
  z.object({ kind: z.literal('PURCHASE_DOCUMENT'), purchaseDocumentId: z.string().min(1) }),
  z.object({
    kind: z.literal('OTHER'),
    counterpart: z.enum(Object.keys(STATEMENT_COUNTERPARTS) as [StatementCounterpart, ...StatementCounterpart[]]),
    description: z.string().trim().max(200).optional(),
  }),
  z.object({ kind: z.literal('IGNORE') }),
  z.object({ kind: z.literal('UNDO') }),
]);

export type StatementAction = z.infer<typeof statementActionSchema>;
