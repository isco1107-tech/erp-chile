import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type {
  Contact,
  PaymentStatus,
  Prisma,
  SponsorshipContract,
  SponsorshipDeliverable,
  SponsorshipStatus,
  SponsorshipTier,
} from '@prisma/client';
import { sendEmail } from '@/lib/email/mailer';
import { buildSponsorshipPaymentConfirmationEmail } from '@/lib/email/templates';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { captureException } from '@/lib/observability';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { emitPaymentEvent, recordPaidAmountChange } from '@/modules/treasury/services/movements.service';
import { SPONSORSHIP_TIER_LABELS } from '../schema';
import type {
  DeliverableCreateInput,
  SponsorshipContractCreateInput,
  SponsorshipContractUpdateInput,
  SponsorshipPaymentInput,
} from '../schema';

export type SponsorshipContractWithRelations = SponsorshipContract & {
  contact: Contact;
  deliverables: SponsorshipDeliverable[];
};

/**
 * Valida que `projectId`/`contactId` pertenezcan a la empresa del usuario.
 *
 * Ninguna FK del schema fuerza esa coincidencia por sí sola (`Project` y
 * `Contact` solo declaran su propio `companyId`, sin constraint compuesta
 * contra `SponsorshipContract`) — sin este chequeo, un usuario podría crear
 * un contrato de auspicio apuntando al proyecto o la marca de OTRA empresa
 * con solo adivinar/probar un `id`.
 */
async function assertOwnership(companyId: string, projectId: string, contactId: string): Promise<void> {
  const [project, contact] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } }),
    prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } }),
  ]);
  if (!project) throw new Error('El proyecto seleccionado no existe o no pertenece a tu empresa');
  if (!contact) throw new Error('La marca seleccionada no existe o no pertenece a tu empresa');
}

export async function createSponsorshipContract(
  companyId: string,
  data: SponsorshipContractCreateInput
): Promise<SponsorshipContract> {
  await assertOwnership(companyId, data.projectId, data.contactId);

  return prisma.sponsorshipContract.create({
    data: {
      companyId,
      projectId: data.projectId,
      contactId: data.contactId,
      tier: data.tier,
      isBarter: data.isBarter,
      cashAmount: data.cashAmount,
      barterValuation: data.barterValuation,
      barterDescription: data.barterDescription || undefined,
      status: data.status,
      notes: data.notes || undefined,
    },
  });
}

export async function updateSponsorshipContract(
  companyId: string,
  id: string,
  data: SponsorshipContractUpdateInput
): Promise<SponsorshipContract> {
  // Si el update trae `projectId`/`contactId` nuevos, hay que revalidar la
  // pertenencia igual que en la creación — de lo contrario un update podría
  // reasignar el contrato a un proyecto o marca de otra empresa.
  if (data.projectId || data.contactId) {
    const existing = await prisma.sponsorshipContract.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error('Contrato de auspicio no encontrado');
    await assertOwnership(companyId, data.projectId ?? existing.projectId, data.contactId ?? existing.contactId);
  }

  const updateData: Prisma.SponsorshipContractUncheckedUpdateManyInput = {
    projectId: data.projectId,
    contactId: data.contactId,
    tier: data.tier,
    isBarter: data.isBarter,
    cashAmount: data.cashAmount,
    barterValuation: data.barterValuation,
    barterDescription: data.barterDescription === '' ? null : data.barterDescription,
    status: data.status,
    notes: data.notes === '' ? null : data.notes,
  };

  const result = await prisma.sponsorshipContract.updateMany({ where: { id, companyId }, data: updateData });
  if (result.count === 0) throw new Error('Contrato de auspicio no encontrado');

  const updated = await prisma.sponsorshipContract.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Contrato de auspicio no encontrado');
  return updated;
}

/**
 * Solo se permite eliminar un contrato que todavía no registra pagos. Uno con
 * `paidAmount > 0` debe pasar a estado `CANCELLED` en vez de borrarse, para no
 * perder el rastro de la plata ya recibida. Los `SponsorshipDeliverable`
 * asociados se borran en cascada (`onDelete: Cascade` en el schema).
 */
export async function deleteSponsorshipContract(companyId: string, id: string): Promise<void> {
  const contract = await prisma.sponsorshipContract.findFirst({ where: { id, companyId } });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');
  if (contract.paidAmount > 0) {
    throw new Error(
      'No se puede eliminar: este contrato ya registra pagos. Cámbialo a estado "Cancelado" en vez de eliminarlo, para no perder el historial de pago.'
    );
  }

  const result = await prisma.sponsorshipContract.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Contrato de auspicio no encontrado');
}

