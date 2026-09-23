import { prisma } from '@/lib/prisma';

/**
 * Entradas y votación pagada: los dos flujos públicos que mueven dinero real
 * y que hasta ahora no tenían ninguna prueba.
 *
 * Ambos dependen de que el precio y el estado de pago se calculen EN EL
 * SERVIDOR. Son formularios abiertos a internet: quien compra controla lo que
 * envía, así que cualquier monto que viniera del cliente sería un precio
 * negociable por el comprador.
 */

jest.mock('@/lib/email/mailer', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  getAppUrl: () => 'https://erp.test',
}));

// La confirmación de pago dispara el motor de automatizaciones (TICKET_PURCHASE_CONFIRMED /
// VOTE_ORDER_PAID) de forma fire-and-forget — no es lo que este archivo prueba (ver
// workflow-engine.test.ts), y sin mockearlo cada test dejaba una consulta Prisma real sin
// mockear resolviéndose después de que el test ya había terminado ("Cannot log after tests
// are done").
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn() }));

import { sendEmail } from '@/lib/email/mailer';
import {
  createPublicTicketOrder,
  confirmTicketPayment,
  checkInTicket,
} from '@/modules/ticketing/services/ticketing.service';
import { createPublicVoteOrder, confirmVotePayment } from '@/modules/public-voting/services/public-voting.service';
import { decodeVoteToken, encodeVoteToken } from '@/modules/public-voting/schema';

/** El token de votación exige exactamente 64 caracteres hexadecimales. */
const HEX64 = 'a'.repeat(64);
const HEX64_ALT = 'b'.repeat(64);

interface TicketTypeStub {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  price: number;
  salesOpen: boolean;
  quantityAvailable: number | null;
  sales: Array<{ quantity: number }>;
}

/** Simula la transacción: ejecuta el callback con un cliente falso. */
function mockTicketTransaction(ticketType: TicketTypeStub | null) {
  const created: Array<Record<string, unknown>> = [];

  jest.spyOn(prisma, '$transaction').mockImplementation((async (callback: unknown) => {
    const tx = {
      $queryRaw: async () => [],
      ticketType: { findFirst: async () => ticketType },
      ticketSale: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'venta_1', ...data };
        },
      },
    };
    return (callback as (client: unknown) => Promise<unknown>)(tx);
  }) as never);

  return created;
}

function ticketTypeStub(overrides: Partial<TicketTypeStub> = {}): TicketTypeStub {
  return {
    id: 'tt_1',
    companyId: 'cmp_1',
    projectId: 'prj_1',
    name: 'General',
    price: 12000,
    salesOpen: true,
    quantityAvailable: 100,
    sales: [],
    ...overrides,
  };
}

