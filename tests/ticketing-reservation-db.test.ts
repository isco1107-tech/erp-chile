/**
 * Reserva de cupo de entradas contra PostgreSQL REAL (solo una base local cuyo
 * nombre termina en `_test`, igual que `tests/hermes-link-db.test.ts`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_test \
 *     npx jest tests/ticketing-reservation-db.test.ts
 *
 * Lo que protege: una orden pública impaga reserva cupo solo hasta que vence
 * (un bot no acapara el evento), una persona no acumula más de N órdenes
 * impagas, y confirmar una orden vencida no sobrevende.
 */
import type { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;

function isSafeTestDatabase(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
}

const describeDb = isSafeTestDatabase(TEST_URL) ? describe : describe.skip;

describeDb('reserva de cupo de entradas contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let svc: typeof import('@/modules/ticketing/services/ticketing.service');
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = { company: '', project: '', ticketType: '' };
  const token = `tk-${suffix}`;

  const buy = (email: string, quantity: number) =>
    svc.createPublicTicketOrder(token, { ticketTypeId: ids.ticketType, buyerName: 'Compradora', buyerEmail: email, quantity });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    ({ prisma } = await import('@/lib/prisma'));
    svc = await import('@/modules/ticketing/services/ticketing.service');

    const company = await prisma.company.create({ data: { rut: `75${suffix}-2`, businessName: `Eventos ${suffix}`, status: 'ACTIVE' } });
    ids.company = company.id;
    const project = await prisma.project.create({
      data: { companyId: company.id, code: `P-${suffix}`, name: 'Gala', startDate: new Date(), ticketSalesToken: token },
    });
    ids.project = project.id;
    const ticketType = await prisma.ticketType.create({ data: { companyId: company.id, projectId: project.id, name: 'General', price: 10_000, quantityAvailable: 4 } });
    ids.ticketType = ticketType.id;
  });

  afterAll(async () => {
    await prisma.ticketSale.deleteMany({ where: { companyId: ids.company } });
    await prisma.ticketType.deleteMany({ where: { companyId: ids.company } });
    await prisma.project.deleteMany({ where: { companyId: ids.company } });
    await prisma.company.deleteMany({ where: { id: ids.company } });
    await prisma.$disconnect();
  });

  it('una orden impaga reserva cupo; al vencer lo libera', async () => {
    const { sale } = await buy(`a-${suffix}@correo.test`, 4);
    expect(sale.reservedUntil).not.toBeNull();
    await expect(buy(`b-${suffix}@correo.test`, 1)).rejects.toBeInstanceOf(svc.TicketSoldOutError);

    await prisma.ticketSale.updateMany({ where: { id: sale.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    const info = await svc.getPublicTicketingProjectByToken(token);
    expect(info?.ticketTypes[0]?.soldOut).toBe(false);
    await expect(buy(`b-${suffix}@correo.test`, 4)).resolves.toBeDefined();
  });

  it('confirmar una orden vencida cuyo cupo ya se vendió se rechaza (sin sobreventa)', async () => {
    const expired = await prisma.ticketSale.findFirstOrThrow({ where: { companyId: ids.company, buyerEmail: `a-${suffix}@correo.test` } });
    await expect(svc.confirmTicketPayment(ids.company, expired.id, { paidAmount: expired.totalAmount })).rejects.toBeInstanceOf(svc.TicketSoldOutError);
    expect((await prisma.ticketSale.findUniqueOrThrow({ where: { id: expired.id } })).paymentStatus).toBe('UNPAID');
  });

  it('confirmar fija la reserva: pagada ya no vence', async () => {
    const valid = await prisma.ticketSale.findFirstOrThrow({ where: { companyId: ids.company, buyerEmail: `b-${suffix}@correo.test` } });
    const updated = await svc.confirmTicketPayment(ids.company, valid.id, { paidAmount: valid.totalAmount });
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.reservedUntil).toBeNull();
  });

  it('una misma persona no acumula más de 3 órdenes impagas por evento', async () => {
    await prisma.ticketType.updateMany({ where: { id: ids.ticketType }, data: { quantityAvailable: null } });
    const email = `c-${suffix}@correo.test`;
    for (let i = 0; i < svc.MAX_OPEN_UNPAID_TICKET_ORDERS_PER_EMAIL; i += 1) await buy(email, 1);
    await expect(buy(email.toUpperCase(), 1)).rejects.toBeInstanceOf(svc.TicketTooManyPendingError);
  });
});
