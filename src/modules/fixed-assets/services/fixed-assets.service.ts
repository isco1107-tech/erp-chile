import 'server-only';

import type { FixedAsset, FixedAssetMaintenance } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { annualSchedule, depreciationAt, depreciationForMonth, type DepreciationState, type ScheduleRow } from '@/lib/assets/depreciation';
import { createAndPostEntry } from '@/modules/accounting/services/journal.service';
import type { DisposeAssetInput, FixedAssetInput, MaintenanceInput } from '../schema';

/**
 * Registro de activo fijo. La depreciación se calcula al vuelo
 * (`src/lib/assets/depreciation.ts`); lo único que se persiste es el asiento
 * contable mensual, y solo si la empresa tiene Contabilidad.
 */

/** Cuentas del plan base (`chart-of-accounts.ts`) que recibe el asiento de depreciación. */
const DEPRECIATION_EXPENSE_CODE = '6105';
const ACCUMULATED_DEPRECIATION_CODE = '1202';

export type AssetRow = FixedAsset & {
  supplier: { id: string; razonSocial: string; rut: string } | null;
  state: DepreciationState;
  schedule: ScheduleRow[];
};

export interface AssetsSummary {
  count: number;
  grossCost: number;
  accumulated: number;
  bookValue: number;
  currentMonthDepreciation: number;
  fullyDepreciatedCount: number;
}

async function assertSupplier(companyId: string, contactId: string | undefined): Promise<void> {
  if (!contactId) return;
  const found = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
  if (!found) throw new Error('El proveedor seleccionado no existe en tu empresa');
}

function toData(input: FixedAssetInput) {
  return {
    code: input.code,
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    location: input.location ?? null,
    responsible: input.responsible ?? null,
    acquisitionDate: input.acquisitionDate,
    depreciationStartDate: input.depreciationStartDate ?? input.acquisitionDate,
    acquisitionCost: input.acquisitionCost,
    residualValue: input.residualValue,
    usefulLifeMonths: input.method === 'SIN_DEPRECIACION' ? 0 : input.usefulLifeMonths,
    method: input.method,
    supplierContactId: input.supplierContactId ?? null,
    invoiceReference: input.invoiceReference ?? null,
    notes: input.notes ?? null,
  };
}

function duplicateCode(error: unknown): never {
  if (isUniqueConstraintError(error)) throw new Error('Ya existe un activo con ese código');
  throw error;
}

export async function listAssets(companyId: string): Promise<{ assets: AssetRow[]; summary: AssetsSummary }> {
  const now = new Date();
  const assets = await prisma.fixedAsset.findMany({
    where: { companyId },
    include: { supplier: { select: { id: true, razonSocial: true, rut: true } } },
    orderBy: [{ status: 'asc' }, { code: 'asc' }],
  });
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const rows: AssetRow[] = assets.map((asset) => ({ ...asset, state: depreciationAt(asset, now), schedule: annualSchedule(asset) }));
  const active = rows.filter((row) => row.status === 'ACTIVE');
  return {
    assets: rows,
    summary: {
      count: active.length,
      grossCost: active.reduce((s, r) => s + r.acquisitionCost, 0),
      accumulated: active.reduce((s, r) => s + r.state.accumulated, 0),
      bookValue: active.reduce((s, r) => s + r.state.bookValue, 0),
      currentMonthDepreciation: rows.reduce((s, r) => s + depreciationForMonth(r, year, month), 0),
      fullyDepreciatedCount: active.filter((r) => r.state.fullyDepreciated).length,
    },
  };
}

export async function createAsset(companyId: string, input: FixedAssetInput): Promise<FixedAsset> {
  await assertSupplier(companyId, input.supplierContactId);
  try {
    return await prisma.fixedAsset.create({ data: { companyId, ...toData(input) } });
  } catch (error) {
    duplicateCode(error);
  }
}

export async function updateAsset(companyId: string, id: string, input: FixedAssetInput): Promise<FixedAsset> {
  await assertSupplier(companyId, input.supplierContactId);
  try {
    const result = await prisma.fixedAsset.updateMany({ where: { id, companyId, status: 'ACTIVE' }, data: toData(input) });
    if (result.count === 0) throw new Error('El activo no existe o ya fue dado de baja');
  } catch (error) {
    duplicateCode(error);
  }
  return prisma.fixedAsset.findFirstOrThrow({ where: { id, companyId } });
}

export async function disposeAsset(companyId: string, id: string, input: DisposeAssetInput): Promise<void> {
  const asset = await prisma.fixedAsset.findFirst({ where: { id, companyId }, select: { acquisitionDate: true } });
  if (!asset) throw new Error('El activo no existe');
  if (input.disposalDate < asset.acquisitionDate) throw new Error('La baja no puede ser anterior a la adquisición');
  const result = await prisma.fixedAsset.updateMany({
    where: { id, companyId, status: 'ACTIVE' },
    data: { status: 'DISPOSED', disposalDate: input.disposalDate, disposalAmount: input.disposalAmount },
  });
  if (result.count === 0) throw new Error('El activo ya fue dado de baja');
}

export async function deleteAsset(companyId: string, id: string): Promise<void> {
  const result = await prisma.fixedAsset.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('El activo no existe o fue eliminado');
}