describe('Compra pública de entradas', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue({ id: 'prj_1', companyId: 'cmp_1' } as never);
  });

  it('calcula el total en el servidor a partir del precio del catálogo', async () => {
    // El comprador manda cantidad, nunca precio: si el monto viniera del
    // formulario, cualquiera podría comprar entradas a $1.
    const creadas = mockTicketTransaction(ticketTypeStub({ price: 12000 }));

    const { sale } = await createPublicTicketOrder('token_1', {
      ticketTypeId: 'tt_1',
      buyerName: 'Ana',
      buyerEmail: 'ana@test.cl',
      quantity: 3,
    } as never);

    expect(sale.totalAmount).toBe(36000);
    expect(creadas[0].paymentStatus).toBe('UNPAID');
  });

  it('bloquea la venta cuando no queda cupo suficiente', async () => {
    const tipo = ticketTypeStub({ quantityAvailable: 10, sales: [{ quantity: 8 }] });
    mockTicketTransaction(tipo);

    await expect(
      createPublicTicketOrder('token_1', {
        ticketTypeId: 'tt_1',
        buyerName: 'Ana',
        buyerEmail: 'ana@test.cl',
        quantity: 3,
      } as never)
    ).rejects.toThrow(/no quedan suficientes/i);
  });

  it('permite ocupar exactamente el último cupo', async () => {
    // El límite es "sobrepasar", no "alcanzar": rechazar la venta que deja el
    // aforo justo en su tope dejaría siempre una entrada sin vender.
    mockTicketTransaction(ticketTypeStub({ quantityAvailable: 10, sales: [{ quantity: 8 }] }));

    const { sale } = await createPublicTicketOrder('token_1', {
      ticketTypeId: 'tt_1',
      buyerName: 'Ana',
      buyerEmail: 'ana@test.cl',
      quantity: 2,
    } as never);

    expect(sale.quantity).toBe(2);
  });

  it('no aplica límite cuando el aforo es ilimitado', async () => {
    mockTicketTransaction(ticketTypeStub({ quantityAvailable: null, sales: [{ quantity: 9999 }] }));

    const { sale } = await createPublicTicketOrder('token_1', {
      ticketTypeId: 'tt_1',
      buyerName: 'Ana',
      buyerEmail: 'ana@test.cl',
      quantity: 50,
    } as never);

    expect(sale.quantity).toBe(50);
  });

  it('rechaza un tipo de entrada con la venta cerrada', async () => {
    mockTicketTransaction(ticketTypeStub({ salesOpen: false }));

    await expect(
      createPublicTicketOrder('token_1', {
        ticketTypeId: 'tt_1',
        buyerName: 'Ana',
        buyerEmail: 'ana@test.cl',
        quantity: 1,
      } as never)
    ).rejects.toThrow(/no está disponible/i);
  });

  it('rechaza un token de venta desconocido', async () => {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);

    await expect(
      createPublicTicketOrder('token_falso', {
        ticketTypeId: 'tt_1',
        buyerName: 'Ana',
        buyerEmail: 'ana@test.cl',
        quantity: 1,
      } as never)
    ).rejects.toThrow(/inválido o expirado/i);
  });

  it('genera un código QR único por orden', async () => {
    const creadas = mockTicketTransaction(ticketTypeStub());

    await createPublicTicketOrder('token_1', {
      ticketTypeId: 'tt_1',
      buyerName: 'Ana',
      buyerEmail: 'ana@test.cl',
      quantity: 1,
    } as never);

    expect(String(creadas[0].qrCode)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('Confirmación de pago de entradas', () => {
  function mockSale(overrides: Record<string, unknown> = {}) {
    const venta = {
      id: 'venta_1',
      companyId: 'cmp_1',
      buyerName: 'Ana',
      buyerEmail: 'ana@test.cl',
      quantity: 2,
      totalAmount: 24000,
      paidAmount: 0,
      paymentStatus: 'UNPAID',
      qrCode: 'qr-1',
      ticketType: { name: 'General' },
      project: { name: 'Gala 2026' },
      ...overrides,
    };

    const actualizado: Array<Record<string, unknown>> = [];
    jest.spyOn(prisma.ticketSale, 'findFirst').mockResolvedValue(venta as never);
    jest.spyOn(prisma.ticketSale, 'updateMany').mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
      actualizado.push(data);
      return { count: 1 };
    }) as never);
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue({ businessName: 'Productora' } as never);

    return actualizado;
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    (sendEmail as jest.Mock).mockClear();
  });

  it('deriva el estado del pago en el servidor, no del formulario', async () => {
    const actualizado = mockSale();
    await confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 24000 } as never);
    expect(actualizado[0].paymentStatus).toBe('PAID');
  });

  it('marca PARTIAL un abono y UNPAID un monto cero', async () => {
    const parcial = mockSale();
    await confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 10000 } as never);
    expect(parcial[0].paymentStatus).toBe('PARTIAL');

    jest.restoreAllMocks();
    const cero = mockSale();
    await confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 0 } as never);
    expect(cero[0].paymentStatus).toBe('UNPAID');
  });

  it('rechaza un pago mayor que el total de la orden', async () => {
    mockSale();
    await expect(confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 99999 } as never)).rejects.toThrow(/supera el total/i);
  });

  it('envía el correo con el QR al pasar a pagada', async () => {
    mockSale();
    await confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 24000 } as never);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('no reenvía el correo si la orden ya estaba pagada', async () => {
    // Reconfirmar un pago es normal (corrección de un monto, doble clic); el
    // comprador no debería recibir su entrada dos veces por eso.
    mockSale({ paymentStatus: 'PAID', paidAmount: 24000 });
    await confirmTicketPayment('cmp_1', 'venta_1', { paidAmount: 24000 } as never);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('Control de acceso con QR', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('rechaza una entrada sin el pago confirmado', async () => {
    jest.spyOn(prisma.ticketSale, 'findFirst').mockResolvedValue({
      id: 'venta_1',
      paymentStatus: 'UNPAID',
      checkedInAt: null,
    } as never);

    await expect(checkInTicket('cmp_1', 'qr-1')).rejects.toThrow(/pago confirmado/i);
  });

  it('es idempotente: no pisa la hora del primer ingreso', async () => {
    // Escanear dos veces el mismo QR en la puerta es habitual; lo que importa
    // es que el segundo escaneo se identifique como repetido en vez de
    // registrar un ingreso nuevo.
    const primeraEntrada = new Date('2026-09-10T20:00:00Z');
    jest.spyOn(prisma.ticketSale, 'findFirst').mockResolvedValue({
      id: 'venta_1',
      paymentStatus: 'PAID',
      checkedInAt: primeraEntrada,
    } as never);
    const update = jest.spyOn(prisma.ticketSale, 'updateMany');

    const { alreadyCheckedIn } = await checkInTicket('cmp_1', 'qr-1');

    expect(alreadyCheckedIn).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza un QR inexistente', async () => {
    jest.spyOn(prisma.ticketSale, 'findFirst').mockResolvedValue(null);
    await expect(checkInTicket('cmp_1', 'qr-inventado')).rejects.toThrow(/no encontrado/i);
  });
});

describe('Token de votación', () => {
  it('codifica y decodifica el precio por voto', () => {
    expect(decodeVoteToken(encodeVoteToken(HEX64, 2500))).toEqual({ pricePerVote: 2500 });
  });

  it('rechaza tokens con precio inválido o formato desconocido', () => {
    expect(decodeVoteToken(`${HEX64}.0`)).toBeNull();
    expect(decodeVoteToken(`${HEX64}.-500`)).toBeNull();
    expect(decodeVoteToken('sin-punto')).toBeNull();
  });
});

describe('Compra pública de votos', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (sendEmail as jest.Mock).mockClear();
  });

  const TOKEN = encodeVoteToken(HEX64, 1500);

  function mockVoteOrder() {
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue({ id: 'prj_1', companyId: 'cmp_1' } as never);
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
      id: 'cand_1',
      fullName: 'Ana Pérez',
      stageName: 'Ana',
    } as never);

    const creadas: Array<Record<string, unknown>> = [];
    jest.spyOn(prisma.voteOrder, 'create').mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
      creadas.push(data);
      return { id: 'vo_1', ...data };
    }) as never);
    return creadas;
  }

  it('calcula el total con el precio del token, no con uno enviado por el comprador', async () => {
    const creadas = mockVoteOrder();

    await createPublicVoteOrder(TOKEN, {
      candidateId: 'cand_1',
      buyerEmail: 'fan@test.cl',
      voteCount: 4,
    } as never);

    expect(creadas[0].pricePerVote).toBe(1500);
    expect(creadas[0].totalAmount).toBe(6000);
    expect(creadas[0].paymentStatus).toBe('UNPAID');
  });

  it('no acepta un token con el precio alterado', async () => {
    // El token no va firmado, pero la búsqueda usa el token COMPLETO contra la
    // base: un precio cambiado a mano no corresponde a ningún proyecto. Si
    // alguna vez se "optimiza" esta consulta para buscar solo por la parte
    // aleatoria, el comprador pasaría a fijar su propio precio.
    mockVoteOrder();
    jest.spyOn(prisma.project, 'findUnique').mockResolvedValue(null);

    await expect(
      createPublicVoteOrder(encodeVoteToken(HEX64_ALT, 1), {
        candidateId: 'cand_1',
        buyerEmail: 'fan@test.cl',
        voteCount: 1000,
      } as never)
    ).rejects.toThrow(/inválido o expirado/i);
  });

  it('rechaza votar por una candidata retirada o de otro certamen', async () => {
    mockVoteOrder();
    jest.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);

    await expect(
      createPublicVoteOrder(TOKEN, {
        candidateId: 'cand_ajena',
        buyerEmail: 'fan@test.cl',
        voteCount: 1,
      } as never)
    ).rejects.toThrow(/no existe o no participa/i);
  });

  it('rechaza un token con formato inválido antes de tocar la base', async () => {
    const lookup = jest.spyOn(prisma.project, 'findUnique');

    await expect(
      createPublicVoteOrder('token-malformado', {
        candidateId: 'cand_1',
        buyerEmail: 'fan@test.cl',
        voteCount: 1,
      } as never)
    ).rejects.toThrow(/inválido o expirado/i);

    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('Confirmación de pago de votos', () => {
  function mockOrder(overrides: Record<string, unknown> = {}) {
    const orden = {
      id: 'vo_1',
      companyId: 'cmp_1',
      buyerEmail: 'fan@test.cl',
      voteCount: 4,
      totalAmount: 6000,
      paidAmount: 0,
      paymentStatus: 'UNPAID',
      project: { name: 'Gala 2026' },
      candidate: { fullName: 'Ana Pérez', stageName: 'Ana' },
      ...overrides,
    };

    const actualizado: Array<Record<string, unknown>> = [];
    jest.spyOn(prisma.voteOrder, 'findFirst').mockResolvedValue(orden as never);
    jest.spyOn(prisma.voteOrder, 'updateMany').mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
      actualizado.push(data);
      return { count: 1 };
    }) as never);
    jest.spyOn(prisma.company, 'findUnique').mockResolvedValue({ businessName: 'Productora' } as never);
    return actualizado;
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    (sendEmail as jest.Mock).mockClear();
  });

  it('deriva el estado del pago en el servidor', async () => {
    const actualizado = mockOrder();
    await confirmVotePayment('cmp_1', 'vo_1', { paidAmount: 6000 } as never);
    expect(actualizado[0].paymentStatus).toBe('PAID');
  });

  it('rechaza un pago mayor que el total', async () => {
    mockOrder();
    await expect(confirmVotePayment('cmp_1', 'vo_1', { paidAmount: 99999 } as never)).rejects.toThrow(/supera el total/i);
  });

  it('no reenvía la confirmación si la orden ya estaba pagada', async () => {
    mockOrder({ paymentStatus: 'PAID', paidAmount: 6000 });
    await confirmVotePayment('cmp_1', 'vo_1', { paidAmount: 6000 } as never);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
