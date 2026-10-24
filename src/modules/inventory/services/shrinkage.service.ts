import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { santiagoMidnightUtc, startOfTodaySantiago } from '@/lib/chile/timezone';
import { daysToExpiry } from '@/lib/inventory/lots';
import {
  DEFAULT_SHRINKAGE_SETTINGS,
  EXPIRY_ALERT_DAY_OPTIONS,
  isExpiryAlertDay,
  reasonKey,
  suggestLiability,
  summarizeShrinkage,
  type LiabilityState,
  type LiableParty,
  type ShrinkageReasonKey,
  type ShrinkageSummary,
} from '@/lib/inventory/shrinkage';
import { wasteReasonLabel } from '@/lib/warehouse-mobile/modes';
import { notifyCompany } from '@/lib/notifications/company-notification';
import { shrinkageDefaultsSchema } from '../shrinkage.schema';

/**
 * Mermas con responsable: las pérdidas del kardex de UNA bodega con quién
 * responde por cada una (ver `src/lib/inventory/shrinkage.ts`). Todo filtra
 * por `companyId`; la asignación vive en `ShrinkageLiability`, nunca en el
 * movimiento.
 */

/** Referencia con que la toma de inventario registra un faltante (`inventory-count.service.ts`). */
export const COUNT_SHORTAGE_PREFIX = 'Toma de inventario #';
/** Tope de filas por consulta: un período más largo se acota con las fechas. */
export const MAX_SHRINKAGE_ROWS = 2000;

/**
 * Qué salida es una PÉRDIDA: con motivo (salvo la devolución al proveedor), un
 * ajuste de salida hecho por una persona, o un faltante de una toma de
 * inventario. Quedan fuera el consumo de producción, las devoluciones por nota
 * de crédito y las anulaciones, que también son salidas pero no pérdidas.
 */
export const LOSS_WHERE: Prisma.InventoryMovementWhereInput = {
  type: 'ADJUSTMENT_OUT',
  OR: [
    { reasonCode: { not: null, notIn: ['SUPPLIER_RETURN'] } },
    { reasonCode: null, userId: { not: null } },
    { reasonCode: null, reference: { startsWith: COUNT_SHORTAGE_PREFIX } },
  ],
};

export interface ShrinkageSettingsValues {
  defaults: Partial<Record<ShrinkageReasonKey, LiableParty>>;
  expiryAlerts: boolean;
  expiryAlertDays: number;
}

export async function getShrinkageSettings(companyId: string): Promise<ShrinkageSettingsValues> {
  const row = await prisma.shrinkageSettings.findUnique({ where: { companyId } });
  if (!row) return { defaults: {}, ...DEFAULT_SHRINKAGE_SETTINGS };
  const defaults = shrinkageDefaultsSchema.safeParse(row.defaults ?? {});
  return {
    defaults: defaults.success ? defaults.data : {},
    expiryAlerts: row.expiryAlerts,
    expiryAlertDays: (EXPIRY_ALERT_DAY_OPTIONS as readonly number[]).includes(row.expiryAlertDays) ? row.expiryAlertDays : DEFAULT_SHRINKAGE_SETTINGS.expiryAlertDays,
  };
}

export async function saveShrinkageSettings(companyId: string, values: ShrinkageSettingsValues): Promise<void> {
  const data = { defaults: values.defaults, expiryAlerts: values.expiryAlerts, expiryAlertDays: values.expiryAlertDays };
  await prisma.shrinkageSettings.upsert({ where: { companyId }, update: data, create: { companyId, ...data } });
}

export interface ShrinkageFilter {
  warehouseId: string;
  /** `YYYY-MM-DD` en hora de Chile, ambas inclusive. */
  from: string;
  to: string;
  /** Código de motivo o `NONE`. */
  reason?: string;
  state?: LiabilityState;
  /** Proveedor que responde (asignado). */
  supplierId?: string;
}

export interface ShrinkageRow {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  reasonCode: ShrinkageReasonKey;
  reasonLabel: string;
  note: string | null;
  evidenceUrl: string | null;
  operator: string | null;
  totalCost: number | null;
  /** Seller dueño del producto (primero) y sus proveedores, para elegir quién responde. */
  productSuppliers: Array<{ id: string; name: string }>;
  state: LiabilityState;
  liability: { party: LiableParty; supplier: { id: string; name: string } | null; assignedByName: string | null; assignedAt: string } | null;
  suggestion: { party: LiableParty; supplier: { id: string; name: string } | null } | null;
}

const day = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};

export function reasonLabelOf(reasonCode: string | null, reference: string | null): string {
  const label = wasteReasonLabel(reasonCode);
  if (label) return label;
  return reference?.startsWith(COUNT_SHORTAGE_PREFIX) ? 'Faltante en toma de inventario' : 'Ajuste de salida sin motivo';
}

