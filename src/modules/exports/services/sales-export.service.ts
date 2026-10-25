import 'server-only';

import ExcelJS from 'exceljs';
import type { DteType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { signForSalesDteType } from '@/lib/chile/document-sign';
import { cleanRut } from '@/lib/chile/rut';
import { describeRange, type DayRange } from '@/lib/exports/ranges';
import { SALES_GROUP_LABELS, SALES_GROUP_TYPES, SALES_STATUS_LABELS, type SalesExportFilter } from '@/lib/exports/filters';
import { dateRange } from '@/modules/inventory/services/movement-log.service';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/sales/schema';
import { CLP_FORMAT, DATETIME_FORMAT, QTY_FORMAT, safeCell, santiagoWallClock, styleHeader } from './excel';

/**
 * Boletas y demás documentos de venta de TODA la empresa (todas las bodegas y
 * cajas), con los mismos filtros en pantalla y en el Excel. Todo filtra por
 * `companyId`; los borradores y las cotizaciones nunca entran.
 */

/** Tope de documentos por archivo: pasado esto se acota con las fechas. */
export const MAX_SALES_EXPORT_DOCS = 20_000;
export const SALES_PAGE_SIZE = 50;

export const paymentLabel = (method: string): string => (method in PAYMENT_METHOD_LABELS ? PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] : method);

export function salesWhere(companyId: string, filter: SalesExportFilter): Prisma.SalesDocumentWhereInput {
  const where: Prisma.SalesDocumentWhereInput = {
    companyId,
    dteType: { in: SALES_GROUP_TYPES[filter.group] },
    status: filter.status === 'BOTH' ? { in: ['ISSUED', 'CANCELLED'] } : filter.status,
  };
  const issueDate = dateRange(filter.from, filter.to);
  if (issueDate) where.issueDate = issueDate;
  if (filter.warehouseId) where.warehouseId = filter.warehouseId;
  const q = filter.q?.trim();
  if (q) {
    const or: Prisma.SalesDocumentWhereInput[] = [
      { contact: { razonSocial: { contains: q, mode: 'insensitive' } } },
      { contact: { nombreFantasia: { contains: q, mode: 'insensitive' } } },
    ];
    if (/^\d{1,9}$/.test(q)) or.push({ folio: Number(q) });
    // Solo se busca por RUT si lo escrito parece uno: «Karla» no debe convertirse en «K».
    const rut = cleanRut(q);
    if (/^[\d.\-kK\s]+$/.test(q) && rut.length >= 3) or.push({ contact: { rutClean: { contains: rut } } });
    where.OR = or;
  }
  return where;
}

const DOC_SELECT = {
  id: true,
  dteType: true,
  folio: true,
  status: true,
  issueDate: true,
  paymentMethod: true,
  netAmount: true,
  exemptAmount: true,
  ivaAmount: true,
  totalAmount: true,
  paidAmount: true,
  paymentStatus: true,
  referenceFolio: true,
  referenceType: true,
  contact: { select: { rut: true, razonSocial: true, nombreFantasia: true } },
  warehouse: { select: { name: true } },
  seller: { select: { name: true } },
  cashShift: { select: { cashRegister: { select: { name: true } } } },
} satisfies Prisma.SalesDocumentSelect;

type DocRecord = Prisma.SalesDocumentGetPayload<{ select: typeof DOC_SELECT }>;

export interface SalesExportRow {
  id: string;
  date: Date;
  typeLabel: string;
  dteType: DteType;
  folio: number | null;
  status: 'ISSUED' | 'CANCELLED' | 'DRAFT';
  customer: string;
  rut: string;
  warehouse: string;
  register: string | null;
  seller: string | null;
  payment: string;
  net: number;
  exempt: number;
  iva: number;
  total: number;
  paid: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  reference: string | null;
}

const PAYMENT_STATUS_LABELS = { UNPAID: 'Sin pagar', PARTIAL: 'Pago parcial', PAID: 'Pagado' } as const;
const STATUS_LABELS = { ISSUED: 'Emitido', CANCELLED: 'Anulado', DRAFT: 'Borrador' } as const;

