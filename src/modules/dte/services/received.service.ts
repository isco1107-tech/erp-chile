import { Prisma, type ReceivedDteStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatRut, rutKey, validateRut } from '@/lib/chile/rut';
import {
  decodeDteFile,
  parseReceivedDtes,
  purchaseDraftLines,
  purchaseTypeForCode,
  ReceivedDteParseError,
  taxReference,
  type ReceivedDteLine,
  type ReceivedDteReference,
} from '@/lib/chile/dte/received';
import { CLAIM_WINDOW_DAYS, claimDaysLeft, receivedDteLabel } from '@/lib/chile/dte/received-meta';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { createPurchaseDocument } from '@/modules/purchases/services/purchases.service';

/**
 * Bandeja de DTE recibidos: facturas, notas y guías que los proveedores
 * emiten a la empresa, cargadas desde su XML.
 *
 * Qué resuelve: hoy la factura de un proveedor se tipea a mano en Compras,
 * con el riesgo de equivocar un monto y de perder el plazo de 8 días para
 * reclamarla. Acá se sube el XML una vez, se verifica el timbre, se decide
 * (aceptar / reclamar) y se registra como compra sin retipear.
 *
 * Qué NO hace: no se conecta al SII. El acuse de recibo y el reclamo con
 * efecto legal se registran en sii.cl ("Registro de Reclamos"); el estado de
 * esta bandeja es el control interno de la empresa.
 */

export class ReceivedDteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceivedDteError';
  }
}

/** Tope de documentos por archivo: un EnvioDTE real rara vez pasa de unos pocos. */
const MAX_DTES_PER_FILE = 500;

export interface ImportReceivedResult {
  imported: number;
  duplicates: number;
  /** DTE dirigidos a otro RUT: no se guardan. */
  foreign: number;
  invalidTed: number;
  /** Ya estaban registrados como compra: quedaron vinculados solos. */
  linked: number;
  items: { id: string; siiCode: number; folio: number; issuerName: string; totalAmount: number; tedStatus: string; status: ReceivedDteStatus }[];
}

type Tx = Prisma.TransactionClient;

async function findSupplierContact(db: Tx | typeof prisma, companyId: string, rut: string) {
  const key = rutKey(rut);
  return db.contact.findFirst({
    where: { companyId, rutClean: { in: [key, `0${key}`] } },
    select: { id: true, isSupplier: true, razonSocial: true },
  });
}

/**
 * Proveedor por RUT: lo busca en Contactos y, si no existe, lo crea con los
 * datos que trae el propio documento. Si existía solo como cliente, lo marca
 * también como proveedor: acaba de emitirle un documento a la empresa.
 */
export async function ensureSupplierContact(
  companyId: string,
  data: { rut: string; name: string; giro?: string | null }
): Promise<{ contact: { id: string; razonSocial: string }; created: boolean }> {
  let contact = await findSupplierContact(prisma, companyId, data.rut);
  let created = false;
  if (!contact) {
    if (!validateRut(data.rut)) throw new ReceivedDteError('El RUT del emisor no es válido: registra al proveedor a mano');
    try {
      contact = await prisma.contact.create({
        data: {
          companyId,
          rut: formatRut(rutKey(data.rut)),
          rutClean: rutKey(data.rut),
          razonSocial: data.name || formatRut(rutKey(data.rut)),
          giro: data.giro ?? undefined,
          isCustomer: false,
          isSupplier: true,
        },
        select: { id: true, isSupplier: true, razonSocial: true },
      });
      created = true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      contact = await findSupplierContact(prisma, companyId, data.rut);
      if (!contact) throw error;
    }
  }
  if (!contact.isSupplier) {
    await prisma.contact.updateMany({ where: { id: contact.id, companyId }, data: { isSupplier: true } });
  }
  return { contact: { id: contact.id, razonSocial: contact.razonSocial }, created };
}

