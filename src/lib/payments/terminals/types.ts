import type { z } from 'zod';

/**
 * Marco intercambiable de terminales de pago (máquinas de tarjeta conectadas).
 *
 * Todo en `src/lib/payments/terminals/` es PURO: sin Prisma, sin `server-only`
 * y sin I/O propio salvo lo que cada adaptador declare (`createCharge` /
 * `fetchCharge`). Persistir la configuración, reclamar el `eventId` en
 * `claimWebhookEvent` y aplicar el pago en una transacción es trabajo del
 * servicio que consuma este marco; acá solo se decide.
 *
 * Regla del repo (igual que Khipu): el aviso de un proveedor NUNCA basta para
 * marcar algo pagado. `parseWebhook` solo normaliza y autentica el aviso;
 * `reconcileTerminalPayment` (reconcile.ts) decide, y para dinero real el
 * llamador debería confirmar con `fetchCharge` cuando el proveedor lo soporte.
 */

/** Lo que un proveedor sabe hacer. Un proveedor puede declarar varias. */
export type TerminalCapability = 'push-to-terminal' | 'webhook' | 'polling' | 'manual';

export type TerminalPaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';
export type TerminalPaymentMethod = 'DEBIT' | 'CREDIT' | 'OTHER';

/**
 * Pago normalizado: la ÚNICA forma en que el resto del ERP ve un pago hecho
 * en una máquina, sin importar el proveedor.
 */
export interface TerminalPayment {
  providerId: string;
  /** Id del pago/transacción en el proveedor. Con `providerId` es la clave de idempotencia. */
  externalId: string;
  /** CLP entero, siempre positivo. */
  amountClp: number;
  currency: 'CLP';
  status: TerminalPaymentStatus;
  method: TerminalPaymentMethod;
  /** Solo los últimos 4 dígitos: nunca se guarda ni se acepta el PAN completo. */
  last4?: string;
  authCode?: string;
  /** Referencia propia del ERP (id de orden/venta) si el proveedor la devuelve. */
  reference?: string;
  occurredAt: Date;
  /** Respuesta original saneada (sin secretos ni datos de tarjeta), solo para auditoría. */
  raw: Record<string, unknown>;
}

/** Cabeceras HTTP tal como las entrega Next (`Headers`) o un objeto plano. */
export type HeaderBag = Headers | Record<string, string | string[] | undefined>;

export interface CreateChargeInput {
  amountClp: number;
  /** Id propio de la orden/venta: vuelve en `TerminalPayment.reference` cuando el proveedor lo permite. */
  reference: string;
  description?: string;
  /** Terminal físico destino cuando el proveedor soporta empujar el cobro. */
  terminalId?: string;
}

export interface CreateChargeResult {
  /** Null cuando el cobro no existe aún en el proveedor (manual, webhook libre). */
  externalId: string | null;
  status: TerminalPaymentStatus;
  /** Texto para el cajero (p. ej. "Cobre $5.000 en la máquina y confirme"). */
  instructions?: string;
}

export type WebhookRejectReason =
  /** Firma/token ausente o inválido: se responde 401 y no se mira el cuerpo. */
  | 'INVALID_SIGNATURE'
  /** Firma válida pero fuera de la ventana de tiempo: repetición (replay) de un aviso viejo. */
  | 'STALE_TIMESTAMP'
  /** Autenticado, pero el cuerpo no tiene la forma configurada (JSON-path mal puesto, estado sin mapear…). */
  | 'MALFORMED_PAYLOAD'
  /** El proveedor no recibe avisos (p. ej. manual). */
  | 'UNSUPPORTED'
  /** Falta el secreto en la configuración: se rechaza todo, nunca se acepta sin firma. */
  | 'MISSING_SECRET';

export type WebhookParseResult =
  | {
      ok: true;
      /** Id del evento para `claimWebhookEvent` (por defecto `externalId:status`). */
      eventId: string;
      payment: TerminalPayment;
    }
  | { ok: false; reason: WebhookRejectReason; message: string };

export interface ParseWebhookInput {
  /** Cuerpo CRUDO tal como llegó: la firma se calcula sobre estos bytes, no sobre JSON re-serializado. */
  rawBody: string;
  headers: HeaderBag;
  /** Secreto de verificación ya descifrado (null si la empresa no lo configuró). */
  secret: string | null;
  /** Configuración del proveedor (se valida con su esquema). */
  config: Record<string, unknown>;
  /** Reloj inyectable para probar la ventana anti-replay. */
  now?: Date;
}

export type ProviderStatus = 'available' | 'pending-adapter';

export type ConfigFieldKind = 'text' | 'secret' | 'number' | 'select' | 'textarea';

/** Descriptor de un campo de configuración, para generar la pantalla sin escribirla por proveedor. */
export interface ConfigFieldDescriptor {
  key: string;
  label: string;
  kind: ConfigFieldKind;
  required: boolean;
  help?: string;
  placeholder?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | number;
  group?: string;
}

export interface PaymentTerminalProvider {
  id: string;
  label: string;
  description: string;
  capabilities: readonly TerminalCapability[];
  /** `pending-adapter`: implementa la interfaz pero lanza `AdapterPendingError`. */
  status: ProviderStatus;
  /** Esquema Zod de la configuración por empresa (incluye los secretos). */
  configSchema: z.ZodType<Record<string, unknown>>;
  /** Un descriptor por clave del esquema; los `kind: 'secret'` se guardan cifrados. */
  fields: readonly ConfigFieldDescriptor[];
  /** Nombre del campo secreto que firma los avisos entrantes, si el proveedor usa webhook. */
  webhookSecretField?: string;

  /** Valida y tipa la configuración; lanza `ZodError` si no cumple el esquema. */
  parseConfig(input: unknown): Record<string, unknown>;
  createCharge(config: Record<string, unknown>, input: CreateChargeInput): Promise<CreateChargeResult>;
  parseWebhook(input: ParseWebhookInput): WebhookParseResult;
  /** Consulta el cobro directo al proveedor, para reconciliar sin creerle al aviso. Null si no existe. */
  fetchCharge(config: Record<string, unknown>, externalId: string): Promise<TerminalPayment | null>;
}

/** Operación que el proveedor no ofrece (p. ej. `fetchCharge` en manual). */
export class TerminalOperationUnsupportedError extends Error {
  constructor(
    readonly providerId: string,
    readonly operation: string
  ) {
    super(`El proveedor "${providerId}" no soporta la operación ${operation}`);
    this.name = 'TerminalOperationUnsupportedError';
  }
}

/** Esqueleto de proveedor aún sin implementar. */
export class AdapterPendingError extends Error {
  constructor(readonly providerId: string) {
    super('adaptador pendiente: requiere credenciales y documentación del proveedor');
    this.name = 'AdapterPendingError';
  }
}

export class UnknownTerminalProviderError extends Error {
  constructor(readonly providerId: string) {
    super(`Proveedor de terminal de pago desconocido: "${providerId}"`);
    this.name = 'UnknownTerminalProviderError';
  }
}
