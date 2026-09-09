import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma, type PaymentStatus, type VoteOrder } from '@prisma/client';
import { sendEmail } from '@/lib/email/mailer';
import { buildVoteConfirmationEmail } from '@/lib/email/templates';
import { decodeVoteToken, encodeVoteToken } from '../schema';
import type { ConfirmVotePaymentInput, PublicVotePurchaseInput } from '../schema';

export class VoteSalesNotFoundError extends Error {}
export class InvalidCandidateError extends Error {}

async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El proyecto/certamen no existe o no pertenece a esta empresa');
}

// ---------------------------------------------------------------------------
// Link público de votación (`Project.voteSalesToken`) — ver nota de
// arquitectura sobre `pricePerVote` en `../schema.ts`.
// ---------------------------------------------------------------------------

export async function getOrCreateVoteSalesToken(companyId: string, projectId: string, pricePerVote: number): Promise<string> {
  await assertProjectOwnership(companyId, projectId);
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { voteSalesToken: true } });
  if (!project) throw new Error('Proyecto no encontrado');
  // Idempotente solo si el precio no cambió — un precio nuevo exige un token
  // nuevo porque el precio va codificado en el propio string (ver ../schema.ts).
  if (project.voteSalesToken) {
    const decoded = decodeVoteToken(project.voteSalesToken);
    if (decoded && decoded.pricePerVote === pricePerVote) return project.voteSalesToken;
  }

  const token = encodeVoteToken(crypto.randomBytes(32).toString('hex'), pricePerVote);
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { voteSalesToken: token } });
  return token;
}

export async function regenerateVoteSalesToken(companyId: string, projectId: string, pricePerVote: number): Promise<string> {
  await assertProjectOwnership(companyId, projectId);
  const token = encodeVoteToken(crypto.randomBytes(32).toString('hex'), pricePerVote);
  await prisma.project.updateMany({ where: { id: projectId, companyId }, data: { voteSalesToken: token } });
  return token;
}

/** Precio vigente del link activo de un proyecto, o `null` si todavía no se ha generado uno. */
export async function getCurrentVotePrice(companyId: string, projectId: string): Promise<number | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { voteSalesToken: true } });
  if (!project?.voteSalesToken) return null;
  return decodeVoteToken(project.voteSalesToken)?.pricePerVote ?? null;
}

// ---------------------------------------------------------------------------
// Flujo público (acceso por token, sin cuenta ERP)
// ---------------------------------------------------------------------------

export interface PublicVotingCandidateOption {
  id: string;
  fullName: string;
  stageName: string | null;
  photoUrl: string | null;
}

export interface PublicVotingProjectInfo {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  bankTransferInfo: string | null;
  pricePerVote: number;
  candidates: PublicVotingCandidateOption[];
}

