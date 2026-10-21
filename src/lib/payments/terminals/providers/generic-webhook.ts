import { z } from 'zod';
import { defineProvider } from '../define';
import { isValidJsonPath, readJsonPath } from '../json-path';
import { assertValidAmountClp, sanitizeRaw, toLast4 } from '../sanitize';
import { getHeader, hmacSha256, parseTimestamp, timingSafeEqualStrings } from '../signature';
import {
  TerminalOperationUnsupportedError,
  type ConfigFieldDescriptor,
  type ParseWebhookInput,
  type TerminalPaymentMethod,
  type TerminalPaymentStatus,
  type WebhookParseResult,
} from '../types';

export const GENERIC_WEBHOOK_PROVIDER_ID = 'generic-webhook';

const MAX_BODY_BYTES = 256 * 1024;

const headerName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]+$/, 'Nombre de cabecera inválido');

const requiredPath = z
  .string()
  .trim()
  .refine(isValidJsonPath, 'Ruta JSON inválida (ej: data.amount o items[0].id)');

const optionalPath = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || isValidJsonPath(value), 'Ruta JSON inválida (ej: data.amount o items[0].id)');

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalHeaderName = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || /^[A-Za-z0-9-]+$/.test(value), 'Nombre de cabecera inválido');

export const genericWebhookConfigSchema = z.object({
  webhookSecret: z.string().min(16, 'El secreto debe tener al menos 16 caracteres'),
  authMode: z.enum(['hmac-sha256', 'static-token']).default('hmac-sha256'),
  signatureHeader: headerName.default('x-signature'),
  signatureEncoding: z.enum(['hex', 'base64']).default('hex'),
  signaturePrefix: optionalText,
  timestampHeader: optionalHeaderName,
  toleranceSeconds: z.coerce.number().int().min(30).max(3600).default(300),

  idPath: requiredPath,
  amountPath: requiredPath,
  statusPath: requiredPath,
  amountDivisor: z.coerce.number().int().min(1).max(1_000_000).default(1),
  currencyPath: optionalPath,
  methodPath: optionalPath,
  last4Path: optionalPath,
  authCodePath: optionalPath,
  referencePath: optionalPath,
  occurredAtPath: optionalPath,

  approvedValues: z.string().default('approved,paid,success,aprobado,pagado'),
  rejectedValues: z.string().default('rejected,declined,failed,rechazado'),
  cancelledValues: z.string().default('cancelled,canceled,voided,anulado'),
  refundedValues: z.string().default('refunded,reversed,devuelto'),
  pendingValues: z.string().default('pending,processing,in_process,pendiente'),
  debitValues: z.string().default('debit,debito,débito,redcompra'),
  creditValues: z.string().default('credit,credito,crédito'),
});

export type GenericWebhookConfig = z.output<typeof genericWebhookConfigSchema>;