/**
 * Registra el monto efectivamente pagado y recalcula `paymentStatus` en el
 * servidor — nunca se confía en un status que mande el cliente, mismo
 * criterio que `treasury.service.ts` al registrar cobros/pagos.
 */
/**
 * Al pasar a `PAID` por primera vez dispara el correo de confirmación al
 * contacto de la marca auspiciadora — mismo patrón que
 * `confirmTicketPayment`/`confirmVotePayment`: fuera de la transacción (un
 * fallo de SMTP no debe revertir el pago ya confirmado) y solo si
 * `wasAlreadyPaid` es falso. Antes esta función no avisaba a nadie.
 */
export async function updateSponsorshipPayment(
  companyId: string,
  id: string,
  data: SponsorshipPaymentInput,
  userId?: string
): Promise<SponsorshipContract> {
  const { contract, updated, payment, paymentStatus } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SponsorshipContract" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    const current = await tx.sponsorshipContract.findFirst({
      where: { id, companyId },
      include: { contact: true, project: { select: { name: true } } },
    });
    if (!current) throw new Error('Contrato de auspicio no encontrado');
    // Repetido server-side: la UI ya deshabilita el botón sobre el tope, pero
    // esto también corre si se llama la Server Action directo.
    if (current.cashAmount > 0 && data.paidAmount > current.cashAmount) {
      throw new Error('El monto pagado supera el aporte en efectivo acordado');
    }

    let paymentStatus: PaymentStatus;
    if (current.cashAmount === 0) {
      // Canje puro: no hay componente en efectivo que cobrar, así que siempre
      // queda "Pagado" independiente de lo que se ingrese acá.
      paymentStatus = 'PAID';
    } else if (data.paidAmount === 0) {
      paymentStatus = 'UNPAID';
    } else if (data.paidAmount >= current.cashAmount) {
      paymentStatus = 'PAID';
    } else {
      paymentStatus = 'PARTIAL';
    }

    // Un canje puro no mueve dinero: su "pago" no pasa por Tesorería.
    const newPaid = current.cashAmount === 0 ? current.paidAmount : data.paidAmount;
    await tx.sponsorshipContract.updateMany({
      where: { id, companyId },
      data: {
        paidAmount: newPaid,
        paymentStatus,
        notes: data.notes !== undefined ? (data.notes || null) : undefined,
      },
    });

    const movement = await recordPaidAmountChange(tx, {
      companyId,
      previousPaid: current.paidAmount,
      newPaid,
      method: data.paymentMethod,
      source: 'SPONSORSHIP',
      sourceId: current.id,
      description: `Auspicio ${SPONSORSHIP_TIER_LABELS[current.tier]} — ${current.contact.razonSocial} (${current.project.name})`,
      counterpartKey: 'COBROS_POR_DOCUMENTAR',
      contactId: current.contactId,
      projectId: current.projectId,
      treasuryAccountId: data.treasuryAccountId,
      createdByUserId: userId,
    });

    const after = await tx.sponsorshipContract.findFirst({ where: { id, companyId } });
    if (!after) throw new Error('Contrato de auspicio no encontrado');
    return { contract: current, updated: after, payment: movement, paymentStatus };
  }, LOCKING_TX_OPTIONS);

  if (payment) emitPaymentEvent(companyId, payment);
  const wasAlreadyPaid = contract.paymentStatus === 'PAID';

  if (paymentStatus === 'PAID' && !wasAlreadyPaid && contract.contact.email) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { businessName: true } });
    void sendEmail({
      to: contract.contact.email,
      ...buildSponsorshipPaymentConfirmationEmail({
        contactName: contract.contact.razonSocial,
        projectName: contract.project.name,
        companyName: company?.businessName ?? '',
        tierLabel: SPONSORSHIP_TIER_LABELS[contract.tier],
        paidAmount: data.paidAmount,
        isBarter: contract.isBarter,
      }),
    }).catch((error) => captureException(error, { module: 'sponsorships', companyId, extra: { reason: 'payment-confirmation-email' } }));
  }

  return updated;
}