export async function getPublicVotingProjectByToken(token: string): Promise<PublicVotingProjectInfo | null> {
  const decoded = decodeVoteToken(token);
  if (!decoded) return null;

  const project = await prisma.project.findUnique({
    where: { voteSalesToken: token },
    include: {
      company: { select: { businessName: true, settings: { select: { bankTransferInfo: true } } } },
      candidates: {
        where: { status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
        select: { id: true, fullName: true, stageName: true, photoUrl: true },
        orderBy: { fullName: 'asc' },
      },
    },
  });
  if (!project) return null;

  return {
    projectId: project.id,
    projectName: project.name,
    companyId: project.companyId,
    companyName: project.company.businessName,
    bankTransferInfo: project.company.settings?.bankTransferInfo ?? null,
    pricePerVote: decoded.pricePerVote,
    candidates: project.candidates,
  };
}

/**
 * Crea la orden de votos pagados. `companyId`/`projectId`/`pricePerVote` se
 * resuelven SIEMPRE del token (nunca de un campo del formulario) — ver nota
 * de arquitectura en `../schema.ts`. `paymentStatus` siempre entra `UNPAID`.
 */
export async function createPublicVoteOrder(token: string, data: PublicVotePurchaseInput): Promise<{ order: VoteOrder; candidateName: string }> {
  const decoded = decodeVoteToken(token);
  if (!decoded) throw new VoteSalesNotFoundError('Link de votación inválido o expirado');

  const project = await prisma.project.findUnique({
    where: { voteSalesToken: token },
    select: { id: true, companyId: true },
  });
  if (!project) throw new VoteSalesNotFoundError('Link de votación inválido o expirado');

  const candidate = await prisma.candidate.findFirst({
    where: { id: data.candidateId, companyId: project.companyId, projectId: project.id, status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
    select: { id: true, fullName: true, stageName: true },
  });
  if (!candidate) throw new InvalidCandidateError('La candidata seleccionada no existe o no participa en este certamen');

  const order = await prisma.voteOrder.create({
    data: {
      companyId: project.companyId,
      projectId: project.id,
      candidateId: candidate.id,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone || undefined,
      voteCount: data.voteCount,
      pricePerVote: decoded.pricePerVote,
      totalAmount: decoded.pricePerVote * data.voteCount,
      paymentStatus: 'UNPAID',
    },
  });

  return { order, candidateName: candidate.stageName || candidate.fullName };
}

// ---------------------------------------------------------------------------
// Panel interno
// ---------------------------------------------------------------------------

export type VoteOrderWithCandidate = VoteOrder & { candidate: { id: string; fullName: string; stageName: string | null } };

export interface VoteOrderListFilters {
  projectId?: string;
  candidateId?: string;
  paymentStatus?: PaymentStatus;
  search?: string;
}

export async function listVoteOrders(companyId: string, filters: VoteOrderListFilters = {}): Promise<VoteOrderWithCandidate[]> {
  const where: Prisma.VoteOrderWhereInput = {
    companyId,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.candidateId ? { candidateId: filters.candidateId } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
  };
  if (filters.search?.trim()) {
    where.buyerEmail = { contains: filters.search.trim(), mode: 'insensitive' };
  }

  return prisma.voteOrder.findMany({
    where,
    include: { candidate: { select: { id: true, fullName: true, stageName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Registra el monto pagado y recalcula `paymentStatus` en el servidor — mismo
 * patrón que `confirmTicketPayment`/`updateSponsorshipPayment`. Una orden
 * `UNPAID` no cuenta para `getVoteLeaderboard`; al quedar `PAID` sí.
 *
 * Al pasar a `PAID` por primera vez dispara el correo de confirmación al
 * comprador — mismo criterio que `confirmTicketPayment`: fuera de la
 * transacción (un fallo de SMTP no debe revertir el pago ya confirmado) y
 * solo si `wasAlreadyPaid` es falso (para no reenviarlo si alguien vuelve a
 * guardar el mismo monto).
 */
export async function confirmVotePayment(companyId: string, id: string, data: ConfirmVotePaymentInput): Promise<VoteOrder> {
  const order = await prisma.voteOrder.findFirst({
    where: { id, companyId },
    include: { project: { select: { name: true } }, candidate: { select: { fullName: true, stageName: true } } },
  });
  if (!order) throw new Error('Orden de votos no encontrada');
  if (data.paidAmount > order.totalAmount) throw new Error('El monto pagado supera el total de la orden');

  let paymentStatus: PaymentStatus;
  if (data.paidAmount === 0) paymentStatus = 'UNPAID';
  else if (data.paidAmount >= order.totalAmount) paymentStatus = 'PAID';
  else paymentStatus = 'PARTIAL';

  const wasAlreadyPaid = order.paymentStatus === 'PAID';

  await prisma.voteOrder.updateMany({ where: { id, companyId }, data: { paidAmount: data.paidAmount, paymentStatus } });
  const updated = await prisma.voteOrder.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Orden de votos no encontrada');

  if (paymentStatus === 'PAID' && !wasAlreadyPaid) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true } });
    void sendEmail({
      to: order.buyerEmail,
      ...buildVoteConfirmationEmail({
        projectName: order.project.name,
        companyName: company?.businessName ?? '',
        candidateName: order.candidate.stageName ?? order.candidate.fullName,
        voteCount: order.voteCount,
        totalAmount: order.totalAmount,
      }),
    }).catch((error) => console.error('confirmVotePayment: fallo al enviar correo de confirmación:', error));
  }

  return updated;
}

export interface VoteLeaderboardRow {
  candidateId: string;
  fullName: string;
  stageName: string | null;
  photoUrl: string | null;
  totalVotes: number;
  totalRevenue: number;
}

/**
 * Ranking en vivo: solo cuentan órdenes `PAID` (Sección de la tarea — "una
 * orden UNPAID no es un voto real todavía"). Agregado en memoria (no
 * `groupBy`) porque necesita nombre/foto de la candidata junto al conteo.
 */
export async function getVoteLeaderboard(companyId: string, projectId: string): Promise<VoteLeaderboardRow[]> {
  const candidates = await prisma.candidate.findMany({
    where: { companyId, projectId, status: { notIn: ['WITHDRAWN', 'REJECTED'] } },
    select: {
      id: true,
      fullName: true,
      stageName: true,
      photoUrl: true,
      voteOrders: { where: { paymentStatus: 'PAID' }, select: { voteCount: true, totalAmount: true } },
    },
  });

  return candidates
    .map((c) => ({
      candidateId: c.id,
      fullName: c.fullName,
      stageName: c.stageName,
      photoUrl: c.photoUrl,
      totalVotes: c.voteOrders.reduce((sum, o) => sum + o.voteCount, 0),
      totalRevenue: c.voteOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes);
}

export interface ProjectSelectOption {
  id: string;
  name: string;
  code: string;
}

export async function listProjectsForSelect(companyId: string): Promise<ProjectSelectOption[]> {
  return prisma.project.findMany({ where: { companyId }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
}
