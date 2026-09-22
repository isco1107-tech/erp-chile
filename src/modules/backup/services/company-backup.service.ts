import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/observability';

/**
 * Exportación completa de los datos de UNA empresa.
 *
 * Para qué sirve: portabilidad (un cliente que se va tiene derecho a llevarse
 * lo suyo), archivo histórico (la ley chilena obliga a conservar respaldo
 * tributario por 6 años) y respaldo previo a una operación destructiva. Neon
 * tiene point-in-time recovery de la base COMPLETA, que sirve para "se cayó
 * todo" pero no para "esta empresa borró algo por error": restaurar toda la
 * base para recuperar un tenant afectaría a los demás.
 *
 * Qué NO es: una herramienta de restauración. Reimportar este archivo exigiría
 * resolver el orden de claves foráneas y las colisiones de id, y eso es un
 * proyecto aparte. Acá el objetivo es que el dato SALGA íntegro y legible.
 *
 * Por qué se recorre el DMMF en vez de listar las 70 tablas a mano: la lista
 * escrita a mano se desactualiza en el primer modelo nuevo que alguien agregue,
 * y un respaldo incompleto es peor que no tenerlo porque nadie lo nota hasta
 * que lo necesita. Recorriendo el modelo de datos, toda tabla con `companyId`
 * entra automáticamente.
 */

/** Versión del formato del archivo, para que un lector futuro sepa qué esperar. */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Tablas excluidas a propósito. No son datos del negocio: son estado interno
 * o credenciales, y exportarlas es riesgo sin beneficio.
 */
const EXCLUDED_MODELS = new Set([
  // Sesiones vivas: sin valor histórico y contienen material de sesión.
  'UserSession',
  // Códigos de respaldo de 2FA: son credenciales.
  'TotpBackupCode',
  // Deduplicación interna de webhooks: ruido de infraestructura.
  'ProcessedWebhookEvent',
  // Auditoría del panel de plataforma: es del operador del SaaS, no del tenant.
  'PlatformAuditLog',
  // Contiene `encryptedXml`: el CAF cifrado, con la llave privada RSA que
  // timbra los DTE de la empresa. El nombre del campo no matchea
  // SENSITIVE_FIELD_PATTERN (no dice "secret"/"token"/etc.), así que sin esta
  // exclusión explícita salía íntegro en el respaldo — quien lo descargue no
  // debe llevarse material que permite forjar documentos tributarios a nombre
  // de la empresa si alguna vez se compromete DTE_ENCRYPTION_KEY.
  'DteCaf',
]);

/**
 * Campos que nunca salen, por nombre. Se filtra por patrón y no por lista
 * exacta para que un modelo nuevo con `algoSecret` quede cubierto sin que
 * nadie tenga que acordarse de agregarlo acá.
 *
 * `api[_-]?key` es un patrón aparte (no un simple `key`): `AccountMapping.key`
 * es dato de negocio real (mapeo de plan de cuentas) que sí debe salir en el
 * respaldo, así que un `key` suelto sería demasiado ancho. `siiApiKey` fue el
 * caso real que expuso el hueco — matchea "secret" pero no "key".
 */
const SENSITIVE_FIELD_PATTERN = /password|secret|token|hash|salt|credential|privatekey|api[_-]?key/i;

