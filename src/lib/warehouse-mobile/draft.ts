import type { NewProductInput, SyncOperation } from '@/modules/warehouse-mobile/schema';
import { MAX_QUANTITY } from '@/modules/warehouse-mobile/schema';
import type { MobileCandidate, MobileProduct, VisionRead } from '@/modules/warehouse-mobile/types';
import { MODE_DEFINITIONS, MAX_NOTE_LENGTH, isInboundMode, isTransferMode, reasonRequiresNote, type MobileMode, type WasteReason } from './modes';
import { skuForCatalog } from './codes';
import { composeProductName } from './vision';

/**
 * El "borrador" del bodeguero: lo que va juntando mientras recibe o descuenta
 * mercadería, antes de enviarlo. Sobrevive a un cierre de la app (se guarda en
 * el teléfono), así que cada línea es un dato plano y serializable.
 *
 * Una línea nace de una foto, de un código o de una búsqueda, y pasa por estados
 * hasta quedar lista:
 *
 *   code / identify  → esperando que el sistema la reconozca (puede tardar si
 *                      la IA está al tope o no hay señal; la persona sigue trabajando)
 *   resolve          → el sistema no pudo decidir solo: la persona elige, busca o crea
 *   product          → ya se sabe qué producto es (falta confirmarlo si lo sugirió la IA)
 *   new              → producto nuevo, con los datos que la persona revisó
 *
 * Todo en este archivo es puro: sin reloj, sin azar y sin navegador (entran por
 * parámetro), para poder probar cada transición.
 */

export interface PendingState {
  attempts: number;
  /** Epoch ms del próximo intento. */
  nextAttemptAt: number;
  message: string | null;
}

/** Datos del formulario de producto nuevo. Todo texto: así se edita sin conversiones. */
export interface NewProductForm {
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  description: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  netPrice: string;
  unitCost: string;
  tracksLots: boolean;
  isExempt: boolean;
}

export type ResolveReason = 'candidates' | 'new' | 'unreadable' | 'unavailable' | 'failed' | 'unknown-code';

export type LineSource =
  | { kind: 'product'; product: MobileProduct; confirmed: boolean; origin: 'code' | 'ai' | 'manual'; photoId: string | null }
  | { kind: 'identify'; photoId: string; pending: PendingState }
  | { kind: 'code'; code: string; pending: PendingState }
  | { kind: 'resolve'; reason: ResolveReason; candidates: MobileCandidate[]; read: VisionRead | null; photoId: string | null; code: string | null; message: string | null }
  | { kind: 'new'; form: NewProductForm; photoId: string | null };

export interface DraftLine {
  id: string;
  createdAt: number;
  quantity: number;
  unitCost: string;
  lotNumber: string;
  expiryDate: string;
  note: string;
  /**
   * Foto del producto en cuestión tomada para respaldar una salida (merma, daño,
   * degustación). Si el producto se identificó con una foto, esa misma foto sirve
   * (ver `evidencePhotoOf`); esta es la que la persona saca a propósito.
   */
  evidencePhotoId: string | null;
  source: LineSource;
}

export interface Draft {
  mode: MobileMode;
  warehouseId: string;
  targetWarehouseId: string;
  /** Proveedor de quien llega la mercadería (modos de entrada). */
  supplierId: string;
  reference: string;
  reason: WasteReason | '';
  note: string;
  lines: DraftLine[];
}

export function emptyDraft(mode: MobileMode, warehouseId: string): Draft {
  return { mode, warehouseId, targetWarehouseId: '', supplierId: '', reference: '', reason: '', note: '', lines: [] };
}

/**
 * Un borrador guardado por una versión anterior de la app no trae los campos nuevos
 * (proveedor, foto de respaldo): se completan para que nada falle al abrirlo.
 */
export function upgradeDraft(saved: Draft): Draft {
  return {
    ...saved,
    supplierId: saved.supplierId ?? '',
    lines: saved.lines.map((line) => ({ ...line, evidencePhotoId: line.evidencePhotoId ?? null })),
  };
}

