import { prisma } from '@/lib/prisma';
import { signForSalesDteType, signForPurchaseDocumentType, TAXABLE_SALES_DTE_TYPES, TAXABLE_PURCHASE_DOCUMENT_TYPES } from '@/lib/chile/document-sign';

/**
 * Rango de fechas del reporte. Ambos extremos inclusive; `to` se extiende al
 * final del día para no perder documentos emitidos ese mismo día.
 */
export interface ReportRange {
  from: Date;
  to: Date;
}

export interface ProductRow {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  gestionaStock: boolean;
  pmp: number;
  precioNeto: number;
  precioBruto: number;
  stockMinimo: number;
  stockTotal: number;
  valorizado: number;
  margenUnitario: number;
}

export interface InventoryRow {
  sku: string;
  producto: string;
  bodega: string;
  cantidad: number;
  pmp: number;
  valorizado: number;
  stockMinimo: number;
  bajoMinimo: boolean;
}

export interface KardexRow {
  fecha: Date;
  sku: string;
  producto: string;
  bodega: string;
  tipo: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  stockAnterior: number;
  stockNuevo: number;
  pmpAnterior: number;
  pmpNuevo: number;
  referencia: string;
}

export interface SalesRow {
  fecha: Date;
  tipoDte: string;
  folio: number | null;
  estado: string;
  cliente: string;
  rutCliente: string;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  pagado: number;
  saldo: number;
  estadoPago: string;
  costoVenta: number;
  margen: number;
}

export interface SalesDetailRow {
  fecha: Date;
  tipoDte: string;
  folio: number | null;
  cliente: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  exento: boolean;
  neto: number;
  iva: number;
  total: number;
  costoUnitario: number;
  margenLinea: number;
}

export interface PurchaseRow {
  fecha: Date;
  tipoDoc: string;
  folio: string;
  estado: string;
  proveedor: string;
  rutProveedor: string;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  pagado: number;
  saldo: number;
  estadoPago: string;
}

export interface PurchaseDetailRow {
  fecha: Date;
  tipoDoc: string;
  folio: string;
  proveedor: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  exento: boolean;
  neto: number;
  iva: number;
  total: number;
}

export interface PaymentRow {
  fecha: Date;
  direccion: string;
  contraparte: string;
  medioPago: string;
  documento: string;
  monto: number;
  referencia: string;
}

/**
 * Resumen comercial y tributario del período, con el signo de Notas de
 * Crédito/Débito ya aplicado. Antes el panel del workbook sumaba estas
 * columnas directo con SUMIFS de Excel sin distinguir signo: una Nota de
 * Crédito duplicaba en vez de cancelar la venta y el IVA que corregía. Vive
 * acá, calculado en JS con la misma regla que `f29.ts`, y el workbook lo usa
 * como valor fijo en vez de reinventar la suma con signo en una fórmula.
 *
 * No es el F29 real: no arrastra remanente de crédito de meses anteriores
 * (el rango del reporte no tiene por qué coincidir con un mes calendario).
 * Para la declaración F29 real, con remanente, usar la pantalla de Tesorería.
 */
export interface TaxSummary {
  ventasNetas: number;
  ventasExentas: number;
  costoVentas: number;
  margenBruto: number;
  ivaDebito: number;
  ivaCredito: number;
  ivaAPagarOFavor: number;
  ppmEstimado: number;
}

export interface ReportDataset {
  empresa: { razonSocial: string; rut: string };
  rango: ReportRange;
  generadoEn: Date;
  productos: ProductRow[];
  inventario: InventoryRow[];
  kardex: KardexRow[];
  ventas: SalesRow[];
  ventasDetalle: SalesDetailRow[];
  compras: PurchaseRow[];
  comprasDetalle: PurchaseDetailRow[];
  pagos: PaymentRow[];
  resumenTributario: TaxSummary;
}

const DTE_LABEL: Record<string, string> = {
  COTIZACION: 'Cotización',
  FACTURA_33: 'Factura Electrónica (33)',
  FACTURA_EXENTA_34: 'Factura Exenta (34)',
  BOLETA_39: 'Boleta Electrónica (39)',
  GUIA_DESPACHO_52: 'Guía de Despacho (52)',
  NOTA_CREDITO_61: 'Nota de Crédito (61)',
  NOTA_DEBITO_56: 'Nota de Débito (56)',
};

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE_IN: 'Entrada por compra',
  SALE_OUT: 'Salida por venta',
  ADJUSTMENT_IN: 'Ajuste (entrada)',
  ADJUSTMENT_OUT: 'Ajuste (salida)',
  TRANSFER: 'Transferencia',
};