/** Acceso dinámico al delegate de Prisma, tipado sin recurrir a `any`. */
interface FindManyDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    take?: number;
    skip?: number;
  }): Promise<Record<string, unknown>[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

/** `SalesDocument` (DMMF) -> `salesDocument` (delegate del cliente). */
function delegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function getDelegate(modelName: string): FindManyDelegate | null {
  const client = prisma as unknown as Record<string, FindManyDelegate | undefined>;
  return client[delegateName(modelName)] ?? null;
}

export interface ExportableModel {
  name: string;
  /** Campos escalares que sí se exportan, ya filtrados. */
  fields: string[];
}

/**
 * Modelos exportables: los que tienen `companyId`, sin los excluidos, con sus
 * campos escalares (se omiten las relaciones: cada fila relacionada ya viaja
 * en su propia tabla, incluirlas anidadas duplicaría el archivo).
 */
export function listExportableModels(): ExportableModel[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => !EXCLUDED_MODELS.has(model.name))
    .filter((model) => model.fields.some((field) => field.name === 'companyId'))
    .map((model) => ({
      name: model.name,
      fields: model.fields
        .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
        .filter((field) => !SENSITIVE_FIELD_PATTERN.test(field.name))
        .map((field) => field.name),
    }))
    .filter((model) => model.fields.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Filas por consulta. Acota la memoria del proceso en tenants grandes. */
const PAGE_SIZE = 500;

/**
 * Lee una tabla completa en páginas, filtrando SIEMPRE por `companyId`.
 *
 * Ordena por `id` para que el paginado sea estable: sin un orden determinista,
 * dos páginas consecutivas pueden repetir u omitir filas si algo se escribe
 * durante la exportación.
 */
async function* readModelRows(
  model: ExportableModel,
  companyId: string
): AsyncGenerator<Record<string, unknown>[]> {
  const delegate = getDelegate(model.name);
  if (!delegate) {
    logger.warn('Modelo sin delegate en el cliente de Prisma, se omite del respaldo', {
      module: 'backup',
      companyId,
      model: model.name,
    });
    return;
  }

  const select = Object.fromEntries(model.fields.map((field) => [field, true]));
  let skip = 0;

  for (;;) {
    const rows = await delegate.findMany({
      where: { companyId },
      select,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      skip,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE_SIZE) return;
    skip += rows.length;
  }
}

/** `Date` y `Decimal` no sobreviven a `JSON.stringify` con su tipo; se normalizan. */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      output[key] = value.toISOString();
    } else if (typeof value === 'bigint') {
      output[key] = value.toString();
    } else if (
      value !== null &&
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as { toNumber: unknown }).toNumber === 'function'
    ) {
      // Prisma.Decimal
      output[key] = (value as { toNumber: () => number }).toNumber();
    } else {
      output[key] = value;
    }
  }
  return output;
}

export interface BackupCompanyProfile {
  id: string;
  businessName: string;
  rut: string;
}

async function readCompanyProfile(companyId: string): Promise<BackupCompanyProfile> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, businessName: true, rut: true },
  });
  if (!company) throw new Error('La empresa no existe');
  return company;
}

/**
 * Genera el archivo de respaldo como un flujo de fragmentos de texto JSON.
 *
 * Se emite en streaming y no como un objeto completo en memoria a propósito:
 * un tenant con años de kardex y mensajería puede pesar cientos de MB, y
 * armarlo entero antes de responder es la forma más rápida de agotar la
 * memoria de una función serverless. Así, el archivo se va escribiendo a la
 * respuesta mientras se lee la base.
 */
export async function* streamCompanyBackup(companyId: string): AsyncGenerator<string> {
  const startedAt = Date.now();
  const profile = await readCompanyProfile(companyId);
  const models = listExportableModels();

  logger.info('Inicio de exportación de empresa', {
    module: 'backup',
    companyId,
    models: models.length,
  });

  yield `{\n"formatVersion":${BACKUP_FORMAT_VERSION},`;
  yield `\n"generatedAt":${JSON.stringify(new Date().toISOString())},`;
  yield `\n"company":${JSON.stringify(profile)},`;
  yield `\n"data":{`;

  const counts: Record<string, number> = {};
  let firstModel = true;

  for (const model of models) {
    if (!firstModel) yield ',';
    firstModel = false;
    yield `\n${JSON.stringify(model.name)}:[`;

    let rowCount = 0;
    for await (const page of readModelRows(model, companyId)) {
      for (const row of page) {
        yield `${rowCount > 0 ? ',' : ''}\n${JSON.stringify(serializeRow(row))}`;
        rowCount += 1;
      }
    }
    counts[model.name] = rowCount;
    yield '\n]';
  }

  yield '\n},';
  yield `\n"counts":${JSON.stringify(counts)}`;
  yield '\n}\n';

  logger.info('Exportación de empresa completada', {
    module: 'backup',
    companyId,
    totalRows: Object.values(counts).reduce((sum, n) => sum + n, 0),
    durationMs: Date.now() - startedAt,
  });
}

/** Nombre de archivo estable y ordenable: `respaldo-<rut>-<fecha>.json`. */
export function backupFileName(profile: BackupCompanyProfile, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const slug = profile.rut.replace(/[^0-9kK]/g, '') || profile.id;
  return `respaldo-${slug}-${date}.json`;
}

export interface BackupSummary {
  models: number;
  rows: number;
  perModel: Record<string, number>;
}

/** Resumen sin exportar nada: qué tablas entran y cuántas filas tiene cada una. */
export async function summarizeCompanyBackup(companyId: string): Promise<BackupSummary> {
  const models = listExportableModels();
  const perModel: Record<string, number> = {};
  let rows = 0;

  for (const model of models) {
    const delegate = getDelegate(model.name);
    if (!delegate) continue;
    const count = await delegate.count({ where: { companyId } });
    if (count > 0) perModel[model.name] = count;
    rows += count;
  }

  return { models: Object.keys(perModel).length, rows, perModel };
}