/** La foto que respalda una línea: la sacada a propósito o, si no, la que sirvió para identificar el producto. */
export function evidencePhotoOf(line: DraftLine): string | null {
  if (line.evidencePhotoId) return line.evidencePhotoId;
  return line.source.kind === 'product' ? line.source.photoId : null;
}

export function freshPending(now: number): PendingState {
  return { attempts: 0, nextAttemptAt: now, message: null };
}

/** Modos en los que se puede dar de alta un producto nuevo (los que suman stock sin documento previo). */
export function canCreateInMode(mode: MobileMode): boolean {
  return mode === 'RECEIVE' || mode === 'SURPLUS';
}

/** Productos por kilo, litro o metro admiten decimales; el resto, unidades enteras. */
export function allowsDecimals(unit: string): boolean {
  return unit === 'KG' || unit === 'LTS' || unit === 'MT';
}

export function clampQuantity(value: number, unit = 'UN'): number {
  if (!Number.isFinite(value)) return 0;
  const bounded = Math.min(MAX_QUANTITY, Math.max(0, value));
  return allowsDecimals(unit) ? Math.round(bounded * 1000) / 1000 : Math.round(bounded);
}

/** Unidad del producto de una línea, si ya se sabe. */
export function lineUnit(line: DraftLine): string {
  if (line.source.kind === 'product') return line.source.product.unit;
  if (line.source.kind === 'new') return line.source.form.unit || 'UN';
  return 'UN';
}

function withLines(draft: Draft, lines: DraftLine[]): Draft {
  return { ...draft, lines };
}

function newLine(id: string, now: number, quantity: number, source: LineSource): DraftLine {
  return { id, createdAt: now, quantity, unitCost: '', lotNumber: '', expiryDate: '', note: '', evidencePhotoId: null, source };
}

/** Dos líneas son "la misma" si apuntan al mismo producto y no llevan lote ni vencimiento propios. */
function mergeable(a: DraftLine, b: DraftLine): boolean {
  return (
    a.source.kind === 'product' &&
    b.source.kind === 'product' &&
    a.source.product.id === b.source.product.id &&
    !a.lotNumber &&
    !b.lotNumber &&
    !a.expiryDate &&
    !b.expiryDate &&
    !a.unitCost &&
    !b.unitCost
  );
}

/** Junta líneas repetidas del mismo producto sumando cantidades. Conserva el orden de la primera aparición. */
export function mergeDuplicates(lines: readonly DraftLine[]): DraftLine[] {
  const result: DraftLine[] = [];
  for (const line of lines) {
    const target = result.find((existing) => mergeable(existing, line));
    if (!target) {
      result.push(line);
      continue;
    }
    const unit = lineUnit(target);
    const index = result.indexOf(target);
    const confirmed = target.source.kind === 'product' && line.source.kind === 'product' ? target.source.confirmed && line.source.confirmed : true;
    result[index] = {
      ...target,
      // Si se junta con otra línea del mismo producto, la foto de respaldo no se pierde.
      evidencePhotoId: target.evidencePhotoId ?? evidencePhotoOf(line),
      quantity: clampQuantity(target.quantity + line.quantity, unit),
      source: target.source.kind === 'product' ? { ...target.source, confirmed } : target.source,
    };
  }
  return result;
}

export interface AddProductOptions {
  id: string;
  now: number;
  quantity?: number;
  confirmed?: boolean;
  origin?: 'code' | 'ai' | 'manual';
  photoId?: string | null;
}

/** Agrega un producto ya conocido; si ya estaba en la lista, suma la cantidad. */
export function addProduct(draft: Draft, product: MobileProduct, options: AddProductOptions): Draft {
  const quantity = clampQuantity(options.quantity ?? 1, product.unit) || 1;
  const line = newLine(options.id, options.now, quantity, {
    kind: 'product',
    product,
    confirmed: options.confirmed ?? true,
    origin: options.origin ?? 'manual',
    photoId: options.photoId ?? null,
  });
  return withLines(draft, mergeDuplicates([...draft.lines, line]));
}

