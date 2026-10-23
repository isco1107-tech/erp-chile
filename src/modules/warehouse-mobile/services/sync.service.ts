import { Prisma, type MovementType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { createAuditLog } from '@/lib/auth/audit';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { calculateGrossPrice } from '@/lib/chile/tax';
import { blobPathnameStartsWith, isAllowedBlobUrl } from '@/lib/security/blob-url';
import { normalizeLotNumber, parseExpiryDate } from '@/lib/inventory/lots';
import { MODE_DEFINITIONS, buildMovementNote, type MobileMode } from '@/lib/warehouse-mobile/modes';
import { nextAutoSku } from '@/lib/warehouse-mobile/sku';
import { normalizeText, scoreTextMatch, searchTermsFor } from '@/lib/warehouse-mobile/match';
import { registerStockInTx, registerStockOutTx, registerTransferTx, type TxClient } from '@/modules/inventory/services/stock.service';
import { syncOperationSchema, type CreateProductOp, type MoveOp, type SyncOperation } from '../schema';
import type { AppliedOpResult, MobileProduct, OpRejectCode, OpResult } from '../types';
import { findByCode, getMobileProduct } from './catalog.service';

/**
 * Aplica al kardex lo que el celular del bodeguero envió.
 *
 * Reglas que no se rompen:
 * - **Idempotencia.** Cada operación trae una `clientOpId`. Se "reclama" con un
 *   INSERT dentro de la MISMA transacción que mueve el stock: o quedan las dos
 *   cosas o ninguna. Un reenvío (respuesta perdida, cola sin señal) encuentra la
 *   clave y devuelve lo mismo sin tocar el stock.
 * - **Una operación mala no tumba a las demás.** Cada una se valida y se aplica
 *   por separado, y cada una responde su propio resultado.
 * - **Nada del celular se da por bueno.** Se valida otra vez, el producto y las
 *   bodegas se buscan por `companyId`, y el costo solo se acepta de quien puede
 *   verlo.
 * - **El stock lo mueve el mismo código del escritorio** (`applyStockIn/Out`):
 *   mismo bloqueo por producto, mismo PMP, mismo asiento contable.
 */

export interface SyncActor {
  companyId: string;
  userId: string;
  userEmail: string;
  /** Permiso `inventory:write`. */
  canMove: boolean;
  /** Permiso `products:write`. */
  canCreateProduct: boolean;
  /** Permiso `products:costs`: solo así se acepta el costo que mande el celular. */
  canSeeCosts: boolean;
}

/** Rechazo de negocio: el servidor entendió la operación y no la acepta. */
class OpReject extends Error {
  constructor(
    readonly code: OpRejectCode,
    message: string,
    readonly existing?: MobileProduct
  ) {
    super(message);
  }
}

const CLIENT_OP_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function stripReplay(result: unknown): AppliedOpResult {
  return { ...(result as AppliedOpResult), replayed: true };
}

/** Respuesta guardada de un envío anterior con esta clave, si la hay. */
async function findStored(companyId: string, clientOpId: string): Promise<AppliedOpResult | null> {
  const row = await prisma.warehouseMobileOp.findUnique({
    where: { companyId_clientOpId: { companyId, clientOpId } },
    select: { result: true },
  });
  return row ? stripReplay(row.result) : null;
}

/**
 * Reclama la clave dentro de la transacción. `skipDuplicates` es un
 * `INSERT … ON CONFLICT DO NOTHING`: si otra transacción con la misma clave
 * está en curso, este INSERT espera a que termine; si ya confirmó, no inserta
 * (count 0) y se responde con lo guardado; si se deshizo, inserta y sigue.
 */
async function claim(tx: TxClient, actor: SyncActor, clientOpId: string, kind: 'MOVE' | 'CREATE_PRODUCT'): Promise<boolean> {
  const created = await tx.warehouseMobileOp.createMany({
    data: [{ companyId: actor.companyId, clientOpId, userId: actor.userId, kind, result: {} }],
    skipDuplicates: true,
  });
  return created.count === 1;
}

async function saveResult(tx: TxClient, actor: SyncActor, clientOpId: string, result: AppliedOpResult): Promise<void> {
  await tx.warehouseMobileOp.updateMany({
    where: { companyId: actor.companyId, clientOpId },
    data: { result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue },
  });
}

interface MoveInput {
  mode: MobileMode;
  productId: string;
  warehouseId: string;
  targetWarehouseId?: string;
  quantity: number;
  unitCost?: number;
  reference?: string;
  reason?: MoveOp['reason'];
  note?: string;
  lotNumber?: string;
  expiryDate?: string;
  capturedAt?: string;
}

/** El movimiento en sí, dentro de una transacción ya abierta. */
async function moveInTx(tx: TxClient, actor: SyncActor, input: MoveInput): Promise<{ product: { id: string; sku: string; name: string; unit: string }; newStock: number }> {
  const def = MODE_DEFINITIONS[input.mode];
  const { companyId } = actor;

  const product = await tx.product.findFirst({
    where: { id: input.productId, companyId },
    select: { id: true, sku: true, name: true, unit: true, costPricePMP: true, isActive: true, isTrackable: true },
  });
  if (!product) throw new OpReject('NOT_FOUND', 'El producto ya no está en el catálogo');
  if (!product.isTrackable) throw new OpReject('OTHER', 'Este producto no maneja stock');
  if (def.direction === 'in' && !product.isActive) {
    throw new OpReject('ARCHIVED_PRODUCT', `"${product.name}" está archivado. Restáuralo desde el Catálogo de Productos para recibir stock.`);
  }

  const notes = buildMovementNote({ mode: input.mode, reason: input.reason, note: input.note, capturedAt: input.capturedAt });
  const reference = input.reference?.trim() || undefined;
  const movementType: MovementType = def.movement;

  if (def.direction === 'in') {
    // Sin permiso de costos o sin costo informado, la entrada entra al PMP vigente:
    // no mueve el costo promedio ni inventa uno.
    const unitCost = actor.canSeeCosts && input.unitCost !== undefined ? input.unitCost : product.costPricePMP;
    const lots =
      input.lotNumber || input.expiryDate
        ? [{ lotNumber: normalizeLotNumber(input.lotNumber), expiryDate: parseExpiryDate(input.expiryDate), quantity: input.quantity }]
        : undefined;
    const movement = await registerStockInTx(tx, companyId, {
      productId: product.id,
      warehouseId: input.warehouseId,
      type: movementType,
      quantity: input.quantity,
      unitCost,
      reference,
      notes,
      lots,
    });
    return { product, newStock: movement.newStock };
  }

  if (def.direction === 'out') {
    const movement = await registerStockOutTx(tx, companyId, {
      productId: product.id,
      warehouseId: input.warehouseId,
      type: movementType,
      quantity: input.quantity,
      reference,
      notes,
    });
    return { product, newStock: movement.newStock };
  }

  if (!input.targetWarehouseId) throw new OpReject('INVALID', 'Elige la bodega de destino');
  const moved = await registerTransferTx(tx, companyId, {
    productId: product.id,
    fromWarehouseId: input.warehouseId,
    toWarehouseId: input.targetWarehouseId,
    quantity: input.quantity,
    reference,
    notes,
  });
  return { product, newStock: moved.out.newStock };
}

function applied(op: { clientOpId: string; mode: MobileMode; warehouseId: string; quantity: number }, kind: AppliedOpResult['kind'], moved: { product: { id: string; sku: string; name: string; unit: string }; newStock: number }, extra: Pick<AppliedOpResult, 'createdProduct' | 'mergedIntoExisting'>): AppliedOpResult {
  return {
    clientOpId: op.clientOpId,
    status: 'APPLIED',
    kind,
    mode: op.mode,
    productId: moved.product.id,
    sku: moved.product.sku,
    name: moved.product.name,
    unit: moved.product.unit,
    quantity: op.quantity,
    warehouseId: op.warehouseId,
    newStock: moved.newStock,
    createdProduct: extra.createdProduct,
    mergedIntoExisting: extra.mergedIntoExisting,
    replayed: false,
  };
}

async function applyMove(actor: SyncActor, op: MoveOp): Promise<AppliedOpResult> {
  if (!actor.canMove) throw new OpReject('FORBIDDEN', 'Tu rol no puede registrar movimientos de inventario');

  const outcome = await prisma.$transaction(async (tx) => {
    if (!(await claim(tx, actor, op.clientOpId, 'MOVE'))) return null;
    const moved = await moveInTx(tx, actor, op);
    const result = applied(op, 'MOVE', moved, { createdProduct: false, mergedIntoExisting: false });
    await saveResult(tx, actor, op.clientOpId, result);
    return result;
  }, LOCKING_TX_OPTIONS);

  if (!outcome) {
    const stored = await findStored(actor.companyId, op.clientOpId);
    if (stored) return stored;
    throw new Error('La operación quedó reclamada pero sin resultado');
  }
  return outcome;
}

/** ¿Hay en el catálogo un producto que es, casi seguro, el que se quiere crear? */
async function findLikelyDuplicate(companyId: string, name: string, brand: string | undefined): Promise<MobileProduct | null> {
  const terms = searchTermsFor({ name, brand: brand ?? null, variant: null, netContent: null });
  if (terms.length === 0) return null;
  const rows = await prisma.product.findMany({
    where: { companyId, OR: terms.map((term) => ({ name: { contains: term, mode: 'insensitive' as const } })) },
    select: { id: true, name: true, brand: true },
    take: 200,
  });
  const wanted = normalizeText(name);
  const duplicate = rows.find((row) => {
    if (normalizeText(row.name) === wanted) return true;
    // El nombre ya trae marca y contenido ("Aceite Chef 900 ml"): se puntúa como una lectura.
    return scoreTextMatch({ name, brand: brand ?? null, variant: null, netContent: name }, row) >= 0.9;
  });
  return duplicate ? getMobileProduct(companyId, duplicate.id) : null;
}

/** Categoría por id (de la empresa) o por nombre; si el nombre no existe se crea. */
async function resolveCategory(tx: TxClient, companyId: string, categoryId: string | undefined, categoryName: string | undefined): Promise<string | undefined> {
  if (categoryId) {
    const category = await tx.category.findFirst({ where: { id: categoryId, companyId }, select: { id: true } });
    if (!category) throw new OpReject('INVALID', 'La categoría elegida ya no existe');
    return category.id;
  }
  if (!categoryName) return undefined;
  const existing = await tx.category.findFirst({ where: { companyId, name: { equals: categoryName, mode: 'insensitive' } }, select: { id: true } });
  if (existing) return existing.id;
  // `skipDuplicates`: si otra operación la creó un instante antes, no aborta la transacción.
  await tx.category.createMany({ data: [{ companyId, name: categoryName }], skipDuplicates: true });
  const created = await tx.category.findFirst({ where: { companyId, name: categoryName }, select: { id: true } });
  return created?.id;
}

async function nextSkuFor(tx: TxClient, companyId: string): Promise<string> {
  // Un candado por empresa: dos productos nuevos a la vez no pueden tomar el mismo número.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`warehouse-sku:${companyId}`}))::text AS locked`;
  const rows = await tx.product.findMany({ where: { companyId, sku: { startsWith: 'PRD-' } }, orderBy: { sku: 'desc' }, take: 200, select: { sku: true } });
  return nextAutoSku(rows.map((row) => row.sku));
}

async function applyCreateProduct(actor: SyncActor, op: CreateProductOp): Promise<AppliedOpResult> {
  if (!actor.canMove || !actor.canCreateProduct) {
    throw new OpReject('FORBIDDEN', 'Tu rol no puede crear productos. Pídele a un administrador que lo cree desde el Catálogo.');
  }
  const { companyId } = actor;
  const draft = op.product;

  if (draft.imageUrl && !(isAllowedBlobUrl(draft.imageUrl) && blobPathnameStartsWith(draft.imageUrl, `products/${companyId}/`))) {
    throw new OpReject('INVALID', 'La foto del producto no es válida. Vuelve a sacarla.');
  }

  // El mismo código de barras es el mismo producto: se suma al que ya existe en vez de duplicarlo.
  // Un código de EMPAQUE (caja de 12) no es seguro de sumar: no se sabe si la cantidad son cajas o
  // unidades, así que eso se le devuelve a la persona.
  if (draft.barcode) {
    const existing = await findByCode(companyId, draft.barcode);
    if (existing?.reason === 'packaging') {
      throw new OpReject('DUPLICATE_PRODUCT', `Ese código es el de "${existing.packagingName}" de "${existing.name}".`, existing);
    }
    if (existing?.reason === 'barcode') {
      const outcome = await prisma.$transaction(async (tx) => {
        if (!(await claim(tx, actor, op.clientOpId, 'CREATE_PRODUCT'))) return null;
        const moved = await moveInTx(tx, actor, { ...op, productId: existing.id });
        const result = applied(op, 'CREATE_PRODUCT', moved, { createdProduct: false, mergedIntoExisting: true });
        await saveResult(tx, actor, op.clientOpId, result);
        return result;
      }, LOCKING_TX_OPTIONS);
      if (outcome) return outcome;
      const stored = await findStored(companyId, op.clientOpId);
      if (stored) return stored;
      throw new Error('La operación quedó reclamada pero sin resultado');
    }
  }

  if (draft.sku) {
    const taken = await prisma.product.findFirst({ where: { companyId, sku: { equals: draft.sku, mode: 'insensitive' } }, select: { id: true } });
    if (taken) {
      throw new OpReject('SKU_TAKEN', `El SKU ${draft.sku} ya lo usa otro producto.`, (await getMobileProduct(companyId, taken.id)) ?? undefined);
    }
  }

  if (!op.confirmDistinct) {
    const duplicate = await findLikelyDuplicate(companyId, draft.name, draft.brand);
    if (duplicate) throw new OpReject('DUPLICATE_PRODUCT', `Ya existe "${duplicate.name}" en el catálogo.`, duplicate);
  }

  const def = MODE_DEFINITIONS[op.mode];
  const outcome = await prisma.$transaction(async (tx) => {
    if (!(await claim(tx, actor, op.clientOpId, 'CREATE_PRODUCT'))) return null;

    const categoryId = await resolveCategory(tx, companyId, draft.categoryId, draft.categoryName);
    const sku = draft.sku ?? (await nextSkuFor(tx, companyId));
    const isExempt = draft.isExempt ?? false;
    const netPrice = draft.netPrice ?? 0;
    const created = await tx.product.create({
      data: {
        companyId,
        sku,
        name: draft.name,
        description: draft.description || undefined,
        categoryId,
        unit: draft.unit,
        isTrackable: true,
        isExempt,
        netPrice,
        grossPrice: calculateGrossPrice(netPrice, isExempt),
        minStock: draft.minStock ?? 0,
        barcode: draft.barcode || undefined,
        brand: draft.brand || undefined,
        imageUrl: draft.imageUrl || undefined,
        tracksLots: draft.tracksLots ?? false,
      },
      select: { id: true },
    });

    const notes = buildMovementNote({ mode: op.mode, note: op.note ?? 'Producto nuevo', capturedAt: op.capturedAt });
    const unitCost = actor.canSeeCosts && op.unitCost !== undefined ? op.unitCost : 0;
    const lots =
      draft.tracksLots && (op.lotNumber || op.expiryDate)
        ? [{ lotNumber: normalizeLotNumber(op.lotNumber), expiryDate: parseExpiryDate(op.expiryDate), quantity: op.quantity }]
        : undefined;
    const movement = await registerStockInTx(tx, companyId, {
      productId: created.id,
      warehouseId: op.warehouseId,
      type: def.movement as MovementType,
      quantity: op.quantity,
      unitCost,
      reference: op.reference?.trim() || undefined,
      notes,
      lots,
    });

    const result = applied(op, 'CREATE_PRODUCT', { product: { id: created.id, sku, name: draft.name, unit: draft.unit }, newStock: movement.newStock }, { createdProduct: true, mergedIntoExisting: false });
    await saveResult(tx, actor, op.clientOpId, result);
    return result;
  }, LOCKING_TX_OPTIONS);

  if (outcome) return outcome;
  const stored = await findStored(companyId, op.clientOpId);
  if (stored) return stored;
  throw new Error('La operación quedó reclamada pero sin resultado');
}

/** Traduce lo que lanzó la operación a lo que el celular debe hacer con ella. */
function toFailure(clientOpId: string, error: unknown, companyId: string): OpResult {
  if (error instanceof OpReject) {
    return { clientOpId, status: 'REJECTED', code: error.code, message: error.message, existing: error.existing };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Choque con otro envío en curso (mismo SKU o código creados a la vez), transacción vencida o conexión caída.
    if (['P2002', 'P2034', 'P2028', 'P1001', 'P1002', 'P1008', 'P1017'].includes(error.code)) {
      return { clientOpId, status: 'RETRY', message: 'El servidor estaba ocupado. Se reintentará solo.' };
    }
  }

  const message = error instanceof Error ? error.message : '';
  if (/Stock insuficiente/i.test(message)) return { clientOpId, status: 'REJECTED', code: 'INSUFFICIENT_STOCK', message };
  if (/no encontrad[oa]/i.test(message)) return { clientOpId, status: 'REJECTED', code: 'NOT_FOUND', message };
  if (/demasiado grande|mayor a cero|no puede ser negativo|deben ser distintas|no coincide/i.test(message)) {
    return { clientOpId, status: 'REJECTED', code: 'INVALID', message };
  }
  if (/no gestiona stock/i.test(message)) return { clientOpId, status: 'REJECTED', code: 'OTHER', message };

  captureException(error, { module: 'bodega-movil', companyId, extra: { reason: 'sync-op', clientOpId } });
  return { clientOpId, status: 'RETRY', message: 'Ocurrió un error inesperado. Se reintentará solo.' };
}

async function applyOne(actor: SyncActor, op: SyncOperation): Promise<OpResult> {
  // Un reenvío con la misma clave responde lo ya aplicado, aunque el permiso haya cambiado desde entonces.
  const stored = await findStored(actor.companyId, op.clientOpId);
  if (stored) return stored;
  return op.kind === 'MOVE' ? applyMove(actor, op) : applyCreateProduct(actor, op);
}

/**
 * Procesa un envío del celular, en orden. Las operaciones llegan sin validar;
 * una inválida responde su propio rechazo y las demás siguen.
 */
export async function processOperations(actor: SyncActor, rawOps: readonly unknown[]): Promise<OpResult[]> {
  const results: OpResult[] = [];
  for (const [index, raw] of rawOps.entries()) {
    const declaredId = (raw as { clientOpId?: unknown } | null)?.clientOpId;
    const fallbackId = typeof declaredId === 'string' && CLIENT_OP_ID_PATTERN.test(declaredId) ? declaredId : `invalida-${index}`;

    const parsed = syncOperationSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ clientOpId: fallbackId, status: 'REJECTED', code: 'INVALID', message: parsed.error.issues[0]?.message ?? 'Operación inválida' });
      continue;
    }

    try {
      const result = await applyOne(actor, parsed.data);
      results.push(result);
      if (result.status === 'APPLIED' && !result.replayed) await audit(actor, parsed.data, result);
    } catch (error) {
      results.push(toFailure(parsed.data.clientOpId, error, actor.companyId));
    }
  }
  return results;
}

/** Deja en la bitácora lo mismo que dejaría el formulario del escritorio, marcado como venido de la app. */
async function audit(actor: SyncActor, op: SyncOperation, result: AppliedOpResult): Promise<void> {
  const base = { companyId: actor.companyId, userId: actor.userId, userEmail: actor.userEmail };
  if (result.createdProduct) {
    await createAuditLog({
      ...base,
      action: 'CREATE',
      entity: 'Product',
      entityId: result.productId,
      metadata: { source: 'bodega-movil', sku: result.sku, name: result.name },
    });
  }
  await createAuditLog({
    ...base,
    action: 'STOCK_ADJUSTMENT',
    entity: 'Product',
    entityId: result.productId,
    metadata: {
      source: 'bodega-movil',
      type: MODE_DEFINITIONS[op.mode].movement,
      mode: op.mode,
      warehouseId: op.warehouseId,
      targetWarehouseId: op.kind === 'MOVE' ? op.targetWarehouseId : undefined,
      quantity: op.quantity,
      unitCost: actor.canSeeCosts ? op.unitCost : undefined,
      reference: op.reference,
      reason: op.kind === 'MOVE' ? op.reason : undefined,
      mergedIntoExisting: result.mergedIntoExisting || undefined,
    },
  });
}
