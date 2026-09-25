import { Prisma } from '@prisma/client';
import { captureException } from '@/lib/observability';

/**
 * Extracción de la constraint violada en un error P2002.
 *
 * En Prisma 7 con driver adapters (`@prisma/adapter-pg`) el campo `meta.target`
 * de las versiones anteriores YA NO SE RELLENA. La información viaja en:
 *
 *   meta.driverAdapterError.cause.constraint = { fields: ['"cashRegisterId"'] }
 *   meta.driverAdapterError.cause.originalMessage = 'duplicate key ... "Indice"'
 *
 * Cualquier `error.meta?.target` escrito contra la API antigua compila sin
 * quejarse y se evalúa siempre a `undefined`: el código de manejo queda muerto
 * y el usuario recibe el error crudo de Postgres. Este helper cubre ambas
 * formas para no depender de cuál esté activa.
 */

interface DriverAdapterCause {
  originalMessage?: string;
  constraint?: { fields?: string[]; index?: string };
}

interface P2002Meta {
  target?: string[] | string;
  driverAdapterError?: { cause?: DriverAdapterCause };
}

export interface UniqueConstraintInfo {
  /** Columnas involucradas, sin comillas. */
  fields: string[];
  /** Nombre del índice, cuando el driver lo informa. */
  index?: string;
  /** Mensaje original de Postgres, útil para diagnosticar. */
  originalMessage?: string;
}

export function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function getUniqueConstraintInfo(error: unknown): UniqueConstraintInfo | null {
  if (!isUniqueConstraintError(error)) return null;

  const meta = (error.meta ?? {}) as P2002Meta;
  const cause = meta.driverAdapterError?.cause;

  const rawFields = cause?.constraint?.fields ?? (Array.isArray(meta.target) ? meta.target : meta.target ? [meta.target] : []);
  const fields = rawFields.map((field) => field.replace(/"/g, '').trim()).filter(Boolean);

  // El nombre del índice solo aparece en el mensaje de Postgres:
  // «duplicate key value violates unique constraint "CashShift_one_open_per_register"»
  const index =
    cause?.constraint?.index ??
    cause?.originalMessage?.match(/unique constraint "([^"]+)"/)?.[1];

  return { fields, index, originalMessage: cause?.originalMessage };
}

/** `true` si la constraint violada involucra alguna de las columnas indicadas. */
export function constraintInvolves(error: unknown, ...columns: string[]): boolean {
  const info = getUniqueConstraintInfo(error);
  if (!info) return false;
  return columns.some(
    (column) => info.fields.includes(column) || (info.index?.includes(column) ?? false)
  );
}

/** Nombres de columna → etiqueta en español, para el mensaje genérico de constraint única. */
const FIELD_LABELS: Record<string, string> = {
  rutClean: 'RUT',
  rut: 'RUT',
  email: 'correo electrónico',
  sku: 'SKU',
  folio: 'folio',
  dteType: 'tipo de documento',
  name: 'nombre',
  code: 'código',
  tokenHash: 'token',
  barcode: 'código de barras',
  lotNumber: 'número de lote',
};

function humanizeField(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // camelCase -> "campo con espacios", best-effort para columnas sin mapeo explícito.
  return field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Traduce cualquier error a un mensaje seguro para mostrar al usuario final.
 * Nunca deja pasar el texto crudo del driver de base de datos (nombres de
 * columna entre comillas, mensajes en inglés de Postgres, código de Prisma)
 * — eso debe llegar a los logs del servidor, nunca a la pantalla.
 *
 * Un `Error` "normal" (no de Prisma) SÍ se muestra tal cual: es la convención
 * ya establecida en todo el proyecto — cada service lanza
 * `new Error('mensaje en español pensado para el usuario')` a propósito (ej.
 * "Cliente no encontrado", "Ya existe una empresa registrada con ese RUT").
 * Este helper solo intercepta lo que el DRIVER de la base de datos genera,
 * nunca lo que el propio código del proyecto ya redactó para mostrarse.
 *
 * Reemplaza el fallback `if (error instanceof Error) return error.message;`
 * que hasta ahora tenían ~19 archivos de Server Actions: ese fallback dejaba
 * pasar sin traducir cualquier error de Prisma que no tuviera ya un `if`
 * específico antes (P2003 de llave foránea, P2025 de registro no encontrado,
 * etc.), exponiendo el mensaje crudo del driver.
 */
export function toFriendlyErrorMessage(error: unknown): string {
  if (isUniqueConstraintError(error)) {
    const info = getUniqueConstraintInfo(error);
    const fields = info?.fields.filter((field) => field !== 'companyId') ?? [];
    if (fields.length > 0) {
      return `Ya existe un registro con ese ${fields.map(humanizeField).join(', ')}`;
    }
    return 'Ya existe un registro con esos datos';
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') return 'No se puede completar la acción: hay otros registros que dependen de este dato';
    if (error.code === 'P2025') return 'El registro no existe o ya fue eliminado';
    if (error.code === 'P2028') return 'La operación tardó demasiado. Intenta de nuevo';
    captureException(error, { module: 'prisma', extra: { code: error.code, reason: 'untranslated-known-request-error' } });
    return 'Ocurrió un error al guardar los datos. Intenta de nuevo';
  }

  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    captureException(error, { module: 'prisma', extra: { reason: 'untranslated-prisma-error' } });
    return 'Ocurrió un error inesperado. Si el problema persiste, contacta a soporte';
  }

  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
}