/** Un código leído que todavía no se buscó: si ya hay uno igual esperando, suma. */
export function addCode(draft: Draft, code: string, options: { id: string; now: number; quantity?: number }): Draft {
  const quantity = options.quantity ?? 1;
  const existing = draft.lines.find((line) => line.source.kind === 'code' && line.source.code === code);
  if (existing) return setQuantity(draft, existing.id, existing.quantity + quantity);
  return withLines(draft, [...draft.lines, newLine(options.id, options.now, quantity, { kind: 'code', code, pending: freshPending(options.now) })]);
}

export function addPhoto(draft: Draft, photoId: string, options: { id: string; now: number }): Draft {
  return withLines(draft, [...draft.lines, newLine(options.id, options.now, 1, { kind: 'identify', photoId, pending: freshPending(options.now) })]);
}

export function setQuantity(draft: Draft, lineId: string, quantity: number): Draft {
  return withLines(
    draft,
    draft.lines.map((line) => (line.id === lineId ? { ...line, quantity: clampQuantity(quantity, lineUnit(line)) } : line))
  );
}

export function patchLine(draft: Draft, lineId: string, patch: Partial<Omit<DraftLine, 'id' | 'source' | 'createdAt'>>): Draft {
  return withLines(draft, draft.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
}

export function removeLine(draft: Draft, lineId: string): Draft {
  return withLines(draft, draft.lines.filter((line) => line.id !== lineId));
}

export function setSource(draft: Draft, lineId: string, source: LineSource): Draft {
  return withLines(draft, mergeDuplicates(draft.lines.map((line) => (line.id === lineId ? { ...line, source } : line))));
}

/** La persona confirmó que el producto sugerido por la IA es el correcto. */
export function confirmLine(draft: Draft, lineId: string): Draft {
  return withLines(
    draft,
    mergeDuplicates(draft.lines.map((line) => (line.id === lineId && line.source.kind === 'product' ? { ...line, source: { ...line.source, confirmed: true } } : line)))
  );
}

/** Elegido un producto del catálogo para una línea que estaba por resolver (la cantidad ya puesta se respeta). */
export function resolveWithProduct(draft: Draft, lineId: string, product: MobileProduct, options: { confirmed: boolean; origin: 'code' | 'ai' | 'manual'; factor?: number }): Draft {
  const line = draft.lines.find((candidate) => candidate.id === lineId);
  if (!line) return draft;
  const photoId = 'photoId' in line.source ? line.source.photoId : null;
  // Un código de caja (x12) suma 12 unidades por lectura.
  const quantity = options.factor && options.factor > 1 ? line.quantity * options.factor : line.quantity;
  return withLines(
    draft,
    mergeDuplicates(
      draft.lines.map((candidate) =>
        candidate.id === lineId
          ? { ...candidate, quantity: clampQuantity(quantity, product.unit) || 1, source: { kind: 'product' as const, product, confirmed: options.confirmed, origin: options.origin, photoId } }
          : candidate
      )
    )
  );
}

const MAX_PRICE = 100_000_000;

function inRange(value: number): number | undefined {
  return Number.isFinite(value) && value >= 0 && value <= MAX_PRICE ? value : undefined;
}

/**
 * Cantidad escrita por una persona ("2,5" o "2.5" kilos). El punto o la coma
 * son decimales. `undefined` si está vacío o no es un número válido.
 */
export function parseDecimal(text: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, '');
  if (!cleaned) return undefined;
  // Con coma, los puntos son separadores de miles ("1.234,5"); sin coma, el punto es decimal.
  return inRange(Number(cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned));
}

/**
 * Monto en pesos como se escribe en Chile: "1.290" son mil doscientos noventa,
 * no uno coma veintinueve. Un punto seguido de exactamente tres dígitos es
 * separador de miles; "12,50" o "12.5" son decimales (costos con centavos).
 */
export function parseMoney(text: string): number | undefined {
  const cleaned = text.trim().replace(/[\s$]/g, '');
  if (!cleaned) return undefined;
  if (cleaned.includes(',')) return inRange(Number(cleaned.replace(/\./g, '').replace(',', '.')));
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return inRange(Number(cleaned.replace(/\./g, '')));
  return inRange(Number(cleaned));
}