const fields: ConfigFieldDescriptor[] = [
  { key: 'webhookSecret', label: 'Secreto del webhook', kind: 'secret', required: true, group: 'Seguridad', help: 'Mínimo 16 caracteres. Se guarda cifrado y no vuelve a mostrarse.' },
  {
    key: 'authMode',
    label: 'Cómo se autentica el aviso',
    kind: 'select',
    required: true,
    group: 'Seguridad',
    defaultValue: 'hmac-sha256',
    options: [
      { value: 'hmac-sha256', label: 'Firma HMAC-SHA256 (recomendado)' },
      { value: 'static-token', label: 'Token fijo en una cabecera (para Zapier/n8n sin código)' },
    ],
    help: 'El token fijo no protege contra la repetición de un aviso interceptado; el ERP igual no aplica dos veces el mismo pago.',
  },
  { key: 'signatureHeader', label: 'Cabecera de la firma o token', kind: 'text', required: true, group: 'Seguridad', defaultValue: 'x-signature' },
  {
    key: 'signatureEncoding',
    label: 'Formato de la firma',
    kind: 'select',
    required: true,
    group: 'Seguridad',
    defaultValue: 'hex',
    options: [
      { value: 'hex', label: 'Hexadecimal' },
      { value: 'base64', label: 'Base64' },
    ],
  },
  { key: 'signaturePrefix', label: 'Prefijo de la firma', kind: 'text', required: false, group: 'Seguridad', placeholder: 'sha256=', help: 'Solo si el emisor antepone un texto fijo a la firma.' },
  {
    key: 'timestampHeader',
    label: 'Cabecera de fecha firmada',
    kind: 'text',
    required: false,
    group: 'Seguridad',
    placeholder: 'x-timestamp',
    help: 'Si se indica, la firma se calcula sobre "fecha.cuerpo" y se rechazan avisos fuera de la ventana (protección contra repetición).',
  },
  { key: 'toleranceSeconds', label: 'Ventana de tolerancia (segundos)', kind: 'number', required: false, group: 'Seguridad', defaultValue: 300 },

  { key: 'idPath', label: 'Ruta del id del pago', kind: 'text', required: true, group: 'Campos del aviso', placeholder: 'data.id' },
  { key: 'amountPath', label: 'Ruta del monto', kind: 'text', required: true, group: 'Campos del aviso', placeholder: 'data.amount' },
  { key: 'statusPath', label: 'Ruta del estado', kind: 'text', required: true, group: 'Campos del aviso', placeholder: 'data.status' },
  { key: 'amountDivisor', label: 'Divisor del monto', kind: 'number', required: false, group: 'Campos del aviso', defaultValue: 1, help: 'Use 100 si el emisor manda centavos. El resultado debe ser un CLP entero.' },
  { key: 'currencyPath', label: 'Ruta de la moneda', kind: 'text', required: false, group: 'Campos del aviso', help: 'Si se indica, solo se acepta CLP.' },
  { key: 'methodPath', label: 'Ruta del medio de pago', kind: 'text', required: false, group: 'Campos del aviso' },
  { key: 'last4Path', label: 'Ruta de los últimos 4 dígitos', kind: 'text', required: false, group: 'Campos del aviso' },
  { key: 'authCodePath', label: 'Ruta del código de autorización', kind: 'text', required: false, group: 'Campos del aviso' },
  { key: 'referencePath', label: 'Ruta de la referencia de la orden', kind: 'text', required: false, group: 'Campos del aviso' },
  { key: 'occurredAtPath', label: 'Ruta de la fecha del pago', kind: 'text', required: false, group: 'Campos del aviso' },

  { key: 'approvedValues', label: 'Valores de estado "aprobado"', kind: 'text', required: true, group: 'Estados', defaultValue: 'approved,paid,success,aprobado,pagado', help: 'Separados por coma; no distingue mayúsculas.' },
  { key: 'rejectedValues', label: 'Valores "rechazado"', kind: 'text', required: false, group: 'Estados', defaultValue: 'rejected,declined,failed,rechazado' },
  { key: 'cancelledValues', label: 'Valores "anulado"', kind: 'text', required: false, group: 'Estados', defaultValue: 'cancelled,canceled,voided,anulado' },
  { key: 'refundedValues', label: 'Valores "devuelto"', kind: 'text', required: false, group: 'Estados', defaultValue: 'refunded,reversed,devuelto' },
  { key: 'pendingValues', label: 'Valores "pendiente"', kind: 'text', required: false, group: 'Estados', defaultValue: 'pending,processing,in_process,pendiente' },
  { key: 'debitValues', label: 'Valores de "débito"', kind: 'text', required: false, group: 'Estados', defaultValue: 'debit,debito,débito,redcompra' },
  { key: 'creditValues', label: 'Valores de "crédito"', kind: 'text', required: false, group: 'Estados', defaultValue: 'credit,credito,crédito' },
];

