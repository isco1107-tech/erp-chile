import 'server-only';

import type { SponsorshipPackage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SponsorshipPackageInput, SponsorshipPackageUpdateInput } from '../schema';

/**
 * Tarifario de auspicios por certamen. Los cupos vendidos se cuentan desde
 * los contratos confirmados o completados que salieron de cada plan — nunca
 * se guarda un contador que haya que mantener sincronizado.
 */

const SLOT_TAKING_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;

export interface SponsorshipPackageRow extends SponsorshipPackage {
  soldSlots: number;
  /** Suma de lo contratado (efectivo + canje) en contratos vigentes de este plan. */
  soldValue: number;
  project: { id: string; name: string; code: string };
}

async function assertProject(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El certamen no existe o no pertenece a tu empresa');
}

export async function listPackages(companyId: string, projectId?: string): Promise<SponsorshipPackageRow[]> {
  const packages = await prisma.sponsorshipPackage.findMany({
    where: { companyId, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { id: true, name: true, code: true } },
      contracts: { where: { companyId, status: { in: [...SLOT_TAKING_STATUSES] } }, select: { cashAmount: true, barterValuation: true } },
    },
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }, { price: 'desc' }],
  });
  return packages.map(({ contracts, ...pkg }) => ({
    ...pkg,
    soldSlots: contracts.length,
    soldValue: contracts.reduce((s, c) => s + c.cashAmount + c.barterValuation, 0),
  }));
}

const clean = (benefits: string[]) => benefits.map((b) => b.trim()).filter(Boolean);

export async function createPackage(companyId: string, input: SponsorshipPackageInput): Promise<SponsorshipPackage> {
  await assertProject(companyId, input.projectId);
  return prisma.sponsorshipPackage.create({
    data: {
      companyId,
      projectId: input.projectId,
      tier: input.tier,
      name: input.name,
      price: input.price,
      maxSlots: input.maxSlots ?? null,
      benefits: clean(input.benefits),
      description: input.description || null,
      isPublic: input.isPublic,
      showPricePublic: input.showPricePublic,
      order: input.order,
    },
  });
}

export async function updatePackage(companyId: string, id: string, input: SponsorshipPackageUpdateInput): Promise<void> {
  const result = await prisma.sponsorshipPackage.updateMany({
    where: { id, companyId },
    data: {
      tier: input.tier,
      name: input.name,
      price: input.price,
      maxSlots: input.maxSlots ?? null,
      benefits: clean(input.benefits),
      description: input.description || null,
      isPublic: input.isPublic,
      showPricePublic: input.showPricePublic,
      order: input.order,
    },
  });
  if (result.count === 0) throw new Error('El plan no existe o fue eliminado');
}

/** Borrar un plan no toca contratos ni negocios: quedan "a medida" (`SetNull`). */
export async function deletePackage(companyId: string, id: string): Promise<void> {
  const result = await prisma.sponsorshipPackage.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('El plan no existe o fue eliminado');
}

/** Copia el tarifario de un certamen a otro (típico al abrir la edición del año siguiente). */
export async function copyPackages(companyId: string, fromProjectId: string, toProjectId: string): Promise<number> {
  if (fromProjectId === toProjectId) throw new Error('Elige un certamen de destino distinto al de origen');
  await Promise.all([assertProject(companyId, fromProjectId), assertProject(companyId, toProjectId)]);
  const source = await prisma.sponsorshipPackage.findMany({ where: { companyId, projectId: fromProjectId } });
  if (source.length === 0) return 0;
  const result = await prisma.sponsorshipPackage.createMany({
    data: source.map((p) => ({
      companyId,
      projectId: toProjectId,
      tier: p.tier,
      name: p.name,
      price: p.price,
      maxSlots: p.maxSlots,
      benefits: p.benefits,
      description: p.description,
      isPublic: p.isPublic,
      showPricePublic: p.showPricePublic,
      order: p.order,
    })),
  });
  return result.count;
}