/** Formulario de producto nuevo, prellenado con lo que la IA leyó o el código que se escaneó (todo editable). */
export function newProductFormFrom(options: { read?: VisionRead | null; code?: string | null }): NewProductForm {
  const read = options.read ?? null;
  return {
    name: read ? composeProductName(read) : '',
    brand: read?.brand ?? '',
    // El código de producto impreso en la etiqueta es el SKU natural del producto nuevo (se puede cambiar).
    sku: read?.sku ? skuForCatalog(read.sku) : '',
    barcode: read?.barcode ?? options.code ?? '',
    description: read?.description ?? '',
    unit: read?.unit ?? 'UN',
    categoryId: '',
    categoryName: read?.categoryHint ?? '',
    netPrice: '',
    unitCost: '',
    tracksLots: Boolean(read?.lotNumber || read?.expiryDate),
    isExempt: false,
  };
}

export interface DraftProblem {
  lineId?: string;
  message: string;
}

export interface ValidationContext {
  canCreateProduct: boolean;
  /** Proveedores que tiene la empresa: con ninguno, elegir proveedor no es obligatorio. */
  supplierCount: number;
}

/** Todo lo que impide enviar el borrador, en el orden en que la persona debería arreglarlo. */
export function validateDraft(draft: Draft, context: ValidationContext): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const def = MODE_DEFINITIONS[draft.mode];

  if (draft.lines.length === 0) problems.push({ message: 'Agrega al menos un producto.' });
  if (!draft.warehouseId) problems.push({ message: 'Elige la bodega.' });
  if (isTransferMode(draft.mode)) {
    if (!draft.targetWarehouseId) problems.push({ message: 'Elige la bodega de destino.' });
    else if (draft.targetWarehouseId === draft.warehouseId) problems.push({ message: 'La bodega de destino debe ser distinta de la de origen.' });
  }
  if (def.asksReason && !draft.reason) problems.push({ message: 'Indica el motivo de la salida.' });
  if (def.asksReason && reasonRequiresNote(draft.reason || null) && !draft.note.trim()) {
    problems.push({ message: 'Cuenta qué pasó: "Otro motivo" necesita una explicación.' });
  }
  if (def.supplier === 'required' && context.supplierCount > 0 && !draft.supplierId) {
    problems.push({ message: 'Elige el proveedor de esta llegada.' });
  }

  for (const line of draft.lines) {
    const { source } = line;
    if (source.kind === 'code' || source.kind === 'identify') {
      problems.push({ lineId: line.id, message: 'Todavía se está identificando este producto. Espera un momento o búscalo a mano.' });
      continue;
    }
    if (source.kind === 'resolve') {
      problems.push({ lineId: line.id, message: 'Elige qué producto es, o créalo.' });
      continue;
    }
    if (source.kind === 'product' && !source.confirmed) {
      problems.push({ lineId: line.id, message: `Confirma que "${source.product.name}" es el producto correcto.` });
    }
    if (source.kind === 'new') {
      if (!canCreateInMode(draft.mode)) {
        problems.push({ lineId: line.id, message: 'Para crear un producto nuevo usa "Llegada de mercadería" o "Sobrante".' });
      } else if (!context.canCreateProduct) {
        problems.push({ lineId: line.id, message: 'Tu rol no puede crear productos. Pídele a un administrador que lo cree.' });
      } else if (source.form.name.trim().length < 2) {
        problems.push({ lineId: line.id, message: 'Ponle un nombre al producto nuevo.' });
      }
    }
    if (def.requiresEvidence && !evidencePhotoOf(line)) {
      problems.push({ lineId: line.id, message: 'Saca una foto del producto: queda adjunta a la salida.' });
    }
    if (!(line.quantity > 0)) problems.push({ lineId: line.id, message: 'La cantidad debe ser mayor a cero.' });
    if (line.unitCost.trim() && parseMoney(line.unitCost) === undefined) problems.push({ lineId: line.id, message: 'El costo no es un número válido.' });
  }
  return problems;
}

/** Cuántas líneas hay en cada estado, para el resumen de la pantalla. */
export function summarizeDraft(draft: Draft): { total: number; ready: number; identifying: number; needsYou: number } {
  let ready = 0;
  let identifying = 0;
  let needsYou = 0;
  for (const line of draft.lines) {
    const { source } = line;
    if (source.kind === 'code' || source.kind === 'identify') identifying++;
    else if (source.kind === 'resolve' || (source.kind === 'product' && !source.confirmed)) needsYou++;
    else ready++;
  }
  return { total: draft.lines.length, ready, identifying, needsYou };
}