export async function listShrinkage(
  companyId: string,
  filter: ShrinkageFilter,
  options: { includeCosts: boolean }
): Promise<{ rows: ShrinkageRow[]; summary: ShrinkageSummary; truncated: boolean }> {
  const from = day(filter.from);
  const to = day(filter.to);
  const toNext = new Date(Date.UTC(to.y, to.m - 1, to.d + 1));
  const where: Prisma.InventoryMovementWhereInput = {
    companyId,
    warehouseId: filter.warehouseId,
    createdAt: { gte: santiagoMidnightUtc(from.y, from.m, from.d), lt: santiagoMidnightUtc(toNext.getUTCFullYear(), toNext.getUTCMonth() + 1, toNext.getUTCDate()) },
    AND: [LOSS_WHERE, ...(filter.reason ? [filter.reason === 'NONE' ? { reasonCode: null } : { reasonCode: filter.reason }] : [])],
  };

  const [movements, settings] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_SHRINKAGE_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        quantity: true,
        totalCost: true,
        reasonCode: true,
        reference: true,
        notes: true,
        evidenceUrl: true,
        supplierId: true,
        user: { select: { name: true } },
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            // El dueño de la mercadería en consignación (seller), si la tiene, y quienes la surten.
            consignor: { select: { id: true, razonSocial: true, companyId: true } },
            suppliers: { where: { companyId }, select: { supplier: { select: { id: true, razonSocial: true } } } },
          },
        },
        liability: { select: { party: true, assignedByName: true, assignedAt: true, supplier: { select: { id: true, razonSocial: true, companyId: true } } } },
      },
    }),
    getShrinkageSettings(companyId),
  ]);
  const truncated = movements.length > MAX_SHRINKAGE_ROWS;
  const supplierNames = new Map<string, string>();
  for (const movement of movements) for (const link of movement.product.suppliers) supplierNames.set(link.supplier.id, link.supplier.razonSocial);
  const consignorOf = (product: (typeof movements)[number]['product']) => (product.consignor && product.consignor.companyId === companyId ? { id: product.consignor.id, name: product.consignor.razonSocial } : null);
  for (const movement of movements) {
    const consignor = consignorOf(movement.product);
    if (consignor) supplierNames.set(consignor.id, consignor.name);
  }
  const arrivalSupplierIds = [...new Set(movements.map((movement) => movement.supplierId).filter((id): id is string => Boolean(id) && !supplierNames.has(id!)))];
  if (arrivalSupplierIds.length) {
    for (const contact of await prisma.contact.findMany({ where: { companyId, id: { in: arrivalSupplierIds } }, select: { id: true, razonSocial: true } })) supplierNames.set(contact.id, contact.razonSocial);
  }
  const named = (id: string | null) => (id && supplierNames.has(id) ? { id, name: supplierNames.get(id)! } : null);

  const all: ShrinkageRow[] = movements.slice(0, MAX_SHRINKAGE_ROWS).map((movement) => {
    const assigned = movement.liability && (movement.liability.party === 'STORE' || movement.liability.party === 'SUPPLIER') ? movement.liability : null;
    const assignedSupplier = assigned?.supplier && assigned.supplier.companyId === companyId ? { id: assigned.supplier.id, name: assigned.supplier.razonSocial } : null;
    const suggestion = assigned
      ? null
      : suggestLiability({
          reasonCode: movement.reasonCode,
          defaults: settings.defaults,
          productConsignorId: consignorOf(movement.product)?.id ?? null,
          movementSupplierId: movement.supplierId,
          productSupplierIds: movement.product.suppliers.map((link) => link.supplier.id),
        });
    return {
      id: movement.id,
      createdAt: movement.createdAt.toISOString(),
      productId: movement.product.id,
      productName: movement.product.name,
      sku: movement.product.sku,
      unit: movement.product.unit,
      quantity: movement.quantity,
      reasonCode: reasonKey(movement.reasonCode),
      reasonLabel: reasonLabelOf(movement.reasonCode, movement.reference),
      note: movement.notes,
      evidenceUrl: movement.evidenceUrl,
      operator: movement.user?.name ?? null,
      totalCost: options.includeCosts ? movement.totalCost : null,
      productSuppliers: [
        ...(consignorOf(movement.product) ? [consignorOf(movement.product)!] : []),
        ...movement.product.suppliers.map((link) => ({ id: link.supplier.id, name: link.supplier.razonSocial })),
      ].filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index),
      state: assigned ? (assigned.party as LiableParty) : 'UNASSIGNED',
      liability: assigned
        ? { party: assigned.party as LiableParty, supplier: assignedSupplier, assignedByName: assigned.assignedByName, assignedAt: assigned.assignedAt.toISOString() }
        : null,
      suggestion: suggestion ? { party: suggestion.party, supplier: named(suggestion.supplierId) } : null,
    };
  });

  const rows = all.filter((row) => (!filter.state || row.state === filter.state) && (!filter.supplierId || row.liability?.supplier?.id === filter.supplierId));
  const summary = summarizeShrinkage(
    rows.map((row) => ({ quantity: row.quantity, totalCost: row.totalCost, state: row.state, supplier: row.liability?.supplier ?? null })),
    options.includeCosts
  );
  return { rows, summary, truncated };
}