const label = (map: Record<string, string>, key: string) => map[key] ?? key;

/**
 * Reúne todo lo exportable a Excel en una sola pasada. Cada consulta filtra por
 * `companyId`: este dataset cruza la frontera hacia un archivo descargable, así
 * que una fuga entre empresas aquí sería definitiva.
 */
export async function buildReportDataset(companyId: string, range: ReportRange): Promise<ReportDataset> {
  const period = { gte: range.from, lte: range.to };

  const [company, products, stocks, movements, salesDocs, purchaseDocs, payments, settings] = await Promise.all([
    prisma.company.findFirst({ where: { id: companyId }, select: { businessName: true, rut: true } }),
    prisma.product.findMany({
      where: { companyId },
      include: { category: true, stocks: true },
      orderBy: { name: 'asc' },
    }),
    prisma.stock.findMany({
      where: { companyId },
      include: { product: true, warehouse: true },
      orderBy: [{ product: { name: 'asc' } }, { warehouse: { name: 'asc' } }],
    }),
    prisma.inventoryMovement.findMany({
      where: { companyId, createdAt: period },
      include: { product: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salesDocument.findMany({
      where: { companyId, issueDate: period },
      include: { contact: true, items: { include: { product: true } } },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.purchaseDocument.findMany({
      where: { companyId, issueDate: period },
      include: { contact: true, items: { include: { product: true } } },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.payment.findMany({
      where: { companyId, paymentDate: period },
      include: { contact: true, salesDocument: true, purchaseDocument: true },
      orderBy: { paymentDate: 'desc' },
    }),
    prisma.companySettings.findUnique({ where: { companyId } }),
  ]);

  // Solo documentos emitidos Y de un tipo tributario real entran a la
  // declaración. Una Guía de Despacho o una Cotización quedan afuera: no
  // declaran IVA por sí solas, y sumarlas aparte duplicaba la venta cuando la
  // Factura diferida que las formaliza también quedaba ISSUED — mismo
  // criterio que ya usa `calculateAndStoreF29`.
  const issuedSales = salesDocs.filter((d) => d.status === 'ISSUED' && TAXABLE_SALES_DTE_TYPES.includes(d.dteType));
  const issuedPurchases = purchaseDocs.filter((d) => d.status === 'ISSUED' && TAXABLE_PURCHASE_DOCUMENT_TYPES.includes(d.documentType));

  const ventasNetas = issuedSales.reduce((sum, d) => sum + signForSalesDteType(d.dteType) * d.netAmount, 0);
  const ventasExentas = issuedSales.reduce((sum, d) => sum + signForSalesDteType(d.dteType) * d.exemptAmount, 0);
  const ivaDebito = issuedSales.reduce((sum, d) => sum + signForSalesDteType(d.dteType) * d.ivaAmount, 0);
  const costoVentas = issuedSales.reduce((sum, d) => {
    const costo = d.items.reduce((s, i) => s + Math.round(i.unitCostPMP * i.quantity), 0);
    return sum + signForSalesDteType(d.dteType) * costo;
  }, 0);
  const ivaCredito = issuedPurchases.reduce((sum, d) => sum + signForPurchaseDocumentType(d.documentType) * d.ivaAmount, 0);
  const ppmRateBasisPoints = settings?.ppmRateBasisPoints ?? 100;
  const ppmEstimado = Math.round((Math.max(0, ventasNetas + ventasExentas) * ppmRateBasisPoints) / 10000);

  const resumenTributario: TaxSummary = {
    ventasNetas,
    ventasExentas,
    costoVentas,
    margenBruto: ventasNetas - costoVentas,
    ivaDebito,
    ivaCredito,
    ivaAPagarOFavor: ivaDebito - ivaCredito,
    ppmEstimado,
  };

  const productos: ProductRow[] = products.map((p) => {
    const stockTotal = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
    return {
      sku: p.sku,
      nombre: p.name,
      categoria: p.category?.name ?? 'Sin categoría',
      unidad: p.unit,
      gestionaStock: p.isTrackable,
      pmp: p.costPricePMP,
      precioNeto: p.netPrice,
      precioBruto: p.grossPrice,
      stockMinimo: p.minStock,
      stockTotal,
      valorizado: Math.round(stockTotal * p.costPricePMP),
      margenUnitario: Math.round(p.netPrice - p.costPricePMP),
    };
  });

  const inventario: InventoryRow[] = stocks.map((s) => ({
    sku: s.product.sku,
    producto: s.product.name,
    bodega: s.warehouse.name,
    cantidad: s.quantity,
    pmp: s.product.costPricePMP,
    valorizado: Math.round(s.quantity * s.product.costPricePMP),
    stockMinimo: s.product.minStock,
    bajoMinimo: s.quantity < s.product.minStock,
  }));

  const kardex: KardexRow[] = movements.map((m) => ({
    fecha: m.createdAt,
    sku: m.product.sku,
    producto: m.product.name,
    bodega: m.warehouse.name,
    tipo: label(MOVEMENT_LABEL, m.type),
    cantidad: m.quantity,
    costoUnitario: m.unitCost,
    costoTotal: m.totalCost,
    stockAnterior: m.previousStock,
    stockNuevo: m.newStock,
    pmpAnterior: m.previousPmp,
    pmpNuevo: m.newPmp,
    referencia: m.reference ?? '',
  }));

  const ventas: SalesRow[] = salesDocs.map((d) => {
    const costoVenta = d.items.reduce((sum, i) => sum + Math.round(i.unitCostPMP * i.quantity), 0);
    return {
      fecha: d.issueDate,
      tipoDte: label(DTE_LABEL, d.dteType),
      folio: d.folio,
      estado: d.status,
      cliente: d.contact.razonSocial,
      rutCliente: d.contact.rut,
      neto: d.netAmount,
      exento: d.exemptAmount,
      iva: d.ivaAmount,
      total: d.totalAmount,
      pagado: d.paidAmount,
      saldo: d.totalAmount - d.paidAmount,
      estadoPago: d.paymentStatus,
      costoVenta,
      margen: d.netAmount - costoVenta,
    };
  });

  const ventasDetalle: SalesDetailRow[] = salesDocs.flatMap((d) =>
    d.items.map((i) => ({
      fecha: d.issueDate,
      tipoDte: label(DTE_LABEL, d.dteType),
      folio: d.folio,
      cliente: d.contact.razonSocial,
      sku: i.sku ?? i.product?.sku ?? '',
      descripcion: i.description,
      cantidad: i.quantity,
      precioUnitario: i.unitPrice,
      descuentoPct: i.discountPercent,
      exento: i.isExempt,
      neto: i.subtotal,
      iva: i.iva,
      total: i.total,
      costoUnitario: i.unitCostPMP,
      margenLinea: i.subtotal - Math.round(i.unitCostPMP * i.quantity),
    }))
  );

  const compras: PurchaseRow[] = purchaseDocs.map((d) => ({
    fecha: d.issueDate,
    tipoDoc: d.documentType,
    folio: d.folio,
    estado: d.status,
    proveedor: d.contact.razonSocial,
    rutProveedor: d.contact.rut,
    neto: d.netAmount,
    exento: d.exemptAmount,
    iva: d.ivaAmount,
    total: d.totalAmount,
    pagado: d.paidAmount,
    saldo: d.totalAmount - d.paidAmount,
    estadoPago: d.paymentStatus,
  }));

  const comprasDetalle: PurchaseDetailRow[] = purchaseDocs.flatMap((d) =>
    d.items.map((i) => ({
      fecha: d.issueDate,
      tipoDoc: d.documentType,
      folio: d.folio,
      proveedor: d.contact.razonSocial,
      sku: i.product?.sku ?? '',
      descripcion: i.description,
      cantidad: i.quantity,
      costoUnitario: i.unitCost,
      exento: i.isExempt,
      neto: i.subtotal,
      iva: i.iva,
      total: i.total,
    }))
  );

  const pagos: PaymentRow[] = payments.map((p) => ({
    fecha: p.paymentDate,
    direccion: p.type === 'INCOME' ? 'Ingreso' : 'Egreso',
    contraparte: p.contact?.razonSocial ?? '',
    medioPago: p.paymentMethod,
    documento: p.salesDocument
      ? `Venta folio ${p.salesDocument.folio ?? '-'}`
      : p.purchaseDocument
        ? `Compra folio ${p.purchaseDocument.folio}`
        : (p.description ?? ''),
    monto: p.amount,
    referencia: p.referenceNumber ?? '',
  }));

  return {
    empresa: { razonSocial: company?.businessName ?? '', rut: company?.rut ?? '' },
    rango: range,
    generadoEn: new Date(),
    productos,
    inventario,
    kardex,
    ventas,
    ventasDetalle,
    compras,
    comprasDetalle,
    pagos,
    resumenTributario,
  };
}
