import type { DteType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/observability';
import { cafBelongsTo, cafFolioCount, parseCaf, CafParseError, type ParsedCaf } from '@/lib/chile/dte/caf';
import { decryptCafXml, encryptCafXml } from '@/lib/chile/dte/crypto';
import { siiCode } from '@/lib/chile/dte/codes';

type TxClient = Prisma.TransactionClient;

/**
 * Administración de los CAF de una empresa y asignación de folios autorizados.
 *
 * Diferencia central con `FolioSequence` (el contador que existía antes): ese
 * contador inventa números correlativos sin respaldo del SII. Sirve para
 * documentos internos, pero un folio así NO es válido tributariamente. Acá el
 * folio sale de un rango que el SII autorizó previamente, y cuando se acaba,
 * se acaba: no hay "siguiente número", hay que pedir un CAF nuevo.
 */

export class CafError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CafError';
  }
}

export class NoFoliosAvailableError extends CafError {
  dteType: DteType;

  constructor(dteType: DteType) {
    super('No quedan folios autorizados disponibles para este tipo de documento');
    this.name = 'NoFoliosAvailableError';
    this.dteType = dteType;
  }
}

export interface UploadCafResult {
  id: string;
  dteType: DteType;
  rangeFrom: number;
  rangeTo: number;
  folios: number;
}

/**
 * Registra un CAF descargado del SII.
 *
 * Valida ANTES de guardar que el archivo sea del tipo declarado, que pertenezca
 * a esta empresa y que su rango no pise el de otro CAF ya cargado. Un CAF de
 * otra empresa o con rango solapado produce documentos que el SII rechaza uno
 * por uno, y para entonces los folios ya se consumieron.
 */
export async function uploadCaf(
  companyId: string,
  userId: string,
  xml: string
): Promise<UploadCafResult> {
  let parsed: ParsedCaf;
  try {
    parsed = parseCaf(xml);
  } catch (error) {
    if (error instanceof CafParseError) throw new CafError(error.message);
    throw error;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rut: true, businessName: true },
  });
  if (!company) throw new CafError('La empresa no existe');

  if (!cafBelongsTo(parsed, company.rut)) {
    throw new CafError(
      `Este CAF fue emitido para el RUT ${parsed.issuerRut} y tu empresa es ${company.rut}. Descarga el CAF desde el portal del SII con el RUT correcto`
    );
  }

  // Solapamiento: dos rangos que se cruzan significan que un folio podría
  // asignarse dos veces. El SII no entrega rangos solapados, así que esto
  // detecta un archivo repetido o manipulado.
  const overlapping = await prisma.dteCaf.findFirst({
    where: {
      companyId,
      dteType: parsed.dteType,
      rangeFrom: { lte: parsed.rangeTo },
      rangeTo: { gte: parsed.rangeFrom },
    },
    select: { rangeFrom: true, rangeTo: true },
  });
  if (overlapping) {
    throw new CafError(
      `Ya existe un CAF cargado que cubre los folios ${overlapping.rangeFrom}–${overlapping.rangeTo} y se cruza con este (${parsed.rangeFrom}–${parsed.rangeTo})`
    );
  }

  const created = await prisma.dteCaf.create({
    data: {
      companyId,
      dteType: parsed.dteType,
      siiCode: parsed.siiCode,
      rangeFrom: parsed.rangeFrom,
      rangeTo: parsed.rangeTo,
      authorizedAt: parsed.authorizedAt,
      encryptedXml: encryptCafXml(xml),
      uploadedById: userId,
    },
    select: { id: true },
  });

  logger.info('CAF cargado', {
    module: 'dte',
    companyId,
    userId,
    dteType: parsed.dteType,
    rangeFrom: parsed.rangeFrom,
    rangeTo: parsed.rangeTo,
  });

  return {
    id: created.id,
    dteType: parsed.dteType,
    rangeFrom: parsed.rangeFrom,
    rangeTo: parsed.rangeTo,
    folios: cafFolioCount(parsed),
  };
}