function toSet(csv: string): Set<string> {
  return new Set(
    csv
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function scalarToString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

function reject(reason: 'INVALID_SIGNATURE' | 'STALE_TIMESTAMP' | 'MALFORMED_PAYLOAD' | 'MISSING_SECRET', message: string): WebhookParseResult {
  return { ok: false, reason, message };
}

function verifyAuthentication(input: ParseWebhookInput, config: GenericWebhookConfig, secret: string, now: Date): WebhookParseResult | null {
  const received = getHeader(input.headers, config.signatureHeader);
  if (!received) return reject('INVALID_SIGNATURE', `Falta la cabecera ${config.signatureHeader}`);

  if (config.authMode === 'static-token') {
    return timingSafeEqualStrings(received, secret) ? null : reject('INVALID_SIGNATURE', 'Token inválido');
  }

  let signedPayload = input.rawBody;
  let timestamp: Date | null = null;
  if (config.timestampHeader) {
    const rawTimestamp = getHeader(input.headers, config.timestampHeader);
    if (!rawTimestamp) return reject('INVALID_SIGNATURE', `Falta la cabecera ${config.timestampHeader}`);
    timestamp = parseTimestamp(rawTimestamp);
    if (!timestamp) return reject('INVALID_SIGNATURE', 'Fecha firmada ilegible');
    signedPayload = `${rawTimestamp}.${input.rawBody}`;
  }

  let expected = `${config.signaturePrefix ?? ''}${hmacSha256(secret, signedPayload, config.signatureEncoding)}`;
  let candidate = received;
  if (config.signatureEncoding === 'hex') {
    expected = expected.toLowerCase();
    candidate = candidate.toLowerCase();
  }
  // La firma se valida ANTES que la ventana: así "fecha vencida" solo se
  // informa para avisos auténticos, y un atacante no aprende nada del reloj.
  if (!timingSafeEqualStrings(candidate, expected)) return reject('INVALID_SIGNATURE', 'Firma inválida');

  if (timestamp && Math.abs(now.getTime() - timestamp.getTime()) > config.toleranceSeconds * 1000) {
    return reject('STALE_TIMESTAMP', 'El aviso está fuera de la ventana de tiempo permitida');
  }
  return null;
}

function parseWebhook(input: ParseWebhookInput & { config: GenericWebhookConfig }): WebhookParseResult {
  const { config, secret } = input;
  const now = input.now ?? new Date();

  if (!secret) return reject('MISSING_SECRET', 'La empresa no configuró el secreto del webhook');
  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_BODY_BYTES) return reject('MALFORMED_PAYLOAD', 'Cuerpo demasiado grande');

  const authFailure = verifyAuthentication(input, config, secret, now);
  if (authFailure) return authFailure;

  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return reject('MALFORMED_PAYLOAD', 'El cuerpo no es JSON válido');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return reject('MALFORMED_PAYLOAD', 'El cuerpo debe ser un objeto JSON');
  }

  const idRead = readJsonPath(body, config.idPath);
  const externalId = idRead.found ? scalarToString(idRead.value) : null;
  if (!externalId) return reject('MALFORMED_PAYLOAD', `No se encontró el id del pago en "${config.idPath}"`);

  const amountRead = readJsonPath(body, config.amountPath);
  if (!amountRead.found) return reject('MALFORMED_PAYLOAD', `No se encontró el monto en "${config.amountPath}"`);
  const amountText = scalarToString(amountRead.value);
  // Solo dígitos y un punto decimal: nada de "1.000" con separador de miles ni notación científica.
  if (!amountText || !/^\d+(\.\d+)?$/.test(amountText)) {
    return reject('MALFORMED_PAYLOAD', `El monto en "${config.amountPath}" no es un número válido`);
  }
  // "1.000" como TEXTO es ambiguo (¿mil con separador chileno o uno con decimales?): se rechaza en vez de adivinar.
  if (typeof amountRead.value === 'string' && /^\d+\.\d{3}$/.test(amountText)) {
    return reject('MALFORMED_PAYLOAD', `El monto "${amountText}" es ambiguo (¿separador de miles?); envíelo sin puntos`);
  }
  const amountClp = Number(amountText) / config.amountDivisor;
  try {
    assertValidAmountClp(amountClp);
  } catch {
    return reject('MALFORMED_PAYLOAD', 'El monto no es un CLP entero positivo (revise la ruta y el divisor)');
  }

  if (config.currencyPath) {
    const currency = readJsonPath(body, config.currencyPath);
    const currencyText = currency.found ? scalarToString(currency.value) : null;
    if (currencyText?.toUpperCase() !== 'CLP') {
      return reject('MALFORMED_PAYLOAD', `Moneda no soportada o ausente en "${config.currencyPath}"`);
    }
  }

  const statusRead = readJsonPath(body, config.statusPath);
  const statusText = statusRead.found ? scalarToString(statusRead.value)?.toLowerCase() : undefined;
  if (!statusText) return reject('MALFORMED_PAYLOAD', `No se encontró el estado en "${config.statusPath}"`);
  const status = mapStatus(statusText, config);
  if (!status) {
    // Un estado desconocido jamás se interpreta como aprobado ni se ignora en silencio.
    return reject('MALFORMED_PAYLOAD', `El estado "${statusText}" no está asignado a ninguna categoría`);
  }

  let method: TerminalPaymentMethod = 'OTHER';
  if (config.methodPath) {
    const methodRead = readJsonPath(body, config.methodPath);
    const methodText = methodRead.found ? scalarToString(methodRead.value)?.toLowerCase() : undefined;
    if (methodText && toSet(config.debitValues).has(methodText)) method = 'DEBIT';
    else if (methodText && toSet(config.creditValues).has(methodText)) method = 'CREDIT';
  }

  let occurredAt = now;
  if (config.occurredAtPath) {
    const occurredRead = readJsonPath(body, config.occurredAtPath);
    const parsed = occurredRead.found ? parseTimestamp(String(occurredRead.value)) : null;
    if (!parsed) return reject('MALFORMED_PAYLOAD', `La fecha en "${config.occurredAtPath}" no se entiende`);
    occurredAt = parsed;
  }

  const optional = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    const read = readJsonPath(body, path);
    return read.found ? (scalarToString(read.value) ?? undefined) : undefined;
  };

  return {
    ok: true,
    eventId: `${externalId}:${status}`,
    payment: {
      providerId: GENERIC_WEBHOOK_PROVIDER_ID,
      externalId,
      amountClp,
      currency: 'CLP',
      status,
      method,
      last4: config.last4Path ? toLast4(optional(config.last4Path)) : undefined,
      authCode: optional(config.authCodePath),
      reference: optional(config.referencePath),
      occurredAt,
      raw: sanitizeRaw(body),
    },
  };
}

