import { Prisma, type RcvKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SII_DOCUMENT_CODE } from '@/lib/chile/dte/codes';
import { rutKey } from '@/lib/chile/rut';
import {
  parseRcvCsv,
  purchaseRcvCode,
  rcvKey,
  reconcileRcv,
  RcvParseError,
  SALES_RCV_CODES,
  type ErpRcvEntry,
  type RcvEntry,
  type RcvReconciliation,
} from '@/lib/chile/rcv';
import { receivedDteLabel } from '@/lib/chile/dte/received-meta';
import { createPurchaseDocument } from '@/modules/purchases/services/purchases.service';
import { ensureSupplierContact, findExistingPurchase, ReceivedDteError } from './received.service';

/**
 * Registro de Compras y Ventas: el archivo que se descarga del SII se guarda
 * por período y se cuadra contra los documentos del ERP al consultarlo (no se
 * guarda el resultado: si alguien registra una compra que faltaba, el cuadre
 * se actualiza solo).
 */

export class RcvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RcvError';
  }
}

/** Mismo criterio de período que el F29: mes calendario por fecha de emisión. */
function periodBounds(year: number, month: number): { from: Date; to: Date } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000 || year > 2100) {
    throw new RcvError('Período inválido');
  }
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) };
}

function decodeCsv(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  // El SII descarga el CSV en Latin-1: leído como UTF-8, cada tilde queda "�".
  return utf8.includes('�') ? buffer.toString('latin1') : utf8;
}

export async function importRcv(
  companyId: string,
  userId: string,
  input: { kind: RcvKind; year: number; month: number; file: { name: string; buffer: Buffer } }
): Promise<{ id: string; rowCount: number; replaced: boolean }> {
  periodBounds(input.year, input.month);
  let entries: RcvEntry[];
  try {
    entries = parseRcvCsv(decodeCsv(input.file.buffer));
  } catch (error) {
    if (error instanceof RcvParseError) throw new RcvError(error.message);
    throw error;
  }

  const where = { companyId_kind_year_month: { companyId, kind: input.kind, year: input.year, month: input.month } };
  const previous = await prisma.rcvImport.findUnique({ where, select: { id: true } });
  const data = {
    fileName: input.file.name.slice(0, 200),
    rowCount: entries.length,
    entries: entries as unknown as Prisma.InputJsonValue,
    importedById: userId,
  };
  const saved = await prisma.rcvImport.upsert({
    where,
    create: { companyId, kind: input.kind, year: input.year, month: input.month, ...data },
    update: data,
    select: { id: true, rowCount: true },
  });
  return { id: saved.id, rowCount: saved.rowCount, replaced: Boolean(previous) };
}