export interface AssignedFolio {
  folio: number;
  cafId: string;
  /** Bloque `<CAF>` literal, para incrustarlo en el timbre. */
  cafBlockXml: string;
  privateKeyPem: string;
  siiCode: number;
}

/**
 * Asigna el siguiente folio autorizado, dentro de la transacción del llamador.
 *
 * Debe correr en la MISMA transacción que crea el documento: si el documento
 * falla después, el folio vuelve atrás con el rollback y no queda un hueco en
 * la numeración. Un salto de folio no es un detalle estético — el SII exige
 * declarar y justificar cada folio no utilizado.
 *
 * El lock explícito `FOR UPDATE` sobre la fila del CAF serializa las emisiones
 * concurrentes, igual que el lock por producto en el kardex. Sin él, dos ventas
 * simultáneas leen el mismo `lastAssignedFolio` y emiten dos documentos con el
 * mismo folio: el SII rechaza el segundo y el cliente ya se llevó su factura.
 */
export async function assignFolioFromCaf(
  tx: TxClient,
  companyId: string,
  dteType: DteType
): Promise<AssignedFolio> {
  // Un rango puede agotarse mientras esta transacción esperaba el lock, en cuyo
  // caso hay que pasar al siguiente CAF. El tope evita un bucle infinito si
  // algo deja rangos en un estado inconsistente.
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // Se toma siempre el rango más antiguo con folios libres: el SII espera
    // que los folios se consuman en orden, no que se salte al rango nuevo
    // dejando el anterior a medias.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DteCaf"
      WHERE "companyId" = ${companyId}
        AND "dteType" = ${dteType}::"DteType"
        AND "status" = 'ACTIVE'
        AND "lastAssignedFolio" < "rangeTo"
      ORDER BY "rangeFrom" ASC
      LIMIT 1
      FOR UPDATE
    `;

    if (locked.length === 0) throw new NoFoliosAvailableError(dteType);

    // Relectura DESPUÉS de tomar el lock: si otra transacción avanzó el cursor
    // mientras esperábamos, el valor de antes ya no sirve.
    const caf = await tx.dteCaf.findFirst({
      where: { id: locked[0].id, companyId },
    });
    if (!caf) throw new NoFoliosAvailableError(dteType);

    // `lastAssignedFolio` es 0 cuando el rango está sin estrenar; en ese caso
    // el primer folio es `rangeFrom`, no `rangeFrom + 1`.
    const nextFolio = caf.lastAssignedFolio === 0 ? caf.rangeFrom : caf.lastAssignedFolio + 1;

    if (nextFolio > caf.rangeTo) {
      // Se agotó mientras esperábamos: se marca y se reintenta con otro rango.
      await tx.dteCaf.updateMany({
        where: { id: caf.id, companyId },
        data: { status: 'EXHAUSTED' },
      });
      continue;
    }

    await tx.dteCaf.updateMany({
      where: { id: caf.id, companyId },
      data: {
        lastAssignedFolio: nextFolio,
        // Si este era el último del rango, queda agotado en la misma escritura.
        ...(nextFolio === caf.rangeTo ? { status: 'EXHAUSTED' as const } : {}),
      },
    });

    const parsed = parseCaf(decryptCafXml(caf.encryptedXml));

    return {
      folio: nextFolio,
      cafId: caf.id,
      cafBlockXml: parsed.cafBlockXml,
      privateKeyPem: parsed.privateKeyPem,
      siiCode: caf.siiCode,
    };
  }

  throw new NoFoliosAvailableError(dteType);
}

export interface FolioAvailability {
  dteType: DteType;
  siiCode: number;
  /** Folios que quedan sin asignar, sumando todos los rangos activos. */
  remaining: number;
  /** Folio más alto autorizado entre los rangos activos. */
  highestAuthorized: number;
  ranges: Array<{ id: string; rangeFrom: number; rangeTo: number; lastAssignedFolio: number; remaining: number }>;
}

/**
 * Folios disponibles por tipo de documento.
 *
 * Es lo que permite avisar ANTES de quedarse sin folios. Quedarse sin CAF
 * detiene la facturación por completo y conseguir uno nuevo depende del portal
 * del SII, así que enterarse cuando ya no quedan es enterarse tarde.
 */
export async function getFolioAvailability(companyId: string): Promise<FolioAvailability[]> {
  const cafs = await prisma.dteCaf.findMany({
    where: { companyId, status: 'ACTIVE' },
    orderBy: [{ dteType: 'asc' }, { rangeFrom: 'asc' }],
    select: { id: true, dteType: true, siiCode: true, rangeFrom: true, rangeTo: true, lastAssignedFolio: true },
  });

  const byType = new Map<DteType, FolioAvailability>();

  for (const caf of cafs) {
    const used = caf.lastAssignedFolio === 0 ? 0 : caf.lastAssignedFolio - caf.rangeFrom + 1;
    const remaining = caf.rangeTo - caf.rangeFrom + 1 - used;

    const entry = byType.get(caf.dteType) ?? {
      dteType: caf.dteType,
      siiCode: caf.siiCode,
      remaining: 0,
      highestAuthorized: 0,
      ranges: [],
    };

    entry.remaining += remaining;
    entry.highestAuthorized = Math.max(entry.highestAuthorized, caf.rangeTo);
    entry.ranges.push({
      id: caf.id,
      rangeFrom: caf.rangeFrom,
      rangeTo: caf.rangeTo,
      lastAssignedFolio: caf.lastAssignedFolio,
      remaining,
    });

    byType.set(caf.dteType, entry);
  }

  return [...byType.values()];
}

/** Umbral por debajo del cual conviene avisar que hay que pedir folios nuevos. */
export const LOW_FOLIO_THRESHOLD = 20;

/** Tipos de documento con pocos folios restantes, para alertas operativas. */
export async function getLowFolioWarnings(companyId: string): Promise<FolioAvailability[]> {
  const availability = await getFolioAvailability(companyId);
  return availability.filter((entry) => entry.remaining <= LOW_FOLIO_THRESHOLD);
}

/**
 * Lee el material de timbrado de un CAF ya guardado. Se usa al reimprimir un
 * documento antiguo, sin volver a asignar folio.
 */
export async function readCafMaterial(companyId: string, cafId: string): Promise<{ cafBlockXml: string; privateKeyPem: string }> {
  const caf = await prisma.dteCaf.findFirst({
    where: { id: cafId, companyId },
    select: { encryptedXml: true },
  });
  if (!caf) throw new CafError('El CAF no existe o no pertenece a esta empresa');

  const parsed = parseCaf(decryptCafXml(caf.encryptedXml));
  return { cafBlockXml: parsed.cafBlockXml, privateKeyPem: parsed.privateKeyPem };
}

/** Verifica que exista al menos un folio disponible, sin consumirlo. */
export async function hasFoliosAvailable(companyId: string, dteType: DteType): Promise<boolean> {
  const count = await prisma.dteCaf.count({
    where: {
      companyId,
      dteType,
      status: 'ACTIVE',
      // Prisma no compara dos columnas entre sí; se filtra el caso trivial
      // aquí y el resto lo resuelve `getFolioAvailability` cuando importa el
      // detalle. Para "¿puedo emitir?" basta con que exista un rango activo.
    },
  });
  if (count === 0) return false;

  const availability = await getFolioAvailability(companyId);
  const entry = availability.find((item) => item.dteType === dteType);
  return (entry?.remaining ?? 0) > 0;
}

/** Código SII del tipo, expuesto acá para que la UI no importe dos módulos. */
export function codeFor(dteType: DteType): number {
  return siiCode(dteType);
}