function newProductInput(form: NewProductForm): NewProductInput {
  const brand = form.brand.trim();
  const sku = form.sku.trim();
  const barcode = form.barcode.trim();
  const description = form.description.trim();
  const category = form.categoryName.trim();
  const price = parseMoney(form.netPrice);
  return {
    name: form.name.trim(),
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    ...(brand ? { brand } : {}),
    ...(description ? { description } : {}),
    unit: (form.unit || 'UN') as NewProductInput['unit'],
    ...(form.categoryId ? { categoryId: form.categoryId } : category ? { categoryName: category } : {}),
    ...(price !== undefined ? { netPrice: Math.round(price) } : {}),
    isExempt: form.isExempt,
    tracksLots: form.tracksLots,
  };
}

export interface BuiltOperations {
  ops: SyncOperation[];
  /** Nombre, SKU y unidad de cada operación, para mostrarla en la lista de pendientes. */
  labels: Record<string, { name: string; sku: string; unit: string }>;
  /** Foto guardada en el teléfono que debe subirse antes de enviar la operación: la de un producto nuevo o la de respaldo de una salida. */
  photos: Record<string, string>;
}

/**
 * Convierte el borrador (ya validado) en las operaciones que se envían. La clave
 * de cada operación es el id de su línea: si la persona envía y algo falla a
 * medias, volver a enviar la misma línea nunca duplica.
 */
export function toOperations(draft: Draft): BuiltOperations {
  const def = MODE_DEFINITIONS[draft.mode];
  const ops: SyncOperation[] = [];
  const photos: Record<string, string> = {};
  const labels: BuiltOperations['labels'] = {};
  const reference = def.asksReference ? draft.reference.trim().slice(0, 60) : '';
  const draftNote = draft.note.trim();
  const supplierId = def.supplier !== 'none' ? draft.supplierId : '';

  for (const line of draft.lines) {
    const { source } = line;
    const unitCost = isInboundMode(draft.mode) ? parseMoney(line.unitCost) : undefined;
    const note = [draftNote, line.note.trim()].filter(Boolean).join(' · ').slice(0, MAX_NOTE_LENGTH);
    const capturedAt = new Date(line.createdAt).toISOString();
    const common = {
      clientOpId: line.id,
      warehouseId: draft.warehouseId,
      quantity: line.quantity,
      ...(unitCost !== undefined ? { unitCost } : {}),
      ...(reference ? { reference } : {}),
      ...(note ? { note } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(line.lotNumber.trim() ? { lotNumber: line.lotNumber.trim() } : {}),
      ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      capturedAt,
    };

    if (source.kind === 'product') {
      ops.push({
        kind: 'MOVE',
        mode: draft.mode,
        productId: source.product.id,
        ...common,
        ...(isTransferMode(draft.mode) ? { targetWarehouseId: draft.targetWarehouseId } : {}),
        ...(def.asksReason && draft.reason ? { reason: draft.reason } : {}),
      });
      // La foto de respaldo se sube antes de enviar y su dirección se agrega a la operación.
      const evidence = def.requiresEvidence ? evidencePhotoOf(line) : null;
      if (evidence) photos[line.id] = evidence;
    } else if (source.kind === 'new' && (draft.mode === 'RECEIVE' || draft.mode === 'SURPLUS')) {
      const cost = parseMoney(source.form.unitCost);
      ops.push({
        kind: 'CREATE_PRODUCT',
        mode: draft.mode,
        product: newProductInput(source.form),
        ...common,
        ...(cost !== undefined ? { unitCost: cost } : {}),
      });
      if (source.photoId) photos[line.id] = source.photoId;
    }
    if (source.kind === 'product') labels[line.id] = { name: source.product.name, sku: source.product.sku, unit: source.product.unit };
    else if (source.kind === 'new') labels[line.id] = { name: source.form.name.trim(), sku: source.form.sku.trim(), unit: source.form.unit || 'UN' };
  }
  return { ops, labels, photos };
}