function mapStatus(value: string, config: GenericWebhookConfig): TerminalPaymentStatus | null {
  if (toSet(config.approvedValues).has(value)) return 'APPROVED';
  if (toSet(config.refundedValues).has(value)) return 'REFUNDED';
  if (toSet(config.cancelledValues).has(value)) return 'CANCELLED';
  if (toSet(config.rejectedValues).has(value)) return 'REJECTED';
  if (toSet(config.pendingValues).has(value)) return 'PENDING';
  return null;
}

/**
 * Proveedor configurable: sirve para cualquier máquina, middleware o conector
 * (n8n, Zapier, Make, el backend del integrador) que pueda hacer un POST JSON
 * al ERP. El cliente dice en qué parte del JSON viene el monto, el id y el
 * estado, y con qué secreto se firma. Es solo "recepción": el cobro se inicia
 * en la máquina, y el aviso se reconcilia después.
 */
export const genericWebhookProvider = defineProvider({
  id: GENERIC_WEBHOOK_PROVIDER_ID,
  label: 'Webhook configurable (cualquier máquina o conector)',
  description:
    'La máquina o un conector (n8n, Zapier, Make…) envía el pago como JSON firmado. Usted define qué campo es el monto, el id y el estado.',
  capabilities: ['webhook'],
  configSchema: genericWebhookConfigSchema,
  fields,
  webhookSecretField: 'webhookSecret',

  async createCharge(_config, input) {
    assertValidAmountClp(input.amountClp);
    return {
      externalId: null,
      status: 'PENDING',
      instructions: `Cobre ${input.amountClp} CLP en la máquina; el pago llegará solo al ERP cuando el emisor lo notifique.`,
    };
  },

  parseWebhook,

  async fetchCharge() {
    throw new TerminalOperationUnsupportedError(GENERIC_WEBHOOK_PROVIDER_ID, 'fetchCharge');
  },
});
