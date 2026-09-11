import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma, type PaymentStatus, type TicketSale, type TicketType } from '@prisma/client';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { sendEmail, getAppUrl } from '@/lib/email/mailer';
import { buildTicketConfirmationEmail } from '@/lib/email/templates';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import type { ConfirmTicketPaymentInput, PublicTicketPurchaseInput, TicketTypeCreateInput, TicketTypeUpdateInput } from '../schema';

// ---------------------------------------------------------------------------
// Errores tipados del flujo público — mismo criterio que
// `candidates.service.ts` (`RegistrationNotFoundError`, etc.): permiten que el
// Route Handler devuelva el código HTTP correcto en vez de un 500 genérico.
// ---------------------------------------------------------------------------

export class TicketSalesNotFoundError extends Error {}
export class TicketTypeClosedError extends Error {}
/** Cupo agotado — chequeo definitivo con lock de fila dentro de la transacción, mismo patrón que `RegistrationFullError`. */
export class TicketSoldOutError extends Error {}

async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El proyecto/certamen no existe o no pertenece a esta empresa');
}

// ---------------------------------------------------------------------------
// Link público de venta (`Project.ticketSalesToken`)
// ---------------------------------------------------------------------------

/** Idempotente: compartir el link varias veces desde el panel no invalida uno que ya esté circulando. */
export async function getOrCreateTicketSalesToken(companyId: string, projectId: string): Promise<string> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { ticketSalesToken: true } });
  if (!project) throw new Error('Proyecto no encontrado');
  if (project.ticketSalesToken) return project.ticketSalesToken;

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { ticketSalesToken: token } });
  return token;
}

export async function regenerateTicketSalesToken(companyId: string, projectId: string): Promise<string> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('Proyecto no encontrado');

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { ticketSalesToken: token } });
  return token;
}

// ---------------------------------------------------------------------------
// CRUD de tipos de entrada (panel interno)
// ---------------------------------------------------------------------------

export async function createTicketType(companyId: string, data: TicketTypeCreateInput): Promise<TicketType> {
  await assertProjectOwnership(companyId, data.projectId);
  return prisma.ticketType.create({
    data: {
      companyId,
      projectId: data.projectId,
      name: data.name,
      price: data.price,
      quantityAvailable: data.quantityAvailable ?? null,
      salesOpen: data.salesOpen,
    },
  });
}

export async function updateTicketType(companyId: string, id: string, data: TicketTypeUpdateInput): Promise<TicketType> {
  const result = await prisma.ticketType.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      price: data.price,
      quantityAvailable: data.quantityAvailable === undefined ? undefined : data.quantityAvailable,
      salesOpen: data.salesOpen,
    },
  });
  if (result.count === 0) throw new Error('Tipo de entrada no encontrado');

  const ticketType = await prisma.ticketType.findFirst({ where: { id, companyId } });
  if (!ticketType) throw new Error('Tipo de entrada no encontrado');
  return ticketType;
}

/** Solo se permite eliminar un tipo de entrada sin ventas registradas — igual criterio que `deleteSponsorshipContract`. */
export async function deleteTicketType(companyId: string, id: string): Promise<void> {
  const ticketType = await prisma.ticketType.findFirst({ where: { id, companyId }, include: { _count: { select: { sales: true } } } });
  if (!ticketType) throw new Error('Tipo de entrada no encontrado');
  if (ticketType._count.sales > 0) {
    throw new Error('No se puede eliminar: este tipo de entrada ya tiene ventas registradas. Ciérralo (deja de vender) en vez de eliminarlo.');
  }

  const result = await prisma.ticketType.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Tipo de entrada no encontrado');
}