function toRow(doc: DocRecord): SalesExportRow {
  return {
    id: doc.id,
    date: doc.issueDate,
    typeLabel: DTE_TYPE_LABELS[doc.dteType],
    dteType: doc.dteType,
    folio: doc.folio,
    status: doc.status,
    customer: doc.contact.nombreFantasia?.trim() || doc.contact.razonSocial,
    rut: doc.contact.rut,
    warehouse: doc.warehouse.name,
    register: doc.cashShift?.cashRegister.name ?? null,
    seller: doc.seller?.name ?? null,
    payment: paymentLabel(doc.paymentMethod),
    net: doc.netAmount,
    exempt: doc.exemptAmount,
    iva: doc.ivaAmount,
    total: doc.totalAmount,
    paid: doc.paidAmount,
    paymentStatus: doc.paymentStatus,
    reference: doc.referenceFolio ? `${doc.referenceType ? DTE_TYPE_LABELS[doc.referenceType] : 'Documento'} N° ${doc.referenceFolio}` : null,
  };
}

export async function countSalesDocuments(companyId: string, filter: SalesExportFilter): Promise<number> {
  return prisma.salesDocument.count({ where: salesWhere(companyId, filter) });
}

/** Una página de la lista en pantalla (la más reciente primero). */
export async function listSalesDocuments(companyId: string, filter: SalesExportFilter, page: number): Promise<{ rows: SalesExportRow[]; total: number }> {
  const where = salesWhere(companyId, filter);
  const [total, found] = await Promise.all([
    prisma.salesDocument.count({ where }),
    prisma.salesDocument.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      skip: (Math.max(page, 1) - 1) * SALES_PAGE_SIZE,
      take: SALES_PAGE_SIZE,
      select: DOC_SELECT,
    }),
  ]);
  return { rows: found.map(toRow), total };
}

export interface SalesSummaryLine {
  label: string;
  documents: number;
  net: number;
  exempt: number;
  iva: number;
  total: number;
}

export interface SalesSummary {
  /** Documentos que cumplen el filtro, de cualquier estado elegido. */
  documents: number;
  issuedDocuments: number;
  cancelledDocuments: number;
  /** Solo lo EMITIDO, con las notas de crédito restando (igual que el IVA y el F29). */
  issued: Omit<SalesSummaryLine, 'label' | 'documents'>;
  byType: SalesSummaryLine[];
  byPayment: SalesSummaryLine[];
}

/** Totales del filtro completo (no de la página): lo anulado se cuenta aparte y nunca suma a lo vendido. */
export async function summarizeSales(companyId: string, filter: SalesExportFilter): Promise<SalesSummary> {
  const groups = await prisma.salesDocument.groupBy({
    by: ['dteType', 'status', 'paymentMethod'],
    where: salesWhere(companyId, filter),
    _count: { _all: true },
    _sum: { netAmount: true, exemptAmount: true, ivaAmount: true, totalAmount: true },
  });
  const zero = { net: 0, exempt: 0, iva: 0, total: 0 };
  const summary: SalesSummary = { documents: 0, issuedDocuments: 0, cancelledDocuments: 0, issued: { ...zero }, byType: [], byPayment: [] };
  const byType = new Map<string, SalesSummaryLine>();
  const byPayment = new Map<string, SalesSummaryLine>();
  const add = (map: Map<string, SalesSummaryLine>, label: string, count: number, amounts: typeof zero) => {
    const line = map.get(label) ?? { label, documents: 0, ...zero };
    line.documents += count;
    line.net += amounts.net;
    line.exempt += amounts.exempt;
    line.iva += amounts.iva;
    line.total += amounts.total;
    map.set(label, line);
  };
  for (const group of groups) {
    const count = group._count._all;
    summary.documents += count;
    if (group.status === 'CANCELLED') {
      summary.cancelledDocuments += count;
      continue;
    }
    summary.issuedDocuments += count;
    const sign = signForSalesDteType(group.dteType);
    const amounts = {
      net: sign * (group._sum.netAmount ?? 0),
      exempt: sign * (group._sum.exemptAmount ?? 0),
      iva: sign * (group._sum.ivaAmount ?? 0),
      total: sign * (group._sum.totalAmount ?? 0),
    };
    summary.issued.net += amounts.net;
    summary.issued.exempt += amounts.exempt;
    summary.issued.iva += amounts.iva;
    summary.issued.total += amounts.total;
    add(byType, DTE_TYPE_LABELS[group.dteType], count, amounts);
    add(byPayment, paymentLabel(group.paymentMethod), count, amounts);
  }
  summary.byType = [...byType.values()].sort((a, b) => b.total - a.total);
  summary.byPayment = [...byPayment.values()].sort((a, b) => b.total - a.total);
  return summary;
}

