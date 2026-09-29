import 'server-only';

import type { SponsorshipCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { collidesWithFixedCategory, hasExactlyOneCategory, normalizeCategoryName } from '../schema';

/**
 * Categorías de auspicio propias de un certamen o evento, además de las fijas
 * (enum `SponsorshipTier`). Las fijas no se tocan aquí: valen para todos.
 * Todo se acota por `companyId` y por certamen; una categoría de un certamen
 * nunca puede usarse en otro.
 */

export interface SponsorshipCategoryRow extends SponsorshipCategory {
  /** Cuántos contratos, planes y negocios la usan (impide borrarla). */
  usage: { contracts: number; packages: number; opportunities: number; total: number };
}

async function assertProject(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El certamen no existe o no pertenece a tu empresa');
}

export async function listCategories(companyId: string, projectId: string): Promise<SponsorshipCategoryRow[]> {
  const rows = await prisma.sponsorshipCategory.findMany({
    where: { companyId, projectId },
    include: { _count: { select: { contracts: true, packages: true, opportunities: true } } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(({ _count, ...category }) => ({
    ...category,
    usage: {
      contracts: _count.contracts,
      packages: _count.packages,
      opportunities: _count.opportunities,
      total: _count.contracts + _count.packages + _count.opportunities,
    },
  }));
}

/** Categorías propias de varios certamen a la vez (para pantallas que listan de todos). */
export async function listCategoriesForCompany(companyId: string): Promise<Pick<SponsorshipCategory, 'id' | 'projectId' | 'name'>[]> {
  return prisma.sponsorshipCategory.findMany({
    where: { companyId },
    select: { id: true, projectId: true, name: true },
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
}

async function assertNameAvailable(companyId: string, projectId: string, name: string, exceptId?: string): Promise<void> {
  if (collidesWithFixedCategory(name)) {
    throw new Error('Ese nombre ya es una categoría fija (Principal, Gold, Silver, Cobre, Bronce, Oficial, Media Partner o Canje). Elige otro.');
  }
  const wanted = normalizeCategoryName(name);
  const existing = await prisma.sponsorshipCategory.findMany({
    where: { companyId, projectId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (existing.some((c) => normalizeCategoryName(c.name) === wanted)) {
    throw new Error('Este certamen ya tiene una categoría con ese nombre');
  }
}

export async function createCategory(companyId: string, input: { projectId: string; name: string }): Promise<SponsorshipCategory> {
  await assertProject(companyId, input.projectId);
  await assertNameAvailable(companyId, input.projectId, input.name);
  const last = await prisma.sponsorshipCategory.aggregate({
    where: { companyId, projectId: input.projectId },
    _max: { order: true },
  });
  return prisma.sponsorshipCategory.create({
    data: { companyId, projectId: input.projectId, name: input.name, order: (last._max.order ?? -1) + 1 },
  });
}

export async function renameCategory(companyId: string, id: string, name: string): Promise<void> {
  const category = await prisma.sponsorshipCategory.findFirst({ where: { id, companyId }, select: { projectId: true } });
  if (!category) throw new Error('La categoría no existe o fue eliminada');
  await assertNameAvailable(companyId, category.projectId, name, id);
  const result = await prisma.sponsorshipCategory.updateMany({ where: { id, companyId }, data: { name } });
  if (result.count === 0) throw new Error('La categoría no existe o fue eliminada');
}

/**
 * Solo se borra una categoría sin uso: con contratos, planes o negocios
 * apuntándole quedarían sin ninguna categoría. El mensaje dice cuántos la usan
 * para que quien administra sepa qué reasignar primero.
 */
export async function deleteCategory(companyId: string, id: string): Promise<void> {
  const category = await prisma.sponsorshipCategory.findFirst({
    where: { id, companyId },
    include: { _count: { select: { contracts: true, packages: true, opportunities: true } } },
  });
  if (!category) throw new Error('La categoría no existe o fue eliminada');
  const { contracts, packages, opportunities } = category._count;
  if (contracts + packages + opportunities > 0) {
    const parts = [
      contracts ? `${contracts} contrato(s)` : null,
      packages ? `${packages} plan(es)` : null,
      opportunities ? `${opportunities} negocio(s) del CRM` : null,
    ].filter(Boolean);
    throw new Error(`No se puede eliminar: la usan ${parts.join(', ')}. Cámbiales la categoría primero.`);
  }
  await prisma.sponsorshipCategory.deleteMany({ where: { id, companyId } });
}

/**
 * Valida la categoría elegida para un contrato, plan o negocio: una sola de
 * las dos vías y, si es propia, que exista, sea de la empresa y sea DEL
 * MISMO certamen (nada la ata por FK a `projectId`, así que se comprueba aquí).
 */
export async function assertCategoryChoice(
  companyId: string,
  projectId: string | null,
  choice: { tier?: string | null; categoryId?: string | null }
): Promise<void> {
  if (!hasExactlyOneCategory(choice)) throw new Error('Elige la categoría del auspicio');
  if (!choice.categoryId) return;
  if (!projectId) throw new Error('Para usar una categoría propia, elige primero el certamen');
  const category = await prisma.sponsorshipCategory.findFirst({
    where: { id: choice.categoryId, companyId, projectId },
    select: { id: true },
  });
  if (!category) throw new Error('La categoría elegida no existe en este certamen');
}