export function depreciationSourceId(year: number, month: number): string {
  return `fixed-assets:${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Asiento de depreciación del mes: Gasto por depreciación (6105) contra
 * Depreciación acumulada (1202). Idempotente por mes: si ya existe un asiento
 * vigente con la misma referencia, no se duplica — para corregirlo se reversa
 * el anterior desde el Libro Diario y se vuelve a contabilizar.
 */
export async function postMonthlyDepreciation(companyId: string, userId: string, year: number, month: number): Promise<{ amount: number; entryNumber: number }> {
  const sourceId = depreciationSourceId(year, month);
  const assets = await prisma.fixedAsset.findMany({ where: { companyId } });
  const amount = assets.reduce((sum, asset) => sum + depreciationForMonth(asset, year, month), 0);
  if (amount <= 0) throw new Error('No hay depreciación que contabilizar en ese mes');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.journalEntry.findFirst({
      where: { companyId, sourceType: 'MANUAL', sourceId, status: { not: 'REVERSED' } },
      select: { entryNumber: true },
    });
    if (existing) throw new Error(`La depreciación de ese mes ya está contabilizada (asiento N° ${existing.entryNumber})`);

    const [expense, accumulated] = await Promise.all([
      tx.account.findFirst({ where: { companyId, code: DEPRECIATION_EXPENSE_CODE, isActive: true }, select: { id: true } }),
      tx.account.findFirst({ where: { companyId, code: ACCUMULATED_DEPRECIATION_CODE, isActive: true }, select: { id: true } }),
    ]);
    if (!expense || !accumulated) {
      throw new Error('Tu plan de cuentas no tiene las cuentas 6105 (Depreciación del ejercicio) y 1202 (Depreciación acumulada). Créalas para contabilizar.');
    }

    const entry = await createAndPostEntry(tx, {
      companyId,
      date: new Date(Date.UTC(year, month, 0, 12)),
      description: `Depreciación de activo fijo ${String(month).padStart(2, '0')}/${year}`,
      sourceType: 'MANUAL',
      sourceId,
      createdByUserId: userId,
      lines: [
        { accountId: expense.id, debit: amount, credit: 0, description: 'Depreciación del ejercicio' },
        { accountId: accumulated.id, debit: 0, credit: amount, description: 'Depreciación acumulada' },
      ],
    });
    return { amount, entryNumber: entry.entryNumber };
  }, LOCKING_TX_OPTIONS);
}

// ─── Ficha del bien y mantenciones (Ola 6) ───────────────────────────────────

export type AssetDetail = AssetRow & { maintenances: FixedAssetMaintenance[]; maintenanceCost: number; nextMaintenance: Date | null };

export async function getAsset(companyId: string, id: string): Promise<AssetDetail | null> {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id, companyId },
    include: { supplier: { select: { id: true, razonSocial: true, rut: true } }, maintenances: { orderBy: { date: 'desc' } } },
  });
  if (!asset) return null;
  const { maintenances, ...rest } = asset;
  // La próxima fecha vigente es la del registro más reciente que la tenga.
  const nextMaintenance = maintenances.find((maintenance) => maintenance.nextDueDate)?.nextDueDate ?? null;
  return {
    ...rest,
    state: depreciationAt(rest, new Date()),
    schedule: annualSchedule(rest),
    maintenances,
    maintenanceCost: maintenances.reduce((sum, maintenance) => sum + maintenance.cost, 0),
    nextMaintenance,
  };
}

export async function addMaintenance(companyId: string, assetId: string, userName: string, input: MaintenanceInput): Promise<void> {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, companyId }, select: { status: true, acquisitionDate: true } });
  if (!asset) throw new Error('El activo no existe');
  const date = new Date(`${input.date}T12:00:00Z`);
  if (date < asset.acquisitionDate) throw new Error('La mantención no puede ser anterior a la adquisición');
  await prisma.fixedAssetMaintenance.create({
    data: {
      companyId,
      assetId,
      date,
      kind: input.kind,
      description: input.description,
      cost: input.cost,
      provider: input.provider || null,
      nextDueDate: input.nextDueDate ? new Date(`${input.nextDueDate}T12:00:00Z`) : null,
      createdByName: userName,
    },
  });
}

export async function deleteMaintenance(companyId: string, assetId: string, maintenanceId: string): Promise<void> {
  const { count } = await prisma.fixedAssetMaintenance.deleteMany({ where: { id: maintenanceId, assetId, companyId } });
  if (count === 0) throw new Error('La mantención no existe');
}

export interface UpcomingMaintenance {
  assetId: string;
  code: string;
  name: string;
  location: string | null;
  dueDate: Date;
  overdue: boolean;
}

/**
 * Mantenciones programadas de los bienes activos: la próxima fecha del
 * registro más reciente de cada bien, si vence dentro de `days` días o ya
 * venció.
 */
export async function upcomingMaintenances(companyId: string, days = 30): Promise<UpcomingMaintenance[]> {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const assets = await prisma.fixedAsset.findMany({
    where: { companyId, status: 'ACTIVE', maintenances: { some: { nextDueDate: { not: null } } } },
    select: { id: true, code: true, name: true, location: true, maintenances: { where: { nextDueDate: { not: null } }, orderBy: { date: 'desc' }, take: 1, select: { nextDueDate: true } } },
  });
  return assets
    .map((asset) => ({ asset, dueDate: asset.maintenances[0]?.nextDueDate ?? null }))
    .filter((entry): entry is { asset: (typeof assets)[number]; dueDate: Date } => entry.dueDate !== null && entry.dueDate <= limit)
    .map(({ asset, dueDate }) => ({ assetId: asset.id, code: asset.code, name: asset.name, location: asset.location, dueDate, overdue: dueDate < now }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
