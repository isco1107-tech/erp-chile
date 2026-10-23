import type { MobileMode } from '@/lib/warehouse-mobile/modes';

/**
 * Formas de lo que el servidor le responde a la app del bodeguero. Solo tipos:
 * el celular los importa sin arrastrar nada de servidor.
 */

/** Producto del catálogo tal como lo necesita el celular. Nunca lleva costos ni precios. */
export interface MobileProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  unit: string;
  barcode: string | null;
  imageUrl: string | null;
  tracksLots: boolean;
  isActive: boolean;
  /** Existencias en la bodega pedida (o en todas si no se pidió una). */
  stock: number;
  /** Existencias en todas las bodegas. */
  totalStock: number;
}

/** Cómo se llegó al producto: de más a menos seguro. */
export type MatchReason = 'barcode' | 'packaging' | 'sku' | 'text';

export interface MobileCandidate extends MobileProduct {
  reason: MatchReason;
  /** 0–1. Un código exacto vale 1; un texto leído por IA, menos. */
  score: number;
  /** Unidades que representa el código leído (1 = unidad; 12 = caja de 12). */
  factor: number;
  packagingName: string | null;
}

/** Lo que la IA leyó de la foto, ya limpio. Es una sugerencia, nunca un dato confirmado. */
export interface VisionRead {
  name: string | null;
  brand: string | null;
  variant: string | null;
  /** Contenido neto tal como está impreso ("900 ml"). */
  netContent: string | null;
  unit: string;
  /** Código de producto impreso en la etiqueta (SKU, Cód., Art., Ref.), distinto del código de barras. */
  sku: string | null;
  barcode: string | null;
  description: string | null;
  categoryHint: string | null;
  lotNumber: string | null;
  /** AAAA-MM-DD, solo si estaba impresa con claridad. */
  expiryDate: string | null;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

export type IdentifyStatus =
  /** Hay un producto claro; el bodeguero solo confirma. */
  | 'matched'
  /** Hay varios posibles: que elija uno o diga que ninguno. */
  | 'candidates'
  /** No está en el catálogo: se ofrece crearlo con lo leído. */
  | 'new'
  /** La foto no mostró un producto legible. */
  | 'unreadable'
  /** La IA está al tope por ahora: la app reintenta sola más tarde. */
  | 'busy'
  /** La IA no está disponible (no configurada o apagada): se sigue a mano. */
  | 'unavailable'
  /**
   * La IA falló por algo que no es saturación (respuesta inválida, error del proveedor).
   * A diferencia de `busy`, el teléfono lo cuenta como un intento fallido: tras varios,
   * entrega la foto a la persona en vez de reintentar para siempre y gastar cuota.
   */
  | 'error';

export interface IdentifyResponse {
  status: IdentifyStatus;
  candidates: MobileCandidate[];
  read: VisionRead | null;
  /** La respuesta salió de una lectura anterior de la misma foto (no gastó IA). */
  cached: boolean;
  /** Para `busy`: cuánto esperar antes de reintentar. */
  retryAfterMs?: number;
  message?: string;
}

export interface LookupResponse {
  match: MobileCandidate | null;
  /** Búsqueda por texto: hasta 20 productos. */
  results: MobileProduct[];
}

/** Proveedor de quien puede llegar mercadería (contacto marcado como proveedor). */
export interface MobileSupplier {
  id: string;
  /** Nombre de fantasía si lo tiene; si no, la razón social. */
  name: string;
  rut: string;
}

export interface BootstrapResponse {
  user: { id: string; name: string; roleLabel: string };
  company: { id: string; name: string };
  warehouses: Array<{ id: string; name: string; code: string; isDefault: boolean }>;
  categories: Array<{ id: string; name: string }>;
  suppliers: MobileSupplier[];
  units: string[];
  can: {
    move: boolean;
    createProduct: boolean;
    seeCosts: boolean;
  };
  ai: { enabled: boolean };
  /** Para que el celular no tenga que adivinar qué acepta el servidor. */
  limits: { maxOpsPerBatch: number; maxPhotoBytes: number };
}

export type OpRejectCode =
  | 'INVALID'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INSUFFICIENT_STOCK'
  | 'DUPLICATE_PRODUCT'
  | 'SKU_TAKEN'
  | 'ARCHIVED_PRODUCT'
  | 'OTHER';

export interface AppliedOpResult {
  clientOpId: string;
  status: 'APPLIED';
  kind: 'MOVE' | 'CREATE_PRODUCT';
  mode: MobileMode;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  warehouseId: string;
  /** Existencias de ese producto en la bodega después del movimiento. */
  newStock: number;
  createdProduct: boolean;
  /** Se pidió crear un producto pero ya existía (mismo código de barras): se sumó al existente. */
  mergedIntoExisting: boolean;
  /** Es la respuesta guardada de un envío anterior (el reintento no movió nada). */
  replayed: boolean;
}

export interface RejectedOpResult {
  clientOpId: string;
  status: 'REJECTED';
  code: OpRejectCode;
  message: string;
  /** Para DUPLICATE_PRODUCT / SKU_TAKEN: el producto que ya existe. */
  existing?: MobileProduct;
}

/** Falla pasajera (base de datos ocupada): la app reintenta con la misma clave. */
export interface RetryOpResult {
  clientOpId: string;
  status: 'RETRY';
  message: string;
}

export type OpResult = AppliedOpResult | RejectedOpResult | RetryOpResult;

export interface SyncResponse {
  results: OpResult[];
}

/** Una fila del historial reciente de quien está usando la app. */
export interface RecentOp {
  clientOpId: string;
  mode: MobileMode;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  createdAt: string;
}

export interface ApiError {
  success: false;
  error: string;
}

export interface ApiOk<T> {
  success: true;
  data: T;
}

export type ApiResult<T> = ApiOk<T> | ApiError;
