import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/webhooks/route';
import { createAuditLog } from '@/lib/auth/audit';

/**
 * OP-06 (auditoría 2026-09-14): el pago aplicado por un webhook de n8n y el
 * marcado del evento como PROCESSED no podían divergir. Antes de la
 * corrección, el handler de negocio (que puede registrar un abono real vía
 * Tesorería) y `markWebhookEventProcessed` corrían en operaciones separadas:
 * si el pago se aplicaba y luego fallaba el marcado, el evento quedaba
 * FAILED con el pago ya aplicado, y un reintento legítimo con el mismo
 * `eventId` volvía a aplicarlo (doble abono).
 *
 * Este test simula una base de datos en memoria con semántica real de
 * transacción (los cambios dentro de un `$transaction` solo se confirman si
 * el callback resuelve; si lanza, se descartan) e inyecta un único fallo en
 * el "marcado como procesado" para demostrar que un reintento con el mismo
 * eventId no duplica el abono.
 */

jest.mock('@/modules/webhooks/services/n8n-secret.service', () => ({
  resolveCompanyByN8nWebhookSecret: jest.fn().mockResolvedValue({ companyId: 'c1' }),
}));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/modules/accounting/posting-rules/treasury-posting', () => ({
  postSalesPaymentEntry: jest.fn().mockResolvedValue(undefined),
  postPurchasePaymentEntry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/observability', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

interface EventRecord {
  status: 'CLAIMED' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  eventType: string;
  payload?: unknown;
}

interface SalesDoc {
  id: string;
  companyId: string;
  folio: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  contactId: string;
}

interface PaymentRow {
  id: string;
  amount: number;
}

interface DbState {
  events: Map<string, EventRecord>;
  doc: SalesDoc;
  payments: PaymentRow[];
}

/** Controla si la PRÓXIMA vez que algo marque el evento como `PROCESSED`
 * (sea dentro de una transacción o con el cliente Prisma normal) debe
 * lanzar — simula una falla puntual de la base de datos justo en ese punto.
 * Se consume sola: la primera vez que dispara, se desactiva, para que el
 * reintento sí pueda completar. */
interface FailureControl {
  failNextMarkProcessed: boolean;
}

function cloneState(state: DbState): DbState {
  return {
    events: new Map(state.events),
    doc: { ...state.doc },
    payments: [...state.payments],
  };
}

/** Fábrica de un cliente Prisma "de mentira" sobre el estado dado — usado
 * tanto para operaciones fuera de transacción (claim, el lookup de la
 * versión anterior del handler, markFailed) como para el `tx` que recibe el
 * callback de `$transaction`. */