const BATCH = 500;

export interface SalesWorkbook {
  buffer: Buffer;
  documents: number;
  lines: number;
  truncated: boolean;
}

/**
 * Excel con tres hojas: «Documentos» (una fila por documento), «Detalle de productos» (una fila por
 * línea, para cruzar con el inventario) y «Resumen» (por tipo y por medio de pago, con las notas de
 * crédito restando). Pasado el tope de documentos se corta y se avisa en la hoja y en la respuesta.
 */
export async function buildSalesWorkbook(companyId: string, filter: SalesExportFilter, range: DayRange): Promise<SalesWorkbook> {
  const where = salesWhere(companyId, filter);
  const [total, summary] = await Promise.all([prisma.salesDocument.count({ where }), summarizeSales(companyId, filter)]);
  const truncated = total > MAX_SALES_EXPORT_DOCS;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aether ERP';
  const docs = wb.addWorksheet('Documentos');
  docs.columns = [
    { header: 'Fecha y hora', key: 'date', width: 18 },
    { header: 'Tipo', key: 'type', width: 26 },
    { header: 'Folio', key: 'folio', width: 10 },
    { header: 'Estado', key: 'status', width: 11 },
    { header: 'Cliente', key: 'customer', width: 32 },
    { header: 'RUT', key: 'rut', width: 14 },
    { header: 'Bodega', key: 'warehouse', width: 20 },
    { header: 'Caja', key: 'register', width: 16 },
    { header: 'Cajero o vendedor', key: 'seller', width: 22 },
    { header: 'Medio de pago', key: 'payment', width: 18 },
    { header: 'Neto', key: 'net', width: 12 },
    { header: 'Exento', key: 'exempt', width: 12 },
    { header: 'IVA', key: 'iva', width: 12 },
    { header: 'Total', key: 'total', width: 13 },
    { header: 'Pagado', key: 'paid', width: 13 },
    { header: 'Estado de pago', key: 'paymentStatus', width: 14 },
    { header: 'Documento de referencia', key: 'reference', width: 34 },
  ];
  styleHeader(docs);
  const lines = wb.addWorksheet('Detalle de productos');
  lines.columns = [
    { header: 'Fecha y hora', key: 'date', width: 18 },
    { header: 'Tipo', key: 'type', width: 26 },
    { header: 'Folio', key: 'folio', width: 10 },
    { header: 'Estado', key: 'status', width: 11 },
    { header: 'Cliente', key: 'customer', width: 32 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Producto o servicio', key: 'description', width: 42 },
    { header: 'Cantidad', key: 'quantity', width: 11 },
    { header: 'Precio unitario (neto)', key: 'unitPrice', width: 16 },
    { header: 'Descuento %', key: 'discount', width: 12 },
    { header: 'Exento', key: 'exempt', width: 9 },
    { header: 'Neto de la línea', key: 'subtotal', width: 15 },
    { header: 'IVA', key: 'iva', width: 12 },
    { header: 'Total de la línea', key: 'total', width: 15 },
  ];
  styleHeader(lines);

  let documents = 0;
  let lineCount = 0;
  let cursor: string | undefined;
  while (documents < MAX_SALES_EXPORT_DOCS) {
    const batch = await prisma.salesDocument.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: Math.min(BATCH, MAX_SALES_EXPORT_DOCS - documents),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: DOC_SELECT,
    });
    if (batch.length === 0) break;
    const rows = batch.map(toRow);
    const items = await prisma.salesDocumentItem.findMany({
      where: { companyId, documentId: { in: rows.map((row) => row.id) } },
      orderBy: { id: 'asc' },
      select: { documentId: true, sku: true, description: true, quantity: true, unitPrice: true, discountPercent: true, isExempt: true, subtotal: true, iva: true, total: true },
    });
    const itemsByDocument = new Map<string, typeof items>();
    for (const item of items) itemsByDocument.set(item.documentId, [...(itemsByDocument.get(item.documentId) ?? []), item]);

    for (const row of rows) {
      const date = santiagoWallClock(row.date);
      docs.addRow({
        date,
        type: row.typeLabel,
        folio: row.folio ?? '',
        status: STATUS_LABELS[row.status],
        customer: safeCell(row.customer),
        rut: row.rut,
        warehouse: safeCell(row.warehouse),
        register: safeCell(row.register),
        seller: safeCell(row.seller),
        payment: row.payment,
        net: row.net,
        exempt: row.exempt,
        iva: row.iva,
        total: row.total,
        paid: row.paid,
        paymentStatus: PAYMENT_STATUS_LABELS[row.paymentStatus],
        reference: row.reference ?? '',
      });
      for (const item of itemsByDocument.get(row.id) ?? []) {
        lines.addRow({
          date,
          type: row.typeLabel,
          folio: row.folio ?? '',
          status: STATUS_LABELS[row.status],
          customer: safeCell(row.customer),
          sku: item.sku ?? '',
          description: safeCell(item.description),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discountPercent,
          exempt: item.isExempt ? 'Sí' : '',
          subtotal: item.subtotal,
          iva: item.iva,
          total: item.total,
        });
        lineCount += 1;
      }
    }
    documents += rows.length;
    cursor = batch[batch.length - 1]?.id;
    if (batch.length < BATCH) break;
  }

  docs.getColumn('date').numFmt = DATETIME_FORMAT;
  lines.getColumn('date').numFmt = DATETIME_FORMAT;
  for (const key of ['net', 'exempt', 'iva', 'total', 'paid']) docs.getColumn(key).numFmt = CLP_FORMAT;
  lines.getColumn('quantity').numFmt = QTY_FORMAT;
  for (const key of ['unitPrice', 'subtotal', 'iva', 'total']) lines.getColumn(key).numFmt = CLP_FORMAT;

  const sheet = wb.addWorksheet('Resumen');
  sheet.columns = [
    { header: 'Resumen', key: 'label', width: 34 },
    { header: 'Documentos', key: 'documents', width: 14 },
    { header: 'Neto', key: 'net', width: 14 },
    { header: 'Exento', key: 'exempt', width: 14 },
    { header: 'IVA', key: 'iva', width: 14 },
    { header: 'Total', key: 'total', width: 15 },
  ];
  styleHeader(sheet, { filter: false });
  const section = (title: string, rows: SalesSummaryLine[]) => {
    const heading = sheet.addRow({ label: title });
    heading.font = { bold: true };
    for (const row of rows) sheet.addRow(row);
    sheet.addRow({});
  };
  section('Por tipo de documento (solo emitidos)', summary.byType);
  section('Por medio de pago (solo emitidos)', summary.byPayment);
  const totalRow = sheet.addRow({ label: 'Total vendido (emitidos, con notas de crédito restando)', documents: summary.issuedDocuments, ...summary.issued });
  totalRow.font = { bold: true };
  if (summary.cancelledDocuments > 0) sheet.addRow({ label: 'Documentos anulados (no suman a lo vendido)', documents: summary.cancelledDocuments });
  sheet.addRow({});
  const note = sheet.addRow({
    label: `${SALES_GROUP_LABELS[filter.group]} · ${SALES_STATUS_LABELS[filter.status]} · ${describeRange(range)}`,
  });
  note.font = { italic: true, color: { argb: 'FF666666' } };
  if (truncated) {
    const warning = sheet.addRow({
      label: `Hay ${total.toLocaleString('es-CL')} documentos en este filtro y el archivo incluye los ${MAX_SALES_EXPORT_DOCS.toLocaleString('es-CL')} más recientes. Acota las fechas para bajar el resto.`,
    });
    warning.font = { bold: true, color: { argb: 'FFB45309' } };
  }
  for (const key of ['net', 'exempt', 'iva', 'total']) sheet.getColumn(key).numFmt = CLP_FORMAT;

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), documents, lines: lineCount, truncated };
}
