import { z } from 'zod';
import { normalizeLotNumber } from '../inventory/lots';
export const normalizeWarehouseLot = normalizeLotNumber;

export const WAREHOUSE_PROTOCOL = 1;
export const OFFLINE_SESSION_MS = 8 * 60 * 60 * 1000;
const identifier = z.string().min(1).max(100);
const instant = z.string().datetime();
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Revisa la fecha de vencimiento');
const quantitySchema = z.number().finite().min(0).max(1_000_000_000).refine(
  (value) => Math.abs(value * 1e6 - Math.round(value * 1e6)) < 0.001,
  'Usa como máximo seis decimales',
);

export const warehouseOperationSchema = z.object({
  protocol: z.literal(WAREHOUSE_PROTOCOL),
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  capturedAt: instant,
  kind: z.enum(['IN', 'OUT', 'TRANSFER', 'COUNT', 'RECEIPT']),
  productId: identifier,
  warehouseId: identifier,
  quantity: quantitySchema,
  lotNumber: z.string().trim().min(1).max(40).transform(normalizeLotNumber).optional(),
  expiryDate: daySchema.optional(),
  targetWarehouseId: identifier.optional(),
  orderId: identifier.optional(),
  orderItemId: identifier.optional(),
  baseline: z.object({ stockUpdatedAt: instant.nullable(), lotUpdatedAt: instant.nullable().optional() }).strict().optional(),
  note: z.string().trim().max(500).default(''),
}).strict().superRefine((value, ctx) => {
  if (value.kind !== 'COUNT' && value.quantity <= 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'La cantidad debe ser mayor a cero' });
  if (value.kind === 'COUNT' && !value.baseline) ctx.addIssue({ code: 'custom', path: ['baseline'], message: 'Actualiza las existencias antes de contar' });
  if (value.kind === 'TRANSFER' && (!value.targetWarehouseId || value.targetWarehouseId === value.warehouseId)) ctx.addIssue({ code: 'custom', path: ['targetWarehouseId'], message: 'Selecciona otra bodega de destino' });
  if (value.kind === 'RECEIPT' && (!value.orderId || !value.orderItemId)) ctx.addIssue({ code: 'custom', path: ['orderId'], message: 'Selecciona la orden y su producto pendiente' });
  if (value.kind !== 'TRANSFER' && value.targetWarehouseId) ctx.addIssue({ code: 'custom', path: ['targetWarehouseId'], message: 'El destino solo corresponde a un traslado' });
  if (value.kind !== 'RECEIPT' && (value.orderId || value.orderItemId)) ctx.addIssue({ code: 'custom', path: ['orderId'], message: 'La orden solo corresponde a una recepción' });
});
export type WarehouseOperation = z.infer<typeof warehouseOperationSchema>;
export const operationOutcomeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['APPLIED', 'REVIEW', 'CONFLICT', 'REJECTED']),
  message: z.string(),
  confirmedAt: instant.nullable(),
});
export type OperationOutcome = z.infer<typeof operationOutcomeSchema>;
export const syncRequestSchema = z.object({
  expectedScope: z.string().min(3).max(201),
  operations: z.array(warehouseOperationSchema).max(25),
  checkIds: z.array(z.string().uuid()).max(100).default([]),
}).strict();
export const reviewRequestSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(3).max(500),
  unitCost: z.number().finite().min(0).max(1_000_000_000).optional(),
}).strict();

export const warehouseProductSchema = z.object({
  id: identifier, sku: z.string(), name: z.string(), barcode: z.string().nullable(), unit: z.string(), tracksLots: z.boolean(),
  packagings: z.array(z.object({ id: identifier, name: z.string(), barcode: z.string().nullable(), factor: z.number().positive() })),
  stocks: z.array(z.object({ warehouseId: identifier, quantity: z.number(), updatedAt: instant })),
  lots: z.array(z.object({ warehouseId: identifier, lotNumber: z.string(), expiryDate: z.string().nullable(), quantity: z.number(), updatedAt: instant })),
});
export type WarehouseProduct = z.infer<typeof warehouseProductSchema>;
export const warehouseIdentitySchema = z.object({
  companyId: identifier, companyName: z.string(), userId: identifier, userName: z.string(),
  offlineUntil: instant, serverTime: instant,
  canOperate: z.boolean(), canApprove: z.boolean(), canReceive: z.boolean(),
});
export type WarehouseIdentity = z.infer<typeof warehouseIdentitySchema>;
export const warehouseBootstrapSchema = z.object({
  protocol: z.literal(WAREHOUSE_PROTOCOL), identity: warehouseIdentitySchema,
  warehouses: z.array(z.object({ id: identifier, name: z.string(), isDefault: z.boolean() })),
  products: z.array(warehouseProductSchema), nextCursor: z.string().nullable(),
  orders: z.array(z.object({ id: identifier, folio: z.number(), supplier: z.string(), items: z.array(z.object({ id: identifier, productId: identifier, description: z.string(), remaining: z.number() })) })),
});
export type WarehouseBootstrap = z.infer<typeof warehouseBootstrapSchema>;
export type LocalOperation = { payload: WarehouseOperation; status: 'LOCAL' | OperationOutcome['status']; message: string; confirmedAt: string | null };
export interface WarehouseLocalState {
  version: 1;
  deviceId: string;
  identity: WarehouseIdentity;
  warehouses: WarehouseBootstrap['warehouses'];
  products: WarehouseProduct[];
  orders: WarehouseBootstrap['orders'];
  operations: LocalOperation[];
  refreshedAt: string;
  lastSeenAt: number;
  /** Productos confirmados que aún deben refrescarse, también tras perder la red. */
  dirtyProductIds?: string[];
}
export const warehouseScope = (identity: Pick<WarehouseIdentity, 'companyId' | 'userId'>): string => `${identity.companyId}:${identity.userId}`;
export const roundQuantity = (value: number): number => Math.round(value * 1e6) / 1e6;

/** Misma intención, mismos bytes, también al deserializar JSON en otro orden. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
