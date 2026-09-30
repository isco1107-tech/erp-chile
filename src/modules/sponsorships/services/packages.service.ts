import 'server-only';

import type { SponsorshipPackage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { GENERAL_TARIFF, type SponsorshipPackageInput, type SponsorshipPackageUpdateInput } from '../schema';

/**
 * Tarifario de auspicios por certamen, más un tarifario general (planes sin
 * certamen, `projectId: null`) para preparar precios antes de que exista un
 * certamen y copiarlos después. Los cupos vendidos se cuentan desde
 * los contratos confirmados o completados que salieron de cada plan — nunca
 * se guarda un contador que haya que mantener sincronizado.
 */

const SLOT_TAKING_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;

export interface SponsorshipPackageRow extends SponsorshipPackage {
  soldSlots: number;
  /** Suma de lo contratado (efectivo + canje) en contratos vigentes de este plan. */
  soldValue: number;
  /** `null` en los planes del tarifario general. */
  project: { id: string; name: string; code: string } | null;
}

/** `'GENERAL'` o vacío → `null` (sin certamen); cualquier otro valor es el id de un certamen. */
export function projectIdOrNull(value: string | null | undefined): string | null {
  return !value || value === GENERAL_TARIFF ? null : value;
}

async function assertProject(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El certamen no existe o no pertenece a tu empresa');
}

/** `scope`: id de un certamen, `'GENERAL'` (tarifario sin certamen) o vacío (todos). */
export async function listPackages(companyId: string, scope?: string): Promise<SponsorshipPackageRow[]> {
  const where = scope === GENERAL_TARIFF ? { projectId: null } : scope ? { projectId: scope } : {};
  const packages = await prisma.sponsorshipPackage.findMany({
    where: { companyId, ...where },
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
  const projectId = projectIdOrNull(input.projectId);
  if (projectId) await assertProject(companyId, projectId);
  return prisma.sponsorshipPackage.create({
    data: {
      companyId,
      projectId,
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

/**
 * Copia un tarifario a otro (típico al abrir la edición del año siguiente, o
 * al llevar el tarifario general a un certamen nuevo). Origen y destino son el
 * id de un certamen o `null` (tarifario general).
 */
export async function copyPackages(companyId: string, fromProjectId: string | null, toProjectId: string | null): Promise<number> {
  if (fromProjectId === toProjectId) throw new Error('Elige un tarifario de destino distinto al de origen');
  await Promise.all([fromProjectId ? assertProject(companyId, fromProjectId) : null, toProjectId ? assertProject(companyId, toProjectId) : null]);
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