function makeDb(state: DbState, control: FailureControl) {
  return {
    processedWebhookEvent: {
      create: jest.fn(async ({ data }: { data: { eventId: string; eventType: string; status: string } }) => {
        if (state.events.has(data.eventId)) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        state.events.set(data.eventId, { status: data.status as EventRecord['status'], eventType: data.eventType });
        return { eventId: data.eventId };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { eventId: string; status?: string }; data: { status?: string } }) => {
        const existing = state.events.get(where.eventId);
        if (!existing) return { count: 0 };
        if (where.status && existing.status !== where.status) return { count: 0 };
        if (data.status === 'PROCESSED' && control.failNextMarkProcessed) {
          control.failNextMarkProcessed = false; // el fallo es puntual, no permanente
          throw new Error('DB caída justo al marcar el evento como procesado');
        }
        existing.status = (data.status as EventRecord['status']) ?? existing.status;
        return { count: 1 };
      }),
      findUnique: jest.fn(async ({ where }: { where: { provider_companyId_eventId: { eventId: string } } }) => {
        const existing = state.events.get(where.provider_companyId_eventId.eventId);
        return existing ? { ...existing } : null;
      }),
    },
    salesDocument: {
      findFirst: jest.fn(async ({ where }: { where: { folio?: number; companyId: string } }) => {
        if (where.folio !== undefined && where.folio !== state.doc.folio) return null;
        return { ...state.doc };
      }),
      update: jest.fn(async ({ data }: { data: Partial<SalesDoc> }) => {
        Object.assign(state.doc, data);
        return { ...state.doc };
      }),
    },
    payment: {
      create: jest.fn(async ({ data }: { data: { amount: number } }) => {
        const payment = { id: `pay-${state.payments.length + 1}`, amount: data.amount };
        state.payments.push(payment);
        return payment;
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('https://aether.example/api/webhooks/n8n', {
    method: 'POST',
    headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('OP-06: webhook de n8n no duplica un abono tras fallo parcial', () => {
  let main: DbState;

  beforeEach(() => {
    jest.clearAllMocks();
    main = {
      events: new Map(),
      doc: {
        id: 'doc1',
        companyId: 'c1',
        folio: 100,
        status: 'ISSUED',
        totalAmount: 100_000,
        paidAmount: 0,
        paymentStatus: 'UNPAID',
        contactId: 'cli1',
      },
      payments: [],
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Instala los mocks de Prisma. `control` es COMPARTIDO entre el cliente
   * "fuera de transacción" (usado por `claimWebhookEvent`/`markWebhookEventFailed`,
   * y por la versión anterior del handler, que marcaba PROCESSED sin tx) y
   * cada `tx` que abre `$transaction` (usado por la versión corregida) — así
   * el fallo inyectado se dispara sin importar cuál de los dos caminos marca
   * el evento como procesado.
   */
  function installPrismaMocks(control: FailureControl) {
    const outsideTxDb = makeDb(main, control);
    jest.spyOn(prisma.processedWebhookEvent, 'create').mockImplementation(outsideTxDb.processedWebhookEvent.create as never);
    jest.spyOn(prisma.processedWebhookEvent, 'updateMany').mockImplementation(outsideTxDb.processedWebhookEvent.updateMany as never);
    jest.spyOn(prisma.processedWebhookEvent, 'findUnique').mockImplementation(outsideTxDb.processedWebhookEvent.findUnique as never);
    // Solo lo usa la versión anterior del handler (`n8n-handler.service.ts`
    // buscaba el documento con el cliente Prisma normal, no con `tx`).
    jest.spyOn(prisma.salesDocument, 'findFirst').mockImplementation(outsideTxDb.salesDocument.findFirst as never);

    jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: (tx: ReturnType<typeof makeDb>) => unknown) => {
      const draft = cloneState(main);
      const txDb = makeDb(draft, control);
      const result = await callback(txDb as unknown as Parameters<typeof callback>[0]);
      // Commit: solo si el callback no lanzó, se aplica el draft al estado
      // principal — igual que una transacción real de Postgres.
      main.events = draft.events;
      main.doc = draft.doc;
      main.payments = draft.payments;
      return result;
    }) as never);
  }

  it('un reintento tras fallo de marcado NO duplica el abono', async () => {
    installPrismaMocks({ failNextMarkProcessed: true });

    const body = {
      eventId: 'evt-1',
      eventType: 'payment.confirmed',
      payload: { documentType: 'sales', folio: '100', amount: 20_000, paymentMethod: 'TRANSFERENCIA' },
    };

    const first = await POST(request(body));
    expect(first.status).toBe(500);
    // El pago NO debe quedar aplicado: el efecto de negocio y el marcado
    // revierten juntos cuando el marcado falla.
    expect(main.payments).toHaveLength(0);
    expect(main.doc.paidAmount).toBe(0);
    expect(main.events.get('evt-1')?.status).toBe('FAILED');
    // La bitácora solo se escribe tras confirmar: el pago revertido no queda auditado.
    expect(createAuditLog).not.toHaveBeenCalled();

    const retry = await POST(request(body));
    expect(retry.status).toBe(200);
    const retryJson = await retry.json();
    expect(retryJson.status).toBe('PROCESSED');

    // El reintento aplicó el pago exactamente una vez, no dos.
    expect(main.payments).toHaveLength(1);
    expect(main.doc.paidAmount).toBe(20_000);
    expect(main.events.get('evt-1')?.status).toBe('PROCESSED');
    expect(createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('un evento que procesa a la primera no se reintenta ni se duplica', async () => {
    installPrismaMocks({ failNextMarkProcessed: false });

    const body = {
      eventId: 'evt-2',
      eventType: 'payment.confirmed',
      payload: { documentType: 'sales', folio: '100', amount: 20_000, paymentMethod: 'TRANSFERENCIA' },
    };

    const first = await POST(request(body));
    expect(first.status).toBe(200);
    expect(main.payments).toHaveLength(1);
    expect(main.doc.paidAmount).toBe(20_000);

    // Un reintento del mismo eventId (n8n reenviando tras un timeout de red,
    // por ejemplo) se descarta por idempotencia y no vuelve a cobrar.
    const retry = await POST(request(body));
    expect(retry.status).toBe(200);
    const retryJson = await retry.json();
    expect(retryJson.status).toBe('DUPLICATE_IGNORED');
    expect(main.payments).toHaveLength(1);
    expect(main.doc.paidAmount).toBe(20_000);
  });
});