/** Proveedores y sellers de la empresa, para filtrar por quién responde. */
export async function listSuppliersForShrinkage(companyId: string): Promise<Array<{ id: string; name: string }>> {
  const contacts = await prisma.contact.findMany({ where: { companyId, OR: [{ isSupplier: true }, { isConsignor: true }] }, select: { id: true, razonSocial: true }, orderBy: { razonSocial: 'asc' }, take: 500 });
  return contacts.map((contact) => ({ id: contact.id, name: contact.razonSocial }));
}

export class ShrinkageError extends Error {}

export interface LiabilityActor {
  id: string;
  name: string;
}

/**
 * Asigna (o quita, con `party: null`) quién responde por una pérdida. La salida
 * tiene que ser una pérdida de ESTA empresa y el proveedor un contacto
 * proveedor de ESTA empresa.
 */
export async function assignLiability(
  companyId: string,
  actor: LiabilityActor,
  input: { movementId: string; party: LiableParty | null; supplierId?: string | null }
): Promise<void> {
  const movement = await prisma.inventoryMovement.findFirst({ where: { id: input.movementId, companyId, ...LOSS_WHERE }, select: { id: true } });
  if (!movement) throw new ShrinkageError('Esa pérdida no existe en tu empresa');
  if (input.party === null) {
    await prisma.shrinkageLiability.deleteMany({ where: { companyId, movementId: movement.id } });
    return;
  }
  let supplierId: string | null = null;
  if (input.party === 'SUPPLIER') {
    const supplier = await prisma.contact.findFirst({ where: { id: input.supplierId ?? '', companyId, OR: [{ isSupplier: true }, { isConsignor: true }] }, select: { id: true } });
    if (!supplier) throw new ShrinkageError('Elige un proveedor o seller de tu empresa');
    supplierId = supplier.id;
  }
  const data = { party: input.party, supplierId, assignedById: actor.id, assignedByName: actor.name, assignedAt: new Date() };
  await prisma.shrinkageLiability.upsert({ where: { movementId: movement.id }, update: data, create: { companyId, movementId: movement.id, ...data } });
}

/** Confirma la sugerencia de todas las pérdidas sin asignar del filtro que tienen una. Devuelve cuántas. */
export async function applySuggestions(companyId: string, actor: LiabilityActor, filter: ShrinkageFilter): Promise<number> {
  const { rows } = await listShrinkage(companyId, { ...filter, state: 'UNASSIGNED' }, { includeCosts: false });
  const pending = rows.filter((row) => row.suggestion && (row.suggestion.party === 'STORE' || row.suggestion.supplier));
  if (pending.length === 0) return 0;
  const assignedAt = new Date();
  // `skipDuplicates`: si alguien asignó una entre la lectura y esta escritura, se respeta la suya.
  const result = await prisma.shrinkageLiability.createMany({
    data: pending.map((row) => ({
      companyId,
      movementId: row.id,
      party: row.suggestion!.party,
      supplierId: row.suggestion!.party === 'SUPPLIER' ? row.suggestion!.supplier!.id : null,
      assignedById: actor.id,
      assignedByName: actor.name,
      assignedAt,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Aviso diario de lotes por vencer (lo llama la alerta operativa): una
 * campanita por empresa con los lotes con saldo que HOY están a los días
 * configurados de vencer o vencen hoy. Nada si los avisos están apagados.
 */
export async function alertExpiringLots(companyId: string, now: Date = new Date()): Promise<number> {
  const settings = await getShrinkageSettings(companyId);
  if (!settings.expiryAlerts) return 0;
  const today = startOfTodaySantiago(now);
  const lots = await prisma.inventoryLot.findMany({
    where: { companyId, quantity: { gt: 0 }, expiryDate: { gte: new Date(today.getTime() - 86_400_000), lt: new Date(today.getTime() + (settings.expiryAlertDays + 2) * 86_400_000) } },
    select: { expiryDate: true, product: { select: { name: true } } },
    take: 2000,
  });
  const due = lots.filter((lot) => lot.expiryDate && isExpiryAlertDay(daysToExpiry(lot.expiryDate, today), settings.expiryAlertDays));
  if (due.length === 0) return 0;
  const dueToday = due.filter((lot) => daysToExpiry(lot.expiryDate!, today) === 0).length;
  const dueLater = due.length - dueToday;
  const vence = (count: number) => (count === 1 ? 'Un lote vence' : `${count} lotes vencen`);
  const title =
    dueToday && dueLater ? `${vence(dueToday)} hoy y ${dueLater} en ${settings.expiryAlertDays} días` : dueToday ? `${vence(dueToday)} hoy` : `${vence(dueLater)} en ${settings.expiryAlertDays} días`;
  const names = [...new Set(due.map((lot) => lot.product.name))];
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` y ${names.length - 3} más` : '';
  await notifyCompany(companyId, {
    severity: dueToday > 0 ? 'CRITICAL' : 'WARNING',
    title,
    message: `${shown}${more}. Prioriza su venta, una degustación o una rebaja; lo vencido se retira y se registra como merma.`,
    href: '/dashboard/inventory/lots',
  });
  return due.length;
}