export async function listSponsorshipContracts(
  companyId: string,
  projectId?: string,
  contactId?: string
): Promise<SponsorshipContractWithRelations[]> {
  return prisma.sponsorshipContract.findMany({
    where: { companyId, projectId: projectId || undefined, contactId: contactId || undefined },
    include: { contact: true, deliverables: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSponsorshipContract(
  companyId: string,
  id: string
): Promise<SponsorshipContractWithRelations | null> {
  return prisma.sponsorshipContract.findFirst({
    where: { companyId, id },
    include: { contact: true, deliverables: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function addDeliverable(
  companyId: string,
  contractId: string,
  data: DeliverableCreateInput
): Promise<SponsorshipDeliverable> {
  const contract = await prisma.sponsorshipContract.findFirst({ where: { id: contractId, companyId }, select: { id: true } });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');

  return prisma.sponsorshipDeliverable.create({
    data: {
      companyId,
      contractId,
      title: data.title,
      type: data.type,
      dueDate: data.dueDate || undefined,
      proofUrl: data.proofUrl || undefined,
    },
  });
}

export type AgreementStatus = 'NOT_GENERATED' | 'PENDING_SIGNATURE' | 'SIGNED';

/** Se deriva en código, nunca se guarda un status mutable — mismo criterio que `CandidateDocument.status`. */
export function getAgreementStatus(contract: Pick<SponsorshipContract, 'agreementFileUrl' | 'agreementSignedAt'>): AgreementStatus {
  if (contract.agreementSignedAt) return 'SIGNED';
  if (contract.agreementFileUrl) return 'PENDING_SIGNATURE';
  return 'NOT_GENERATED';
}

/** Marca la carta de compromiso como firmada — solo posible si ya fue generada. Es un hecho que no se puede deshacer desde acá (mismo criterio que `ScoreSheet.submitScore`: una vez firmada, se sube un documento nuevo si algo cambia, no se "desfirma"). */
export async function markAgreementSigned(companyId: string, contractId: string): Promise<SponsorshipContract> {
  const contract = await prisma.sponsorshipContract.findFirst({ where: { id: contractId, companyId }, include: { contact: { select: { razonSocial: true } } } });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');
  if (!contract.agreementFileUrl) throw new Error('Primero genera la carta de compromiso');
  if (contract.agreementSignedAt) throw new Error('Esta carta ya estaba marcada como firmada');

  await prisma.sponsorshipContract.updateMany({ where: { id: contractId, companyId }, data: { agreementSignedAt: new Date() } });
  const updated = await prisma.sponsorshipContract.findFirst({ where: { id: contractId, companyId } });
  if (!updated) throw new Error('Contrato de auspicio no encontrado');

  void emitWorkflowEvent(companyId, 'SPONSORSHIP_SIGNED', {
    contractId: updated.id,
    sponsorName: contract.contact.razonSocial,
    totalAmount: updated.cashAmount,
  });

  return updated;
}

export interface SponsorshipComplianceRow {
  contractId: string;
  contactId: string;
  razonSocial: string;
  tier: string;
  totalDeliverables: number;
  completedDeliverables: number;
  compliancePercent: number;
  cashAmount: number;
  barterValuation: number;
  agreementStatus: AgreementStatus;
}

/**
 * Tablero de cumplimiento por marca: % de entregables completados por
 * contrato. Se agrega en memoria (no `groupBy` de Prisma) porque necesita el
 * nombre de la marca y el tier del contrato junto al conteo — traerlo todo en
 * una sola consulta con `include` es más simple que combinar un `groupBy` con
 * un segundo `findMany` para los nombres.
 */
export async function getSponsorshipComplianceBoard(companyId: string, projectId?: string): Promise<SponsorshipComplianceRow[]> {
  const contracts = await prisma.sponsorshipContract.findMany({
    where: { companyId, projectId: projectId || undefined, status: { not: 'CANCELLED' } },
    include: { contact: { select: { razonSocial: true } }, deliverables: { select: { isCompleted: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return contracts.map((contract) => {
    const totalDeliverables = contract.deliverables.length;
    const completedDeliverables = contract.deliverables.filter((d) => d.isCompleted).length;
    return {
      contractId: contract.id,
      contactId: contract.contactId,
      razonSocial: contract.contact.razonSocial,
      tier: contract.tier,
      totalDeliverables,
      completedDeliverables,
      compliancePercent: totalDeliverables === 0 ? 0 : Math.round((completedDeliverables / totalDeliverables) * 100),
      cashAmount: contract.cashAmount,
      barterValuation: contract.barterValuation,
      agreementStatus: getAgreementStatus(contract),
    };
  });
}

export async function toggleDeliverable(companyId: string, deliverableId: string): Promise<SponsorshipDeliverable> {
  const deliverable = await prisma.sponsorshipDeliverable.findFirst({ where: { id: deliverableId, companyId } });
  if (!deliverable) throw new Error('Entregable no encontrado');

  const isCompleted = !deliverable.isCompleted;
  await prisma.sponsorshipDeliverable.updateMany({
    where: { id: deliverableId, companyId },
    data: { isCompleted, completedAt: isCompleted ? new Date() : null },
  });

  const updated = await prisma.sponsorshipDeliverable.findFirst({ where: { id: deliverableId, companyId } });
  if (!updated) throw new Error('Entregable no encontrado');
  return updated;
}

export async function deleteDeliverable(companyId: string, deliverableId: string): Promise<void> {
  const result = await prisma.sponsorshipDeliverable.deleteMany({ where: { id: deliverableId, companyId } });
  if (result.count === 0) throw new Error('Entregable no encontrado');
}

// ---------------------------------------------------------------------------
// Portal público de la marca auspiciadora (acceso por token, sin cuenta ERP)
// ---------------------------------------------------------------------------

/**
 * Devuelve el `portalToken` vigente del contrato, generándolo si todavía no
 * existe. Idempotente a propósito: compartir el link varias veces desde el
 * panel interno no debe invalidar uno que la marca ya guardó.
 */
export async function getOrCreatePortalToken(companyId: string, contractId: string): Promise<string> {
  const contract = await prisma.sponsorshipContract.findFirst({
    where: { id: contractId, companyId },
    select: { portalToken: true },
  });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');
  if (contract.portalToken) return contract.portalToken;

  const portalToken = crypto.randomBytes(32).toString('hex');
  await prisma.sponsorshipContract.updateMany({ where: { id: contractId, companyId }, data: { portalToken } });
  return portalToken;
}

/**
 * Invalida el link anterior (si alguien lo compartió por error o la marca
 * pide rotarlo) y emite uno nuevo. La colisión de `crypto.randomBytes(32)` es
 * astronómicamente improbable, así que no se reintenta contra la constraint
 * `@unique` — mismo criterio que `createJudgeAssignment`.
 */
export async function regeneratePortalToken(companyId: string, contractId: string): Promise<string> {
  const contract = await prisma.sponsorshipContract.findFirst({
    where: { id: contractId, companyId },
    select: { id: true },
  });
  if (!contract) throw new Error('Contrato de auspicio no encontrado');

  const portalToken = crypto.randomBytes(32).toString('hex');
  await prisma.sponsorshipContract.updateMany({ where: { id: contractId, companyId }, data: { portalToken } });
  return portalToken;
}

export interface SponsorshipPortalView {
  razonSocial: string;
  tier: SponsorshipTier;
  status: SponsorshipStatus;
  isBarter: boolean;
  cashAmount: number;
  barterValuation: number;
  barterDescription: string | null;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  compliancePercent: number;
  deliverables: Pick<SponsorshipDeliverable, 'id' | 'title' | 'type' | 'dueDate' | 'isCompleted' | 'completedAt'>[];
  projectName: string;
  companyName: string;
  companyLogoUrl: string | null;
}

/**
 * Resuelve TODO lo que ve la marca a partir del `portalToken` — nunca de un
 * `companyId`/`contractId` que mande el cliente. Mismo criterio que
 * `getJudgeContextByToken`: un token que no matchea ningún contrato no revela
 * nada distinto de "link inválido", y el `findUnique` por el campo `@unique`
 * ya acota la búsqueda a exactamente un contrato de una sola empresa —
 * imposible que un token filtre datos de otra marca u otra empresa.
 */
export async function getSponsorshipPortalByToken(portalToken: string): Promise<SponsorshipPortalView | null> {
  const contract = await prisma.sponsorshipContract.findUnique({
    where: { portalToken },
    include: {
      contact: { select: { razonSocial: true } },
      deliverables: { orderBy: { createdAt: 'asc' } },
      project: { select: { name: true } },
      company: { select: { businessName: true, logoUrl: true } },
    },
  });
  if (!contract) return null;

  const totalDeliverables = contract.deliverables.length;
  const completedDeliverables = contract.deliverables.filter((d) => d.isCompleted).length;

  return {
    razonSocial: contract.contact.razonSocial,
    tier: contract.tier,
    status: contract.status,
    isBarter: contract.isBarter,
    cashAmount: contract.cashAmount,
    barterValuation: contract.barterValuation,
    barterDescription: contract.barterDescription,
    paidAmount: contract.paidAmount,
    paymentStatus: contract.paymentStatus,
    compliancePercent: totalDeliverables === 0 ? 0 : Math.round((completedDeliverables / totalDeliverables) * 100),
    deliverables: contract.deliverables.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      dueDate: d.dueDate,
      isCompleted: d.isCompleted,
      completedAt: d.completedAt,
    })),
    projectName: contract.project.name,
    companyName: contract.company.businessName,
    companyLogoUrl: contract.company.logoUrl,
  };
}

export interface ProjectSelectOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Selector mínimo de proyectos para el formulario de auspicios.
 *
 * `src/modules/projects/actions/projects.actions.ts` todavía no existe (puede
 * estar construyéndose en paralelo) — se resuelve acá mismo, autocontenido en
 * el módulo, para no depender de su existencia ni acoplar la disponibilidad
 * de Auspicios & Marcas al módulo Eventos & Proyectos.
 */
export async function listProjectsForSelect(companyId: string): Promise<ProjectSelectOption[]> {
  return prisma.project.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
}