async function erpPurchaseEntries(companyId: string, from: Date, to: Date): Promise<ErpRcvEntry[]> {
  const documents = await prisma.purchaseDocument.findMany({
    where: {
      companyId,
      status: 'ISSUED',
      documentType: { in: ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'] },
      issueDate: { gte: from, lt: to },
    },
    select: {
      id: true,
      documentType: true,
      folio: true,
      issueDate: true,
      netAmount: true,
      exemptAmount: true,
      ivaAmount: true,
      totalAmount: true,
      contact: { select: { rut: true, razonSocial: true } },
    },
  });
  const entries: ErpRcvEntry[] = [];
  for (const document of documents) {
    const code = purchaseRcvCode(document.documentType, document);
    const folio = Number(document.folio);
    // Folios no numéricos (registros manuales antiguos) no se pueden cruzar con el SII.
    if (code === null || !Number.isInteger(folio) || folio <= 0) continue;
    entries.push({
      documentId: document.id,
      siiCode: code,
      rut: document.contact.rut,
      name: document.contact.razonSocial,
      folio,
      date: document.issueDate.toISOString().slice(0, 10),
      exemptAmount: document.exemptAmount,
      netAmount: document.netAmount,
      ivaAmount: document.ivaAmount,
      totalAmount: document.totalAmount,
    });
  }
  return entries;
}

const SALES_DTE_TYPES = (Object.entries(SII_DOCUMENT_CODE) as [keyof typeof SII_DOCUMENT_CODE, number][])
  .filter(([, code]) => SALES_RCV_CODES.includes(code))
  .map(([type]) => type);

async function erpSalesEntries(companyId: string, from: Date, to: Date): Promise<ErpRcvEntry[]> {
  const documents = await prisma.salesDocument.findMany({
    where: { companyId, status: 'ISSUED', dteType: { in: SALES_DTE_TYPES }, issueDate: { gte: from, lt: to }, folio: { not: null } },
    select: {
      id: true,
      dteType: true,
      folio: true,
      issueDate: true,
      netAmount: true,
      exemptAmount: true,
      ivaAmount: true,
      totalAmount: true,
      contact: { select: { rut: true, razonSocial: true } },
    },
  });
  return documents.map((document) => ({
    documentId: document.id,
    siiCode: SII_DOCUMENT_CODE[document.dteType] ?? 0,
    rut: document.contact.rut,
    name: document.contact.razonSocial,
    folio: document.folio ?? 0,
    date: document.issueDate.toISOString().slice(0, 10),
    exemptAmount: document.exemptAmount,
    netAmount: document.netAmount,
    ivaAmount: document.ivaAmount,
    totalAmount: document.totalAmount,
  }));
}

export interface RcvMissingEntry extends RcvEntry {
  key: string;
  label: string;
  /** Está en el ERP, pero con fecha de otro período o todavía en borrador. */
  elsewhere: { documentId: string; date: string; draft: boolean } | null;
  /** Está en la bandeja de DTE recibidos (solo compras). */
  inboxId: string | null;
}

export interface RcvView {
  kind: RcvKind;
  year: number;
  month: number;
  imported: { fileName: string; rowCount: number; importedAt: Date } | null;
  reconciliation: (Omit<RcvReconciliation, 'onlyInSii'> & { onlyInSii: RcvMissingEntry[] }) | null;
  erpCount: number;
  /** Cuántos documentos del ERP no se pueden cruzar (folio no numérico o boletas agregadas). */
  notComparable: number;
}

export async function getRcvView(companyId: string, kind: RcvKind, year: number, month: number): Promise<RcvView> {
  const { from, to } = periodBounds(year, month);
  const [imported, erp] = await Promise.all([
    prisma.rcvImport.findUnique({
      where: { companyId_kind_year_month: { companyId, kind, year, month } },
      select: { fileName: true, rowCount: true, updatedAt: true, entries: true },
    }),
    kind === 'PURCHASES' ? erpPurchaseEntries(companyId, from, to) : erpSalesEntries(companyId, from, to),
  ]);

  const notComparable =
    kind === 'SALES'
      ? await prisma.salesDocument.count({ where: { companyId, status: 'ISSUED', dteType: { in: ['BOLETA_39', 'BOLETA_EXENTA_41'] }, issueDate: { gte: from, lt: to } } })
      : await prisma.purchaseDocument.count({ where: { companyId, status: 'ISSUED', documentType: { in: ['BOLETA', 'GUIA_DESPACHO', 'OTRO'] }, issueDate: { gte: from, lt: to } } });

  if (!imported) {
    return { kind, year, month, imported: null, reconciliation: null, erpCount: erp.length, notComparable };
  }

  const sii = imported.entries as unknown as RcvEntry[];
  const result = reconcileRcv(sii, erp);
  const onlyInSii = await annotateMissing(companyId, kind, result.onlyInSii);

  return {
    kind,
    year,
    month,
    imported: { fileName: imported.fileName, rowCount: imported.rowCount, importedAt: imported.updatedAt },
    reconciliation: { ...result, onlyInSii },
    erpCount: erp.length,
    notComparable,
  };
}

/**
 * Para lo que el SII tiene y el período del ERP no: ¿está registrado con otra
 * fecha (factura de fin de mes que el proveedor emitió antes)? ¿está en la
 * bandeja esperando registrarse? Así cada fila dice qué hacer con ella.
 */
async function annotateMissing(companyId: string, kind: RcvKind, entries: RcvEntry[]): Promise<RcvMissingEntry[]> {
  if (entries.length === 0) return [];
  const folios = entries.map((entry) => entry.folio);
  const ruts = Array.from(new Set(entries.map((entry) => rutKey(entry.rut))));

  const elsewhere = new Map<string, { documentId: string; date: string; draft: boolean }>();
  const inbox = new Map<string, string>();

  if (kind === 'PURCHASES') {
    const [purchases, received] = await Promise.all([
      prisma.purchaseDocument.findMany({
        where: {
          companyId,
          // Los borradores cuentan: la compra existe, solo falta emitirla.
          status: { in: ['ISSUED', 'DRAFT'] },
          documentType: { in: ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'] },
          folio: { in: folios.map(String) },
          contact: { rutClean: { in: ruts } },
        },
        select: { id: true, status: true, documentType: true, folio: true, issueDate: true, netAmount: true, exemptAmount: true, ivaAmount: true, contact: { select: { rut: true } } },
      }),
      prisma.receivedDte.findMany({
        where: { companyId, folio: { in: folios } },
        select: { id: true, siiCode: true, folio: true, issuerRut: true },
      }),
    ]);
    for (const purchase of purchases) {
      const code = purchaseRcvCode(purchase.documentType, purchase);
      if (code === null) continue;
      elsewhere.set(rcvKey({ siiCode: code, rut: purchase.contact.rut, folio: Number(purchase.folio) }), {
        documentId: purchase.id,
        date: purchase.issueDate.toISOString().slice(0, 10),
        draft: purchase.status === 'DRAFT',
      });
    }
    for (const row of received) inbox.set(rcvKey({ siiCode: row.siiCode, rut: row.issuerRut, folio: row.folio }), row.id);
  } else {
    const sales = await prisma.salesDocument.findMany({
      where: { companyId, status: { in: ['ISSUED', 'DRAFT'] }, folio: { in: folios }, dteType: { in: SALES_DTE_TYPES } },
      select: { id: true, status: true, dteType: true, folio: true, issueDate: true, contact: { select: { rut: true } } },
    });
    for (const sale of sales) {
      elsewhere.set(rcvKey({ siiCode: SII_DOCUMENT_CODE[sale.dteType] ?? 0, rut: sale.contact.rut, folio: sale.folio ?? 0 }), {
        documentId: sale.id,
        date: sale.issueDate.toISOString().slice(0, 10),
        draft: sale.status === 'DRAFT',
      });
    }
  }

  return entries.map((entry) => {
    const key = rcvKey(entry);
    return { ...entry, key, label: receivedDteLabel(entry.siiCode), elsewhere: elsewhere.get(key) ?? null, inboxId: inbox.get(key) ?? null };
  });
}

/**
 * Crea una compra en BORRADOR desde una fila del RCV de compras que no está
 * en el ERP. Solo facturas (33/34): una nota de crédito necesita saber qué
 * factura corrige, dato que el RCV no trae. El borrador lleva una línea por
 * monto (neto / exento); si hay XML en la bandeja conviene registrar desde
 * ahí, que trae el detalle real.
 */
export async function createDraftFromRcvEntry(
  companyId: string,
  input: { year: number; month: number; key: string }
): Promise<{ purchaseDocumentId: string; createdSupplier: boolean }> {
  const imported = await prisma.rcvImport.findUnique({
    where: { companyId_kind_year_month: { companyId, kind: 'PURCHASES', year: input.year, month: input.month } },
    select: { entries: true },
  });
  if (!imported) throw new RcvError('Primero importa el RCV de compras de ese período');
  const entry = (imported.entries as unknown as RcvEntry[]).find((row) => rcvKey(row) === input.key);
  if (!entry) throw new RcvError('Ese documento no está en el RCV importado');
  if (entry.siiCode !== 33 && entry.siiCode !== 34) {
    throw new RcvError('Solo las facturas se registran desde el RCV: las notas de crédito y débito necesitan el documento que corrigen');
  }

  let supplier;
  try {
    supplier = await ensureSupplierContact(companyId, { rut: entry.rut, name: entry.name });
  } catch (error) {
    if (error instanceof ReceivedDteError) throw new RcvError(error.message);
    throw error;
  }

  const existing = await findExistingPurchase(prisma, companyId, supplier.contact.id, entry.siiCode, entry.folio);
  if (existing) throw new RcvError(existing.status === 'DRAFT' ? 'Esa factura ya está en Compras como borrador: emítela desde ahí' : 'Esa factura ya está registrada en Compras (revisa su fecha de emisión)');

  const items = [
    ...(entry.netAmount > 0 ? [{ description: 'Compra afecta según RCV del SII', quantity: 1, unitCost: entry.netAmount, isExempt: false }] : []),
    ...(entry.exemptAmount > 0 ? [{ description: 'Compra exenta según RCV del SII', quantity: 1, unitCost: entry.exemptAmount, isExempt: true }] : []),
  ];
  if (items.length === 0) throw new RcvError('La fila del RCV no trae montos que registrar');

  const created = await createPurchaseDocument(
    companyId,
    {
      contactId: supplier.contact.id,
      documentType: 'FACTURA',
      folio: String(entry.folio),
      issueDate: entry.date ?? `${input.year}-${String(input.month).padStart(2, '0')}-01`,
      notes: `Desde el RCV del SII (${String(input.month).padStart(2, '0')}/${input.year}). Detalla las líneas y enlaza productos antes de emitir.`,
      items,
    },
    'DRAFT'
  );
  return { purchaseDocumentId: created.id, createdSupplier: supplier.created };
}