export async function listTicketTypes(companyId: string, projectId?: string): Promise<TicketType[]> {
  return prisma.ticketType.findMany({
    where: { companyId, projectId: projectId || undefined },
    orderBy: { createdAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Ventas (panel interno)
// ---------------------------------------------------------------------------

export type TicketSaleWithType = TicketSale & { ticketType: Pick<TicketType, 'id' | 'name' | 'price'> };

export interface TicketSaleListFilters {
  projectId?: string;
  paymentStatus?: PaymentStatus;
  /** Coincide contra nombre, correo o código QR. */
  search?: string;
}

export async function listTicketSales(companyId: string, filters: TicketSaleListFilters = {}): Promise<TicketSaleWithType[]> {
  const where: Prisma.TicketSaleWhereInput = {
    companyId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
  };
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { buyerName: { contains: term, mode: 'insensitive' } },
      { buyerEmail: { contains: term, mode: 'insensitive' } },
      { qrCode: { contains: term, mode: 'insensitive' } },
    ];
  }

  return prisma.ticketSale.findMany({
    where,
    include: { ticketType: { select: { id: true, name: true, price: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export interface TicketingSummaryRow {
  ticketTypeId: string;
  name: string;
  price: number;
  quantityAvailable: number | null;
  salesOpen: boolean;
  /** Suma de `quantity` de TODAS las órdenes (cualquier `paymentStatus`) — es lo que se descuenta del cupo (ver `createPublicTicketOrder`). */
  quantitySold: number;
  /** Suma de `quantity` solo de órdenes `PAID`. */
  quantityConfirmed: number;
  checkedIn: number;
  revenueConfirmed: number;
}

/**
 * Totales por tipo de entrada. El cupo (`quantityAvailable`) se descuenta
 * contra TODAS las órdenes, no solo las `PAID` — una orden `UNPAID` ya
 * reservó el cupo (evita sobreventa mientras el comprador todavía no
 * transfiere); si nunca paga, el staff debe eliminar/cancelar la orden a mano
 * para liberarlo. Este es el mismo criterio documentado en
 * `createPublicTicketOrder`.
 */
export async function getTicketingSummary(companyId: string, projectId: string): Promise<TicketingSummaryRow[]> {
  const ticketTypes = await prisma.ticketType.findMany({
    where: { companyId, projectId },
    include: { sales: { select: { quantity: true, paymentStatus: true, totalAmount: true, checkedInAt: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return ticketTypes.map((tt) => {
    const quantitySold = tt.sales.reduce((sum, s) => sum + s.quantity, 0);
    const paidSales = tt.sales.filter((s) => s.paymentStatus === 'PAID');
    const quantityConfirmed = paidSales.reduce((sum, s) => sum + s.quantity, 0);
    const revenueConfirmed = paidSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const checkedIn = tt.sales.filter((s) => s.checkedInAt !== null).length;
    return {
      ticketTypeId: tt.id,
      name: tt.name,
      price: tt.price,
      quantityAvailable: tt.quantityAvailable,
      salesOpen: tt.salesOpen,
      quantitySold,
      quantityConfirmed,
      checkedIn,
      revenueConfirmed,
    };
  });
}

// ---------------------------------------------------------------------------
// Flujo público (acceso por token, sin cuenta ERP)
// ---------------------------------------------------------------------------

export interface PublicTicketingProjectInfo {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  bankTransferInfo: string | null;
  ticketTypes: Array<Pick<TicketType, 'id' | 'name' | 'price' | 'salesOpen'> & { soldOut: boolean }>;
}

/** Resuelve TODO lo que ve el comprador a partir del token — nunca de un `companyId`/`projectId` que mande el cliente. */
export async function getPublicTicketingProjectByToken(token: string): Promise<PublicTicketingProjectInfo | null> {
  const project = await prisma.project.findUnique({
    where: { ticketSalesToken: token },
    include: {
      company: { select: { businessName: true, settings: { select: { bankTransferInfo: true } } } },
      ticketTypes: { include: { sales: { select: { quantity: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!project) return null;

  return {
    projectId: project.id,
    projectName: project.name,
    companyId: project.companyId,
    companyName: project.company.businessName,
    bankTransferInfo: project.company.settings?.bankTransferInfo ?? null,
    ticketTypes: project.ticketTypes.map((tt) => {
      const sold = tt.sales.reduce((sum, s) => sum + s.quantity, 0);
      return {
        id: tt.id,
        name: tt.name,
        price: tt.price,
        salesOpen: tt.salesOpen,
        soldOut: tt.quantityAvailable !== null && sold >= tt.quantityAvailable,
      };
    }),
  };
}

/**
 * Crea la orden de compra pública. `companyId`/`projectId` se resuelven
 * SIEMPRE del token, nunca de un campo del formulario. `paymentStatus`
 * siempre entra en `UNPAID` — no hay pasarela de pago, el staff confirma a
 * mano desde el panel (`confirmTicketPayment`).
 */
export async function createPublicTicketOrder(
  token: string,
  data: PublicTicketPurchaseInput
): Promise<{ sale: TicketSale; ticketTypeName: string }> {
  const project = await prisma.project.findUnique({
    where: { ticketSalesToken: token },
    select: { id: true, companyId: true },
  });
  if (!project) throw new TicketSalesNotFoundError('Link de venta de entradas inválido o expirado');

  return prisma.$transaction(async (tx) => {
      // Lock de fila sobre el tipo de entrada: mismo patrón que el cupo de
      // candidatas — evita que dos compras simultáneas con 1 cupo libre
      // pasen ambas.
      await tx.$queryRaw`SELECT id FROM "TicketType" WHERE id = ${data.ticketTypeId} AND "companyId" = ${project.companyId} FOR UPDATE`;

      const ticketType = await tx.ticketType.findFirst({
        where: { id: data.ticketTypeId, companyId: project.companyId, projectId: project.id },
        include: { sales: { select: { quantity: true } } },
      });
      if (!ticketType) throw new TicketSalesNotFoundError('El tipo de entrada seleccionado no existe');
      if (!ticketType.salesOpen) throw new TicketTypeClosedError('Este tipo de entrada no está disponible por el momento');

      if (ticketType.quantityAvailable !== null) {
        const sold = ticketType.sales.reduce((sum, s) => sum + s.quantity, 0);
        if (sold + data.quantity > ticketType.quantityAvailable) {
          throw new TicketSoldOutError('No quedan suficientes entradas disponibles de este tipo');
        }
      }

      const sale = await tx.ticketSale.create({
        data: {
          companyId: project.companyId,
          projectId: project.id,
          ticketTypeId: ticketType.id,
          buyerName: data.buyerName,
          buyerEmail: data.buyerEmail,
          buyerPhone: data.buyerPhone || undefined,
          quantity: data.quantity,
          totalAmount: ticketType.price * data.quantity,
          paymentStatus: 'UNPAID',
          qrCode: crypto.randomUUID(),
        },
      });

      return { sale, ticketTypeName: ticketType.name };
    }, LOCKING_TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Confirmación de pago y control de acceso (panel interno)
// ---------------------------------------------------------------------------

/**
 * Registra el monto pagado y recalcula `paymentStatus` en el servidor — mismo
 * patrón que `updateSponsorshipPayment`. Si el resultado queda `PAID`,
 * dispara el correo con el QR fuera de la transacción (un fallo de SMTP no
 * debe revertir la confirmación de pago).
 */
export async function confirmTicketPayment(companyId: string, id: string, data: ConfirmTicketPaymentInput): Promise<TicketSale> {
  const sale = await prisma.ticketSale.findFirst({ where: { id, companyId }, include: { ticketType: true, project: { select: { name: true } } } });
  if (!sale) throw new Error('Orden de compra no encontrada');
  if (data.paidAmount > sale.totalAmount) throw new Error('El monto pagado supera el total de la orden');

  let paymentStatus: PaymentStatus;
  if (data.paidAmount === 0) paymentStatus = 'UNPAID';
  else if (data.paidAmount >= sale.totalAmount) paymentStatus = 'PAID';
  else paymentStatus = 'PARTIAL';

  const wasAlreadyPaid = sale.paymentStatus === 'PAID';

  await prisma.ticketSale.updateMany({ where: { id, companyId }, data: { paidAmount: data.paidAmount, paymentStatus } });
  const updated = await prisma.ticketSale.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Orden de compra no encontrada');

  if (paymentStatus === 'PAID' && !wasAlreadyPaid) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true } });
    void sendEmail({
      to: sale.buyerEmail,
      ...buildTicketConfirmationEmail({
        buyerName: sale.buyerName,
        projectName: sale.project.name,
        companyName: company?.businessName ?? '',
        ticketTypeName: sale.ticketType.name,
        quantity: sale.quantity,
        totalAmount: sale.totalAmount,
        qrImageUrl: `${getAppUrl()}/api/verify/ticket/${sale.qrCode}/qr`,
      }),
    }).catch((error) => console.error('confirmTicketPayment: fallo al enviar correo con QR:', error));

    void emitWorkflowEvent(companyId, 'TICKET_PURCHASE_CONFIRMED', {
      saleId: sale.id,
      buyerName: sale.buyerName,
      buyerEmail: sale.buyerEmail,
      ticketTypeName: sale.ticketType.name,
      quantity: sale.quantity,
      totalAmount: sale.totalAmount,
    });
  }

  return updated;
}

/** Idempotente: no pisa `checkedInAt` si ya tenía valor (mismo criterio que `markAgreementSigned`). */
export async function checkInTicket(companyId: string, qrCode: string): Promise<{ sale: TicketSale; alreadyCheckedIn: boolean }> {
  const sale = await prisma.ticketSale.findFirst({ where: { qrCode, companyId } });
  if (!sale) throw new Error('Código QR no encontrado');
  if (sale.paymentStatus !== 'PAID') throw new Error('Esta entrada todavía no tiene el pago confirmado');

  if (sale.checkedInAt) return { sale, alreadyCheckedIn: true };

  await prisma.ticketSale.updateMany({ where: { id: sale.id, companyId }, data: { checkedInAt: new Date() } });
  const updated = await prisma.ticketSale.findFirst({ where: { id: sale.id, companyId } });
  if (!updated) throw new Error('Código QR no encontrado');
  return { sale: updated, alreadyCheckedIn: false };
}

export interface ProjectSelectOption {
  id: string;
  name: string;
  code: string;
}

export async function listProjectsForSelect(companyId: string): Promise<ProjectSelectOption[]> {
  return prisma.project.findMany({ where: { companyId }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
}