/** Compra ya registrada en el ERP para ese proveedor, tipo y folio. */
export async function findExistingPurchase(db: Tx | typeof prisma, companyId: string, contactId: string, siiCode: number, folio: number) {
  return db.purchaseDocument.findFirst({
    where: { companyId, contactId, documentType: purchaseTypeForCode(siiCode), folio: String(folio), status: { not: 'CANCELLED' } },
    select: { id: true, status: true },
  });
}

export async function importReceivedDtes(
  companyId: string,
  userId: string,
  file: { name: string; buffer: Buffer }
): Promise<ImportReceivedResult> {
  const company = await prisma.company.findFirst({ where: { id: companyId }, select: { rut: true } });
  if (!company) throw new ReceivedDteError('Empresa no encontrada');

  let parsed;
  try {
    parsed = parseReceivedDtes(decodeDteFile(file.buffer));
  } catch (error) {
    if (error instanceof ReceivedDteParseError) throw new ReceivedDteError(error.message);
    throw error;
  }
  if (parsed.length > MAX_DTES_PER_FILE) {
    throw new ReceivedDteError(`El archivo trae ${parsed.length} documentos; el máximo por carga es ${MAX_DTES_PER_FILE}`);
  }

  const companyKey = rutKey(company.rut);
  const result: ImportReceivedResult = { imported: 0, duplicates: 0, foreign: 0, invalidTed: 0, linked: 0, items: [] };

  for (const dte of parsed) {
    // Un DTE emitido a otro RUT no es de esta empresa: guardarlo mezclaría
    // crédito fiscal ajeno en el cuadre del período.
    if (rutKey(dte.receiverRut) !== companyKey) {
      result.foreign += 1;
      continue;
    }
    const existing = await prisma.receivedDte.findFirst({
      where: { companyId, issuerRut: dte.issuerRut, siiCode: dte.siiCode, folio: dte.folio },
      select: { id: true },
    });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    const contact = await findSupplierContact(prisma, companyId, dte.issuerRut);
    const purchase = contact ? await findExistingPurchase(prisma, companyId, contact.id, dte.siiCode, dte.folio) : null;

    try {
      const created = await prisma.receivedDte.create({
        data: {
          companyId,
          issuerRut: dte.issuerRut,
          issuerName: dte.issuerName,
          issuerGiro: dte.issuerGiro,
          siiCode: dte.siiCode,
          folio: dte.folio,
          issueDate: new Date(`${dte.issueDate}T12:00:00Z`),
          dueDate: dte.dueDate ? new Date(`${dte.dueDate}T12:00:00Z`) : null,
          netAmount: dte.netAmount,
          exemptAmount: dte.exemptAmount,
          ivaAmount: dte.ivaAmount,
          totalAmount: dte.totalAmount,
          lines: dte.lines as unknown as Prisma.InputJsonValue,
          references: dte.references.length > 0 ? (dte.references as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          xml: dte.xml,
          tedStatus: dte.tedStatus,
          status: purchase ? 'REGISTERED' : 'PENDING',
          purchaseDocumentId: purchase?.id ?? null,
          statusAt: purchase ? new Date() : null,
          statusById: purchase ? userId : null,
          fileName: file.name.slice(0, 200),
        },
        select: { id: true, siiCode: true, folio: true, issuerName: true, totalAmount: true, tedStatus: true, status: true },
      });
      result.imported += 1;
      if (purchase) result.linked += 1;
      if (dte.tedStatus !== 'VALID') result.invalidTed += 1;
      result.items.push(created);
    } catch (error) {
      // Dos cargas simultáneas del mismo archivo: la segunda choca con la
      // unicidad y cuenta como duplicado, no como error.
      if (isUniqueConstraintError(error)) {
        result.duplicates += 1;
        continue;
      }
      throw error;
    }
  }

  if (result.imported === 0 && result.duplicates === 0 && result.foreign > 0) {
    throw new ReceivedDteError('Los documentos del archivo están emitidos a otro RUT, no a esta empresa');
  }
  return result;
}

// ─── Consulta ────────────────────────────────────────────────────────────────

export type ReceivedDteFilter = ReceivedDteStatus | 'ALL' | 'ATTENTION';

export interface ReceivedDteRow {
  id: string;
  siiCode: number;
  label: string;
  folio: number;
  issuerRut: string;
  issuerName: string;
  issueDate: Date;
  receivedAt: Date;
  netAmount: number;
  ivaAmount: number;
  totalAmount: number;
  tedStatus: string;
  status: ReceivedDteStatus;
  statusNote: string | null;
  purchaseDocumentId: string | null;
  /** Días para reclamar; `null` si ya no aplica (aceptado, reclamado o registrado). */
  claimDaysLeft: number | null;
}

export interface ReceivedDteSummary {
  pending: number;
  /** Pendientes con 2 días o menos para reclamar. */
  expiring: number;
  /** Pendientes cuyo plazo ya venció: se entienden aceptados. */
  overdue: number;
  invalidTed: number;
  pendingAmount: number;
  total: number;
}

function toRow(row: {
  id: string;
  siiCode: number;
  folio: number;
  issuerRut: string;
  issuerName: string;
  issueDate: Date;
  receivedAt: Date;
  netAmount: number;
  ivaAmount: number;
  totalAmount: number;
  tedStatus: string;
  status: ReceivedDteStatus;
  statusNote: string | null;
  purchaseDocumentId: string | null;
}, now: Date): ReceivedDteRow {
  return {
    ...row,
    label: receivedDteLabel(row.siiCode),
    claimDaysLeft: row.status === 'PENDING' ? claimDaysLeft(row.receivedAt, now) : null,
  };
}

const ROW_SELECT = {
  id: true,
  siiCode: true,
  folio: true,
  issuerRut: true,
  issuerName: true,
  issueDate: true,
  receivedAt: true,
  netAmount: true,
  ivaAmount: true,
  totalAmount: true,
  tedStatus: true,
  status: true,
  statusNote: true,
  purchaseDocumentId: true,
} satisfies Prisma.ReceivedDteSelect;

export async function listReceivedDtes(
  companyId: string,
  options: { filter?: ReceivedDteFilter; q?: string } = {}
): Promise<{ rows: ReceivedDteRow[]; summary: ReceivedDteSummary }> {
  const now = new Date();
  const filter = options.filter ?? 'ALL';
  const where: Prisma.ReceivedDteWhereInput = { companyId };
  if (filter === 'ATTENTION') {
    where.OR = [{ status: 'PENDING' }, { tedStatus: { not: 'VALID' }, status: { not: 'CLAIMED' } }];
  } else if (filter !== 'ALL') {
    where.status = filter;
  }
  const q = options.q?.trim();
  if (q) {
    const folio = Number(q);
    where.AND = [
      {
        OR: [
          { issuerName: { contains: q, mode: 'insensitive' } },
          { issuerRut: { contains: q } },
          ...(Number.isInteger(folio) && folio > 0 ? [{ folio }] : []),
        ],
      },
    ];
  }

  const [rows, pendingRows, invalidTed, total] = await Promise.all([
    prisma.receivedDte.findMany({ where, select: ROW_SELECT, orderBy: [{ receivedAt: 'desc' }, { folio: 'desc' }], take: 300 }),
    prisma.receivedDte.findMany({ where: { companyId, status: 'PENDING' }, select: { receivedAt: true, totalAmount: true } }),
    prisma.receivedDte.count({ where: { companyId, tedStatus: { not: 'VALID' }, status: { not: 'CLAIMED' } } }),
    prisma.receivedDte.count({ where: { companyId } }),
  ]);

  const summary: ReceivedDteSummary = { pending: pendingRows.length, expiring: 0, overdue: 0, invalidTed, pendingAmount: 0, total };
  for (const row of pendingRows) {
    const left = claimDaysLeft(row.receivedAt, now);
    if (left < 0) summary.overdue += 1;
    else if (left <= 2) summary.expiring += 1;
    summary.pendingAmount += row.totalAmount;
  }

  return { rows: rows.map((row) => toRow(row, now)), summary };
}

export interface ReceivedDteDetail extends ReceivedDteRow {
  /** Por qué el timbre no es válido (se recalcula desde el XML guardado). */
  tedIssue: string | null;
  issuerGiro: string | null;
  dueDate: Date | null;
  exemptAmount: number;
  lines: ReceivedDteLine[];
  references: ReceivedDteReference[];
  statusAt: Date | null;
  statusByName: string | null;
  fileName: string | null;
  claimWindowDays: number;
  purchaseDocument: { id: string; folio: string; status: string; totalAmount: number } | null;
  supplier: { id: string; razonSocial: string; isSupplier: boolean } | null;
}

export async function getReceivedDte(companyId: string, id: string): Promise<ReceivedDteDetail | null> {
  const row = await prisma.receivedDte.findFirst({
    where: { id, companyId },
    select: {
      ...ROW_SELECT,
      issuerGiro: true,
      dueDate: true,
      exemptAmount: true,
      lines: true,
      references: true,
      statusAt: true,
      statusById: true,
      fileName: true,
      xml: true,
      purchaseDocument: { select: { id: true, folio: true, status: true, totalAmount: true } },
    },
  });
  if (!row) return null;

  const [statusBy, supplier] = await Promise.all([
    row.statusById ? prisma.user.findFirst({ where: { id: row.statusById, companyId }, select: { name: true } }) : null,
    findSupplierContact(prisma, companyId, row.issuerRut),
  ]);

  const { xml, ...data } = row;
  return {
    ...toRow(data, new Date()),
    tedIssue: row.tedStatus === 'VALID' ? null : tedIssueFromXml(xml),
    issuerGiro: row.issuerGiro,
    dueDate: row.dueDate,
    exemptAmount: row.exemptAmount,
    lines: (row.lines ?? []) as unknown as ReceivedDteLine[],
    references: (row.references ?? []) as unknown as ReceivedDteReference[],
    statusAt: row.statusAt,
    statusByName: statusBy?.name ?? null,
    fileName: row.fileName,
    claimWindowDays: CLAIM_WINDOW_DAYS,
    purchaseDocument: row.purchaseDocument,
    supplier,
  };
}

/** El motivo exacto del timbre inválido no se persiste: se vuelve a leer del XML. */
function tedIssueFromXml(xml: string): string | null {
  try {
    return parseReceivedDtes(xml)[0]?.tedIssue ?? null;
  } catch {
    return 'El XML guardado no se pudo volver a leer';
  }
}

/** XML original para descargar (lo pide el contador o una fiscalización). */
export async function getReceivedDteXml(companyId: string, id: string): Promise<{ fileName: string; xml: string } | null> {
  const row = await prisma.receivedDte.findFirst({ where: { id, companyId }, select: { xml: true, siiCode: true, folio: true, issuerRut: true } });
  if (!row) return null;
  return { fileName: `DTE_${row.siiCode}_${row.folio}_${row.issuerRut.replace(/\./g, '')}.xml`, xml: row.xml };
}

// ─── Decisión: aceptar / reclamar ────────────────────────────────────────────

export async function setReceivedDteStatus(
  companyId: string,
  userId: string,
  id: string,
  status: 'PENDING' | 'ACCEPTED' | 'CLAIMED',
  note?: string
): Promise<void> {
  if (status === 'CLAIMED' && !note?.trim()) throw new ReceivedDteError('Indica el motivo del reclamo');
  const { count } = await prisma.receivedDte.updateMany({
    where: { id, companyId, status: { not: 'REGISTERED' } },
    data: { status, statusNote: note?.trim() || null, statusAt: new Date(), statusById: userId },
  });
  if (count === 0) {
    const exists = await prisma.receivedDte.findFirst({ where: { id, companyId }, select: { status: true } });
    if (!exists) throw new ReceivedDteError('Documento no encontrado');
    throw new ReceivedDteError('Este documento ya está registrado como compra: anula la compra si necesitas reclamarlo');
  }
}

// ─── Registro como compra ────────────────────────────────────────────────────

/**
 * Tipos que se pueden pasar a Compras desde la bandeja. Quedan fuera los de
 * exportación y la factura de compra (46), que la emite el comprador: si
 * llega a esta empresa, en realidad es una venta.
 */
const REGISTRABLE_CODES = [33, 34, 39, 41, 43, 52, 56, 61];

export interface RegisterResult {
  purchaseDocumentId: string;
  /** `true` si ya existía la compra y solo se vinculó. */
  linkedExisting: boolean;
  createdSupplier: boolean;
  /** Diferencia entre el total del borrador y el del DTE (descuentos globales, redondeos). */
  totalDifference: number;
}

/**
 * Crea la compra como BORRADOR con las líneas del DTE: no mueve stock ni
 * contabiliza hasta que alguien la revise (enlazar productos, bodega) y la
 * emita. Si el proveedor no existe en Contactos, se crea con los datos del
 * propio documento.
 */
export async function registerReceivedDteAsPurchase(companyId: string, userId: string, id: string): Promise<RegisterResult> {
  const dte = await prisma.receivedDte.findFirst({ where: { id, companyId } });
  if (!dte) throw new ReceivedDteError('Documento no encontrado');
  if (dte.status === 'CLAIMED') throw new ReceivedDteError('Un documento reclamado no se registra como compra');
  if (dte.status === 'REGISTERED' && dte.purchaseDocumentId) throw new ReceivedDteError('Este documento ya está registrado como compra');
  if (!REGISTRABLE_CODES.includes(dte.siiCode)) {
    throw new ReceivedDteError(`${receivedDteLabel(dte.siiCode)}: este tipo de documento se registra manualmente en Compras`);
  }

  const { contact, created: createdSupplier } = await ensureSupplierContact(companyId, {
    rut: dte.issuerRut,
    name: dte.issuerName,
    giro: dte.issuerGiro,
  });

  const existing = await findExistingPurchase(prisma, companyId, contact.id, dte.siiCode, dte.folio);
  let purchaseDocumentId: string;
  let draftTotal: number;
  if (existing) {
    purchaseDocumentId = existing.id;
    const current = await prisma.purchaseDocument.findFirst({ where: { id: existing.id, companyId }, select: { totalAmount: true } });
    draftTotal = current?.totalAmount ?? dte.totalAmount;
  } else {
    const lines = purchaseDraftLines({
      siiCode: dte.siiCode,
      lines: (dte.lines ?? []) as unknown as ReceivedDteLine[],
      netAmount: dte.netAmount,
      exemptAmount: dte.exemptAmount,
    });
    if (lines.length === 0) throw new ReceivedDteError('El documento no trae montos que registrar');
    const documentType = purchaseTypeForCode(dte.siiCode);
    const reference = taxReference((dte.references ?? []) as unknown as ReceivedDteReference[]);
    if (documentType === 'NOTA_CREDITO' && !reference) {
      throw new ReceivedDteError('La nota de crédito no indica qué factura corrige: regístrala a mano en Compras');
    }
    try {
      const created = await createPurchaseDocument(
        companyId,
        {
          contactId: contact.id,
          documentType,
          folio: String(dte.folio),
          referenceFolio: reference?.folio,
          issueDate: dte.issueDate.toISOString().slice(0, 10),
          dueDate: dte.dueDate ? dte.dueDate.toISOString().slice(0, 10) : undefined,
          notes: `Desde DTE recibido: ${receivedDteLabel(dte.siiCode)} N° ${dte.folio}. Revisa las líneas y enlaza productos antes de emitir.`,
          items: lines,
        },
        'DRAFT'
      );
      purchaseDocumentId = created.id;
      draftTotal = created.totalAmount;
    } catch (error) {
      if (error instanceof Error && /referenciado no existe/.test(error.message)) {
        throw new ReceivedDteError(`Registra primero la factura N° ${reference?.folio} de este proveedor: esta nota de crédito la corrige`);
      }
      throw error;
    }
  }

  await prisma.receivedDte.updateMany({
    where: { id, companyId },
    data: { status: 'REGISTERED', purchaseDocumentId, statusAt: new Date(), statusById: userId },
  });

  return { purchaseDocumentId, linkedExisting: Boolean(existing), createdSupplier, totalDifference: draftTotal - dte.totalAmount };
}
