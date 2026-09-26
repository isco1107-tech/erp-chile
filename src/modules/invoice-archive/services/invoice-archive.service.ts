import 'server-only';

import type { ArchivedInvoice } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { supplierKeyOf, type ArchivedInvoiceInput } from '../schema';

/** Un proveedor del archivo con su resumen de compras. */
export interface ArchiveSupplierSummary {
  key: string;
  /** Nombre más reciente con que se registró. */
  name: string;
  contactId: string | null;
  invoiceCount: number;
  totalAmount: number;
  lastIssueDate: Date | null;
}

export interface ArchiveOverview {
  suppliers: ArchiveSupplierSummary[];
  invoiceCount: number;
  totalAmount: number;
}

/** Resumen por proveedor (todas las facturas de la empresa), del más reciente al más antiguo. */
export async function getArchiveOverview(companyId: string): Promise<ArchiveOverview> {
  const [groups, latest] = await Promise.all([
    prisma.archivedInvoice.groupBy({
      by: ['supplierKey'],
      where: { companyId },
      _count: { _all: true },
      _sum: { totalAmount: true },
      _max: { issueDate: true },
    }),
    // Nombre y contacto de la factura más reciente de cada proveedor.
    prisma.archivedInvoice.findMany({
      where: { companyId },
      distinct: ['supplierKey'],
      orderBy: [{ supplierKey: 'asc' }, { issueDate: 'desc' }, { createdAt: 'desc' }],
      select: { supplierKey: true, supplierName: true, contactId: true },
    }),
  ]);
  const byKey = new Map(latest.map((row) => [row.supplierKey, row]));
  const suppliers = groups
    .map((group) => ({
      key: group.supplierKey,
      name: byKey.get(group.supplierKey)?.supplierName ?? group.supplierKey,
      contactId: byKey.get(group.supplierKey)?.contactId ?? null,
      invoiceCount: group._count._all,
      totalAmount: group._sum.totalAmount ?? 0,
      lastIssueDate: group._max.issueDate,
    }))
    .sort((a, b) => (b.lastIssueDate?.getTime() ?? 0) - (a.lastIssueDate?.getTime() ?? 0));
  return {
    suppliers,
    invoiceCount: suppliers.reduce((sum, s) => sum + s.invoiceCount, 0),
    totalAmount: suppliers.reduce((sum, s) => sum + s.totalAmount, 0),
  };
}

/** Histórico de compras de un proveedor, de la más reciente a la más antigua. */
export async function listSupplierInvoices(companyId: string, supplierKey: string): Promise<ArchivedInvoice[]> {
  return prisma.archivedInvoice.findMany({
    where: { companyId, supplierKey },
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Nombres para autocompletar: proveedores ya archivados y proveedores del maestro de contactos. */
export async function listSupplierSuggestions(companyId: string): Promise<Array<{ name: string; contactId: string | null }>> {
  const [archived, contacts] = await Promise.all([
    prisma.archivedInvoice.findMany({ where: { companyId }, distinct: ['supplierKey'], select: { supplierName: true, contactId: true }, take: 500 }),
    prisma.contact.findMany({ where: { companyId, isSupplier: true }, select: { id: true, razonSocial: true, nombreFantasia: true }, orderBy: { razonSocial: 'asc' }, take: 500 }),
  ]);
  const seen = new Set<string>();
  const out: Array<{ name: string; contactId: string | null }> = [];
  for (const contact of contacts) {
    const name = contact.nombreFantasia || contact.razonSocial;
    if (seen.has(supplierKeyOf(name))) continue;
    seen.add(supplierKeyOf(name));
    out.push({ name, contactId: contact.id });
  }
  for (const row of archived) {
    if (seen.has(supplierKeyOf(row.supplierName))) continue;
    seen.add(supplierKeyOf(row.supplierName));
    out.push({ name: row.supplierName, contactId: row.contactId });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es-CL'));
}

export interface ArchivedFile {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export async function createArchivedInvoice(companyId: string, userId: string, data: ArchivedInvoiceInput, file: ArchivedFile): Promise<ArchivedInvoice> {
  // El contacto se valida contra la empresa: un id de otra empresa se ignora.
  const contact = data.contactId
    ? await prisma.contact.findFirst({ where: { id: data.contactId, companyId }, select: { id: true } })
    : null;
  return prisma.archivedInvoice.create({
    data: {
      companyId,
      supplierName: data.supplierName,
      supplierKey: supplierKeyOf(data.supplierName),
      contactId: contact?.id ?? null,
      invoiceNumber: data.invoiceNumber ?? null,
      issueDate: data.issueDate,
      totalAmount: data.totalAmount,
      fileUrl: file.url,
      mimeType: file.mimeType,
      fileSizeBytes: file.sizeBytes,
      notes: data.notes ?? null,
      createdByUserId: userId,
    },
  });
}

/** Elimina una factura del archivo. Devuelve la URL del archivo para borrarlo del almacenamiento, o null si no existía. */
export async function deleteArchivedInvoice(companyId: string, id: string): Promise<string | null> {
  const invoice = await prisma.archivedInvoice.findFirst({ where: { id, companyId }, select: { fileUrl: true } });
  if (!invoice) return null;
  await prisma.archivedInvoice.deleteMany({ where: { id, companyId } });
  return invoice.fileUrl;
}
