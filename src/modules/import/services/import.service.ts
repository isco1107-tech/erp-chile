import { prisma } from '@/lib/prisma';
import { cleanRut, formatRut, validateRut } from '@/lib/chile/rut';
import { calculateGrossPrice, calculateNeto } from '@/lib/chile/tax';
import { BATCH_TX_OPTIONS } from '@/lib/prisma-tx';
import { constraintInvolves, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { registerStockIn } from '@/modules/inventory/services/stock.service';
import { createPurchaseDocument, enrichPurchaseDocumentWithItems } from '@/modules/purchases/services/purchases.service';
import { importHistoricalSalesDocument } from '@/modules/sales/services/historical-import.service';
import { type HeaderMapping, mapHeaders, normalizeHeader, type RawSheet, readSpreadsheet } from './parse.service';
import { suggestProductMatch, type ScanProduct } from './product-match.service';
import {
  type AiScanItemLine,
  DTE_TYPE_TEXT_MAP,
  IMPORT_COLUMNS,
  PURCHASE_DOC_TYPE_TEXT_MAP,
  type CommitRowError,
  type ImportEntity,
  type ImportPreview,
  type ImportResult,
  type ParsedRow,
  type RowError,
} from '../schema';

/**
 * Prefijo reservado para `AiScanItemLine.productId` cuando una línea
 * no encontró coincidencia en el catálogo: marca que el producto debe CREARSE al
 * confirmar (`commitHistoricalRows`), en vez de quedar como línea informativa.
 */
const NEW_PRODUCT_PLACEHOLDER_PREFIX = 'new:';

const UNITS = ['UN', 'KG', 'MT', 'LTS', 'CJA', 'PAR'];

/**
 * Convierte un texto de planilla a número, aceptando formatos chilenos e ingleses.
 */
function parseChileanNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const lastSeparator = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastSeparator === -1) {
    normalized = cleaned;
  } else if (cleaned.length - lastSeparator - 1 === 3) {
    normalized = cleaned.replace(/[.,]/g, '');
  } else if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** CLP entero: redondea al final. */
export function parseChileanInteger(raw: string): number | null {
  const value = parseChileanNumber(raw);
  return value === null ? null : Math.round(value);
}

/** Cantidades: conserva decimales. */
export function parseChileanDecimal(raw: string): number | null {
  return parseChileanNumber(raw);
}

interface ValidationContext {
  companyId: string;
  existingKeys: Set<string>;
  seenKeys: Map<string, number>;
}

function validateProductRow(values: Record<string, string>, rowNumber: number, ctx: ValidationContext): RowError[] {
  const errors: RowError[] = [];

  const sku = values.sku?.trim() ?? '';
  if (!sku) {
    errors.push({ column: 'SKU', message: 'El SKU es obligatorio' });
  } else {
    const key = sku.toLowerCase();
    const duplicateAt = ctx.seenKeys.get(key);
    if (duplicateAt !== undefined) {
      errors.push({ column: 'SKU', message: `SKU duplicado dentro del archivo (ya aparece en la fila ${duplicateAt})` });
    } else {
      ctx.seenKeys.set(key, rowNumber);
    }
    if (ctx.existingKeys.has(key)) {
      errors.push({ column: 'SKU', message: 'Ya existe un producto con este SKU en tu catálogo' });
    }
  }

  if (!values.name?.trim()) errors.push({ column: 'Nombre', message: 'El nombre es obligatorio' });

  const rawPrice = values.netPrice?.trim() ?? '';
  if (!rawPrice) {
    errors.push({ column: 'Precio Neto', message: 'El precio neto es obligatorio' });
  } else {
    const price = parseChileanInteger(rawPrice);
    if (price === null) errors.push({ column: 'Precio Neto', message: `"${rawPrice}" no es un número válido` });
    else if (price < 0) errors.push({ column: 'Precio Neto', message: 'El precio no puede ser negativo' });
  }

  const unit = values.unit?.trim().toUpperCase();
  if (unit && !UNITS.includes(unit)) {
    errors.push({ column: 'Unidad', message: `Unidad "${unit}" no reconocida. Use: ${UNITS.join(', ')}` });
  }

  const rawMinStock = values.minStock?.trim();
  if (rawMinStock) {
    const minStock = parseChileanInteger(rawMinStock);
    if (minStock === null || minStock < 0) {
      errors.push({ column: 'Stock Mínimo', message: `"${rawMinStock}" no es un número válido` });
    }
  }

  const rawExempt = values.isExempt?.trim();
  if (rawExempt && parseBoolean(rawExempt) === null) {
    errors.push({ column: 'Exento IVA', message: `"${rawExempt}" no se entiende. Use sí/no, 1/0 o true/false` });
  }

  return errors;
}

const TRUTHY = ['si', 'sí', 'true', '1', 'x', 'exento', 'verdadero'];
const FALSY = ['no', 'false', '0', '', 'afecto', 'falso'];

/** Interpreta el sí/no de la planilla. */
export function parseBoolean(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (TRUTHY.includes(normalized)) return true;
  if (FALSY.includes(normalized)) return false;
  return null;
}

/**
 * Interpreta una fecha a formato ISO YYYY-MM-DD.
 */
export function parseChileanDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isValidDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    return isValidDate(Number(y), Number(mm), Number(dd)) ? `${y}-${mm}-${dd}` : null;
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateContactRow(values: Record<string, string>, rowNumber: number, ctx: ValidationContext): RowError[] {
  const errors: RowError[] = [];

  const rut = values.rut?.trim() ?? '';
  if (!rut) {
    errors.push({ column: 'RUT', message: 'El RUT es obligatorio' });
  } else if (!validateRut(rut)) {
    errors.push({ column: 'RUT', message: `"${rut}" no supera la validación de dígito verificador (Módulo 11)` });
  } else {
    const key = cleanRut(rut);
    const duplicateAt = ctx.seenKeys.get(key);
    if (duplicateAt !== undefined) {
      errors.push({ column: 'RUT', message: `RUT duplicado dentro del archivo (ya aparece en la fila ${duplicateAt})` });
    } else {
      ctx.seenKeys.set(key, rowNumber);
    }
    if (ctx.existingKeys.has(key)) {
      errors.push({ column: 'RUT', message: 'Ya existe un contacto con este RUT en tu empresa' });
    }
  }

  if (!values.razonSocial?.trim()) {
    errors.push({ column: 'Razón Social', message: 'La razón social es obligatoria' });
  }

  const email = values.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ column: 'Email', message: `"${email}" no es un correo válido` });
  }

  const tipo = values.tipo?.trim().toLowerCase();
  if (tipo && !['cliente', 'proveedor', 'ambos'].includes(tipo)) {
    errors.push({ column: 'Tipo', message: `"${tipo}" no reconocido. Use: cliente, proveedor o ambos` });
  }

  return errors;
}

async function loadExistingKeys(companyId: string, entity: 'products' | 'contacts'): Promise<Set<string>> {
  if (entity === 'products') {
    const products = await prisma.product.findMany({ where: { companyId }, select: { sku: true } });
    return new Set(products.map((p) => p.sku.toLowerCase()));
  }
  const contacts = await prisma.contact.findMany({ where: { companyId }, select: { rutClean: true } });
  return new Set(contacts.map((c) => c.rutClean));
}

// ---------------------------------------------------------------------------
// Stock inicial
// ---------------------------------------------------------------------------

interface StockValidationContext {
  products: Map<string, { id: string; name: string; isTrackable: boolean }>;
  warehouses: Map<string, { id: string; name: string }>;
  defaultWarehouseId?: string;
}

async function loadStockContext(companyId: string): Promise<StockValidationContext> {
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ where: { companyId }, select: { id: true, sku: true, name: true, isTrackable: true } }),
    prisma.warehouse.findMany({ where: { companyId }, select: { id: true, code: true, name: true, isDefault: true } }),
  ]);
  const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  return {
    products: new Map(products.map((p) => [p.sku.toLowerCase(), { id: p.id, name: p.name, isTrackable: p.isTrackable }])),
    warehouses: new Map(warehouses.map((w) => [w.code.toLowerCase(), { id: w.id, name: w.name }])),
    defaultWarehouseId: defaultWarehouse?.id,
  };
}

function validateStockRow(values: Record<string, string>, _rowNumber: number, ctx: StockValidationContext): RowError[] {
  const errors: RowError[] = [];

  const sku = values.sku?.trim() ?? '';
  if (!sku) {
    errors.push({ column: 'SKU', message: 'El SKU es obligatorio' });
  } else {
    const product = ctx.products.get(sku.toLowerCase());
    if (!product) {
      errors.push({ column: 'SKU', message: `No existe un producto con SKU "${sku}" en tu catálogo. Impórtalo primero` });
    } else if (!product.isTrackable) {
      errors.push({ column: 'SKU', message: `"${product.name}" no gestiona stock (no es trackeable)` });
    }
  }

  const warehouseCode = values.warehouseCode?.trim();
  if (warehouseCode) {
    if (!ctx.warehouses.has(warehouseCode.toLowerCase())) {
      errors.push({ column: 'Código Bodega', message: `No existe una bodega con código "${warehouseCode}"` });
    }
  } else if (!ctx.defaultWarehouseId) {
    errors.push({ column: 'Código Bodega', message: 'No hay una bodega por defecto configurada; indique el código de bodega' });
  }

  const rawQuantity = values.quantity?.trim() ?? '';
  if (!rawQuantity) {
    errors.push({ column: 'Cantidad', message: 'La cantidad es obligatoria' });
  } else {
    const quantity = parseChileanDecimal(rawQuantity);
    if (quantity === null || quantity <= 0) errors.push({ column: 'Cantidad', message: `"${rawQuantity}" no es una cantidad válida` });
  }

  const rawCost = values.unitCost?.trim() ?? '';
  if (!rawCost) {
    errors.push({ column: 'Costo Unitario', message: 'El costo unitario es obligatorio' });
  } else {
    const cost = parseChileanInteger(rawCost);
    if (cost === null || cost < 0) errors.push({ column: 'Costo Unitario', message: `"${rawCost}" no es un número válido` });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Contexto para compras y ventas históricas
// ---------------------------------------------------------------------------

export interface ContactLookupContext {
  contactsByRut: Map<string, { id: string; razonSocial: string }>;
  seenFolios: Map<string, number>;
}

export async function loadContactLookupContext(companyId: string): Promise<ContactLookupContext> {
  const contacts = await prisma.contact.findMany({ where: { companyId }, select: { id: true, rutClean: true, razonSocial: true } });
  return {
    contactsByRut: new Map(contacts.map((c) => [c.rutClean, { id: c.id, razonSocial: c.razonSocial }])),
    seenFolios: new Map(),
  };
}

/**
 * Valida una fila de venta histórica.
 * REGLA: Si el RUT no existe en la base, NO se marca como error (se registrará automáticamente).
 */
export function validateHistoricalSalesRow(
  values: Record<string, string>,
  rowNumber: number,
  ctx: ContactLookupContext,
  _hasItems = false
): RowError[] {
  const errors: RowError[] = [];

  const rut = values.contactRut?.trim() ?? '';
  if (!rut) {
    errors.push({ column: 'RUT Cliente', message: 'El RUT del cliente es obligatorio' });
  } else if (!validateRut(rut)) {
    errors.push({ column: 'RUT Cliente', message: `"${rut}" no supera la validación de dígito verificador (Módulo 11)` });
  }

  const dteTypeRaw = values.dteType?.trim() ?? '';
  let dteType: string | undefined;
  if (!dteTypeRaw) {
    errors.push({ column: 'Tipo de Documento', message: 'El tipo de documento es obligatorio' });
  } else {
    dteType = DTE_TYPE_TEXT_MAP[normalizeHeader(dteTypeRaw)];
    if (!dteType) {
      errors.push({ column: 'Tipo de Documento', message: `"${dteTypeRaw}" no se reconoce. Use: Factura, Factura Exenta, Boleta, Guía de Despacho o Nota de Crédito` });
    }
  }

  const folioRaw = values.folio?.trim() ?? '';
  if (!folioRaw) {
    errors.push({ column: 'Folio', message: 'El folio es obligatorio' });
  } else {
    const folio = parseChileanInteger(folioRaw);
    if (folio === null || folio <= 0) {
      errors.push({ column: 'Folio', message: `"${folioRaw}" no es un folio válido` });
    } else if (dteType) {
      const key = `${dteType}|${folio}`;
      const duplicateAt = ctx.seenFolios.get(key);
      if (duplicateAt !== undefined && duplicateAt !== rowNumber) {
        errors.push({ column: 'Folio', message: `Folio duplicado dentro del archivo (ya aparece en la fila ${duplicateAt})` });
      } else {
        ctx.seenFolios.set(key, rowNumber);
      }
    }
  }

  const issueDateRaw = values.issueDate?.trim() ?? '';
  if (!issueDateRaw) {
    errors.push({ column: 'Fecha Emisión', message: 'La fecha de emisión es obligatoria' });
  } else if (!parseChileanDate(issueDateRaw)) {
    errors.push({ column: 'Fecha Emisión', message: `"${issueDateRaw}" no se reconoce como fecha. Use AAAA-MM-DD o DD-MM-AAAA` });
  }

  const rawPaid = values.paid?.trim();
  if (rawPaid && parseBoolean(rawPaid) === null) {
    errors.push({ column: 'Pagado', message: `"${rawPaid}" no se entiende. Use sí/no` });
  }

  return errors;
}

/**
 * Valida una fila de compra histórica.
 * REGLA: Si el RUT no existe en la base, NO se marca como error (se registrará automáticamente).
 */
export function validateHistoricalPurchasesRow(
  values: Record<string, string>,
  rowNumber: number,
  ctx: ContactLookupContext,
  _hasItems = false
): RowError[] {
  const errors: RowError[] = [];

  const rut = values.contactRut?.trim() ?? '';
  let rutClean: string | undefined;
  if (!rut) {
    errors.push({ column: 'RUT Proveedor', message: 'El RUT del proveedor es obligatorio' });
  } else if (!validateRut(rut)) {
    errors.push({ column: 'RUT Proveedor', message: `"${rut}" no supera la validación de dígito verificador (Módulo 11)` });
  } else {
    rutClean = cleanRut(rut);
  }

  const documentTypeRaw = values.documentType?.trim() ?? '';
  if (!documentTypeRaw) {
    errors.push({ column: 'Tipo de Documento', message: 'El tipo de documento es obligatorio' });
  } else if (!PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader(documentTypeRaw)]) {
    errors.push({ column: 'Tipo de Documento', message: `"${documentTypeRaw}" no se reconoce. Use: Factura, Boleta, Guía de Despacho, Nota de Crédito u Otro` });
  }

  const folio = values.folio?.trim() ?? '';
  if (!folio) {
    errors.push({ column: 'Folio', message: 'El folio del documento del proveedor es obligatorio' });
  } else if (rutClean) {
    const key = `${rutClean}|${folio}`;
    const duplicateAt = ctx.seenFolios.get(key);
    if (duplicateAt !== undefined && duplicateAt !== rowNumber) {
      errors.push({ column: 'Folio', message: `Folio duplicado dentro del archivo para este proveedor (ya aparece en la fila ${duplicateAt})` });
    } else {
      ctx.seenFolios.set(key, rowNumber);
    }
  }

  const issueDateRaw = values.issueDate?.trim() ?? '';
  if (!issueDateRaw) {
    errors.push({ column: 'Fecha Emisión', message: 'La fecha de emisión es obligatoria' });
  } else if (!parseChileanDate(issueDateRaw)) {
    errors.push({ column: 'Fecha Emisión', message: `"${issueDateRaw}" no se reconoce como fecha. Use AAAA-MM-DD o DD-MM-AAAA` });
  }

  const rawPaid = values.paid?.trim();
  if (rawPaid && parseBoolean(rawPaid) === null) {
    errors.push({ column: 'Pagado', message: `"${rawPaid}" no se entiende. Use sí/no` });
  }

  return errors;
}

const COMBINING_DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

/**
 * Genera un SKU único legible basado en el nombre.
 */
function generateProductSku(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(COMBINING_DIACRITICS, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'PRODUCTO';

  let sku = base;
  let suffix = 1;
  while (taken.has(sku.toLowerCase())) {
    suffix++;
    sku = `${base}-${suffix}`;
  }
  taken.add(sku.toLowerCase());
  return sku;
}

/**
 * Resuelve un producto en el catálogo o lo crea automáticamente si no existe.
 */
async function resolvePlaceholderProduct(
  companyId: string,
  placeholderId: string,
  description: string,
  netUnitPrice: number,
  takenSkus: Set<string>,
  createdPlaceholders: Map<string, string>,
  explicitSku?: string
): Promise<string> {
  const cached = createdPlaceholders.get(placeholderId);
  if (cached) return cached;

  const trimmedSku = explicitSku?.trim();
  if (trimmedSku) {
    const existing = await prisma.product.findUnique({
      where: { companyId_sku: { companyId, sku: trimmedSku } },
    });
    if (existing) {
      createdPlaceholders.set(placeholderId, existing.id);
      return existing.id;
    }
  }

  const sku = trimmedSku || generateProductSku(description, takenSkus);
  const netPrice = Math.max(0, Math.round(netUnitPrice));
  const created = await prisma.product.create({
    data: {
      companyId,
      sku,
      name: description.trim().slice(0, 200) || sku,
      unit: 'UN',
      isExempt: false,
      netPrice,
      grossPrice: calculateGrossPrice(netPrice, false),
      costPricePMP: netPrice,
      minStock: 0,
    },
  });
  createdPlaceholders.set(placeholderId, created.id);
  takenSkus.add(sku.toLowerCase());
  return created.id;
}

async function resolveDefaultWarehouseId(companyId: string): Promise<string | undefined> {
  const preferred = await prisma.warehouse.findFirst({ where: { companyId, isDefault: true } });
  if (preferred) return preferred.id;
  const any = await prisma.warehouse.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } });
  return any?.id;
}

function toRowMessage(error: unknown): string {
  if (constraintInvolves(error, 'folio', 'dteType', 'contactId', 'companyId')) {
    return 'Ya existe un documento con este folio (posible carrera con otra importación simultánea)';
  }
  return toFriendlyErrorMessage(error);
}

async function loadProductsForMatching(companyId: string): Promise<ScanProduct[]> {
  return prisma.product.findMany({ where: { companyId }, select: { id: true, sku: true, name: true, isExempt: true } });
}

/**
 * Construye la vista previa para ventas o compras históricas con formato línea a línea.
 * Agrupa automáticamente las filas por (RUT + Tipo de Documento + Folio).
 */
async function buildLineItemPreview(
  companyId: string,
  entity: 'historicalSales' | 'historicalPurchases',
  sheet: RawSheet,
  fileName: string,
  mapping: HeaderMapping
): Promise<ImportPreview> {
  const specs = IMPORT_COLUMNS[entity];

  const rawLines = sheet.rows.map((raw, i) => {
    const rowNumber = i + 2;
    const values: Record<string, string> = {};
    for (const spec of specs) {
      const index = mapping.columnIndex[spec.key];
      values[spec.key] = index === undefined ? '' : (raw[index] ?? '').trim();
    }
    return { rowNumber, values };
  });

  const docTypeField = entity === 'historicalSales' ? 'dteType' : 'documentType';

  const groupOrder: string[] = [];
  const groups = new Map<string, { rowNumbers: number[]; lines: typeof rawLines }>();

  for (const line of rawLines) {
    const rutClean = line.values.contactRut ? cleanRut(line.values.contactRut) : '';
    const docTypeNormalized = line.values[docTypeField] ? normalizeHeader(line.values[docTypeField]) : '';
    const folio = line.values.folio?.trim() ?? '';

    const naturalKey = rutClean && docTypeNormalized && folio ? `${rutClean}|${docTypeNormalized}|${folio}` : '';
    const docId = naturalKey || `__fila_${line.rowNumber}__`;

    if (!groups.has(docId)) {
      groups.set(docId, { rowNumbers: [], lines: [] });
      groupOrder.push(docId);
    }
    const group = groups.get(docId)!;
    group.rowNumbers.push(line.rowNumber);
    group.lines.push(line);
  }

  const ctx = await loadContactLookupContext(companyId);
  const catalogProducts = await loadProductsForMatching(companyId);
  const newProductPool: ScanProduct[] = [];
  let placeholderSeq = 0;

  const rows: ParsedRow[] = groupOrder.map((docId) => {
    const group = groups.get(docId)!;
    const first = group.lines[0];
    const rowNumber = group.rowNumbers[0];
    const groupErrors: RowError[] = [];

    if (docId.startsWith('__fila_')) {
      groupErrors.push({
        column: 'RUT',
        message: 'Esta línea no tiene RUT, Tipo de Documento y Folio para agruparla con el resto de su documento',
      });
    }

    // Consistencia entre líneas del mismo grupo
    for (const line of group.lines.slice(1)) {
      if (
        cleanRut(line.values.contactRut) !== cleanRut(first.values.contactRut) ||
        normalizeHeader(line.values[docTypeField]) !== normalizeHeader(first.values[docTypeField]) ||
        line.values.folio?.trim() !== first.values.folio?.trim() ||
        line.values.issueDate?.trim() !== first.values.issueDate?.trim()
      ) {
        groupErrors.push({
          column: 'Folio',
          message: `Las líneas del documento folio "${first.values.folio}" no coinciden en RUT/Tipo/Folio/Fecha (revisa la fila ${line.rowNumber})`,
        });
        break;
      }
    }

    const items: AiScanItemLine[] = group.lines.map((line) => {
      const description = line.values.productDetail?.trim() || 'Producto sin descripción';
      const quantityRaw = parseChileanDecimal(line.values.quantity ?? '');
      const quantity = quantityRaw !== null && quantityRaw > 0 ? quantityRaw : 1;
      const unitPriceRaw = parseChileanInteger(line.values.unitPrice ?? '') ?? 0;
      const explicitSku = line.values.productSku?.trim();

      let realMatch = explicitSku
        ? catalogProducts.find((p) => p.sku?.toLowerCase() === explicitSku.toLowerCase()) ?? null
        : null;

      if (!realMatch) {
        realMatch = suggestProductMatch(description, catalogProducts);
      }

      const poolMatch = !realMatch ? suggestProductMatch(description, newProductPool) : null;

      let productId: string;
      let productLabel: string;
      if (realMatch) {
        productId = realMatch.id;
        productLabel = realMatch.name;
      } else if (poolMatch) {
        productId = poolMatch.id;
        productLabel = `(nuevo) ${poolMatch.name}`;
      } else {
        const id = `${NEW_PRODUCT_PLACEHOLDER_PREFIX}${++placeholderSeq}`;
        newProductPool.push({ id, name: description, isExempt: false });
        productId = id;
        productLabel = `(nuevo) ${description}`;
      }

      return {
        localId: `item-${line.rowNumber}`,
        description,
        quantity,
        unitPrice: Math.max(0, unitPriceRaw),
        productId,
        productLabel,
      };
    });

    const sumOfLinesNeto = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const declaredNet = first.values.netAmount ? parseChileanInteger(first.values.netAmount) : null;
    const finalNeto = declaredNet !== null ? declaredNet : sumOfLinesNeto;
    const finalIva = first.values.ivaAmount ? (parseChileanInteger(first.values.ivaAmount) ?? Math.round(finalNeto * 0.19)) : Math.round(finalNeto * 0.19);
    const finalTotal = first.values.totalAmount ? (parseChileanInteger(first.values.totalAmount) ?? finalNeto + finalIva) : finalNeto + finalIva;

    const values: Record<string, string> = {
      contactRut: first.values.contactRut,
      razonSocial: first.values.razonSocial || '',
      [docTypeField]: first.values[docTypeField],
      folio: first.values.folio,
      issueDate: first.values.issueDate,
      productSku: first.values.productSku || '',
      productDetail: first.values.productDetail || '',
      quantity: first.values.quantity || '',
      unitPrice: first.values.unitPrice || '',
      lineSubtotal: first.values.lineSubtotal || String(sumOfLinesNeto),
      netAmount: String(finalNeto),
      ivaAmount: String(finalIva),
      totalAmount: String(finalTotal),
      paid: first.values.paid || 'no',
    };

    const validator = entity === 'historicalSales' ? validateHistoricalSalesRow : validateHistoricalPurchasesRow;
    const validationErrors = validator(values, rowNumber, ctx, items.length > 0);

    for (const line of group.lines) {
      if (!line.values.productDetail?.trim()) {
        groupErrors.push({ column: 'Producto / Descripción', message: `Fila ${line.rowNumber}: el producto/descripción es obligatorio` });
      }
      const quantityRaw = parseChileanDecimal(line.values.quantity ?? '');
      if (quantityRaw === null || quantityRaw <= 0) {
        groupErrors.push({ column: 'Cantidad', message: `Fila ${line.rowNumber}: cantidad inválida ("${line.values.quantity}")` });
      }
      const unitPriceRaw = parseChileanInteger(line.values.unitPrice ?? '');
      if (unitPriceRaw === null || unitPriceRaw < 0) {
        groupErrors.push({ column: 'Precio Unitario Neto', message: `Fila ${line.rowNumber}: precio unitario neto inválido ("${line.values.unitPrice}")` });
      }
    }

    return { rowNumber, values, errors: [...groupErrors, ...validationErrors], items };
  });

  const invalidRows = rows.filter((row) => row.errors.length > 0).length;

  return {
    entity,
    fileName,
    unknownHeaders: mapping.unknownHeaders,
    missingRequiredColumns: mapping.missingRequiredColumns,
    rows,
    totalRows: rows.length,
    validRows: rows.length - invalidRows,
    invalidRows,
    truncated: sheet.truncated,
  };
}

/**
 * Lee y valida el archivo generando la vista previa.
 */
export async function buildPreview(
  companyId: string,
  entity: ImportEntity,
  file: { name: string; buffer: Buffer }
): Promise<ImportPreview> {
  const sheet = await readSpreadsheet(file);
  const mapping = mapHeaders(entity, sheet.headers);

  if (entity === 'historicalSales' || entity === 'historicalPurchases') {
    return buildLineItemPreview(companyId, entity, sheet, file.name, mapping);
  }

  const specs = IMPORT_COLUMNS[entity];

  const rawRows = sheet.rows.map((raw, i) => {
    const rowNumber = i + 2;
    const values: Record<string, string> = {};
    for (const spec of specs) {
      const index = mapping.columnIndex[spec.key];
      values[spec.key] = index === undefined ? '' : (raw[index] ?? '').trim();
    }
    return { rowNumber, values };
  });

  const rows: ParsedRow[] =
    mapping.missingRequiredColumns.length > 0
      ? rawRows.map((r) => ({ ...r, errors: [] }))
      : await validateRows(companyId, entity, rawRows);

  const invalidRows = rows.filter((row) => row.errors.length > 0).length;

  return {
    entity,
    fileName: file.name,
    unknownHeaders: mapping.unknownHeaders,
    missingRequiredColumns: mapping.missingRequiredColumns,
    rows,
    totalRows: rows.length,
    validRows: rows.length - invalidRows,
    invalidRows,
    truncated: sheet.truncated,
  };
}

/** Aplica el validador de cada entidad sobre las filas ya mapeadas a columnas. */
async function validateRows(
  companyId: string,
  entity: ImportEntity,
  rawRows: Array<{ rowNumber: number; values: Record<string, string> }>
): Promise<ParsedRow[]> {
  if (entity === 'products' || entity === 'contacts') {
    const ctx: ValidationContext = {
      companyId,
      existingKeys: await loadExistingKeys(companyId, entity),
      seenKeys: new Map(),
    };
    const validator = entity === 'products' ? validateProductRow : validateContactRow;
    return rawRows.map((row) => ({ ...row, errors: validator(row.values, row.rowNumber, ctx) }));
  }

  if (entity === 'stock') {
    const ctx = await loadStockContext(companyId);
    return rawRows.map((row) => ({ ...row, errors: validateStockRow(row.values, row.rowNumber, ctx) }));
  }

  const ctx = await loadContactLookupContext(companyId);
  const validator = entity === 'historicalSales' ? validateHistoricalSalesRow : validateHistoricalPurchasesRow;
  return rawRows.map((row) => ({ ...row, errors: validator(row.values, row.rowNumber, ctx) }));
}

/**
 * Inserta las filas de stock, ventas o compras históricas.
 * Aplica auto-creación de contactos y productos si no existen.
 */
export async function commitHistoricalRows(
  companyId: string,
  entity: 'stock' | 'historicalSales' | 'historicalPurchases',
  rows: ParsedRow[]
): Promise<ImportResult> {
  if (rows.length === 0) throw new Error('No hay filas para importar');

  const failedRows: CommitRowError[] = [];
  let created = 0;

  if (entity === 'stock') {
    const ctx = await loadStockContext(companyId);
    for (const row of rows) {
      const errors = validateStockRow(row.values, row.rowNumber, ctx);
      if (errors.length > 0) {
        failedRows.push(...errors.map((e) => ({ ...e, rowNumber: row.rowNumber })));
        continue;
      }
      try {
        const product = ctx.products.get(row.values.sku!.trim().toLowerCase())!;
        const warehouseCode = row.values.warehouseCode?.trim();
        const warehouseId = warehouseCode
          ? ctx.warehouses.get(warehouseCode.toLowerCase())!.id
          : ctx.defaultWarehouseId!;
        const quantity = parseChileanDecimal(row.values.quantity!.trim())!;
        const unitCost = parseChileanInteger(row.values.unitCost!.trim())!;

        await registerStockIn(companyId, {
          productId: product.id,
          warehouseId,
          type: 'ADJUSTMENT_IN',
          quantity,
          unitCost,
          reference: 'Importación de stock inicial',
        });
        created++;
      } catch (error) {
        failedRows.push({ column: 'General', message: toRowMessage(error), rowNumber: row.rowNumber });
      }
    }
  } else if (entity === 'historicalSales') {
    const ctx = await loadContactLookupContext(companyId);
    const warehouseId = await resolveDefaultWarehouseId(companyId);
    const takenSkus = await loadExistingKeys(companyId, 'products');
    const createdPlaceholders = new Map<string, string>();

    for (const row of rows) {
      const errors = validateHistoricalSalesRow(row.values, row.rowNumber, ctx, (row.items?.length ?? 0) > 0);
      if (!warehouseId) errors.push({ column: 'General', message: 'La empresa no tiene ninguna bodega creada' });
      if (errors.length > 0) {
        failedRows.push(...errors.map((e) => ({ ...e, rowNumber: row.rowNumber })));
        continue;
      }
      try {
        // 1. Auto-crear o actualizar contacto
        const rutClean = cleanRut(row.values.contactRut!);
        const razonSocial = row.values.razonSocial?.trim() || formatRut(rutClean);
        const contact = await prisma.contact.upsert({
          where: { companyId_rutClean: { companyId, rutClean } },
          create: {
            companyId,
            rut: formatRut(rutClean),
            rutClean,
            razonSocial,
            isCustomer: true,
            isSupplier: false,
          },
          update: {
            isCustomer: true,
            ...(row.values.razonSocial?.trim() ? { razonSocial: row.values.razonSocial.trim() } : {}),
          },
        });

        // 2. Resolver productos (crear los que no existan)
        const items = row.items && row.items.length > 0
          ? await Promise.all(
              row.items.map(async (item) => {
                let productId = item.productId ?? undefined;
                if (productId?.startsWith(NEW_PRODUCT_PLACEHOLDER_PREFIX) || (!productId && item.description)) {
                  productId = await resolvePlaceholderProduct(
                    companyId,
                    productId || `new:${item.description}`,
                    item.description,
                    item.unitPrice,
                    takenSkus,
                    createdPlaceholders,
                    row.values.productSku?.trim()
                  );
                }
                return {
                  productId: productId ?? null,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                };
              })
            )
          : undefined;

        const dteType = DTE_TYPE_TEXT_MAP[normalizeHeader(row.values.dteType!.trim())]!;
        const folioRaw = row.values.folio?.trim();
        const folio = folioRaw ? parseChileanInteger(folioRaw) : null;
        const issueDate = parseChileanDate(row.values.issueDate!.trim())!;
        const netAmount = parseChileanInteger(row.values.netAmount?.trim() ?? '') ?? 0;
        const paid = parseBoolean(row.values.paid?.trim() ?? '') ?? false;

        await importHistoricalSalesDocument(companyId, {
          contactId: contact.id,
          warehouseId: warehouseId!,
          dteType,
          folio,
          issueDate,
          netAmount,
          isExempt: false,
          paid,
          items,
        });
        created++;
      } catch (error) {
        failedRows.push({ column: 'General', message: toRowMessage(error), rowNumber: row.rowNumber });
      }
    }
  } else {
    // historicalPurchases
    const ctx = await loadContactLookupContext(companyId);
    const takenSkus = await loadExistingKeys(companyId, 'products');
    const createdPlaceholders = new Map<string, string>();

    for (const row of rows) {
      const errors = validateHistoricalPurchasesRow(row.values, row.rowNumber, ctx, (row.items?.length ?? 0) > 0);
      if (errors.length > 0) {
        failedRows.push(...errors.map((e) => ({ ...e, rowNumber: row.rowNumber })));
        continue;
      }
      try {
        // 1. Auto-crear o actualizar contacto
        const rutClean = cleanRut(row.values.contactRut!);
        const razonSocial = row.values.razonSocial?.trim() || formatRut(rutClean);
        const contact = await prisma.contact.upsert({
          where: { companyId_rutClean: { companyId, rutClean } },
          create: {
            companyId,
            rut: formatRut(rutClean),
            rutClean,
            razonSocial,
            isCustomer: false,
            isSupplier: true,
          },
          update: {
            isSupplier: true,
            ...(row.values.razonSocial?.trim() ? { razonSocial: row.values.razonSocial.trim() } : {}),
          },
        });

        // 2. Resolver productos (crear los que no existan)
        const hasRealItems = (row.items?.length ?? 0) > 0;
        const items = hasRealItems
          ? await Promise.all(
              row.items!.map(async (item) => {
                let productId = item.productId ?? undefined;
                if (productId?.startsWith(NEW_PRODUCT_PLACEHOLDER_PREFIX) || (!productId && item.description)) {
                  productId = await resolvePlaceholderProduct(
                    companyId,
                    productId || `new:${item.description}`,
                    item.description,
                    item.unitPrice,
                    takenSkus,
                    createdPlaceholders,
                    row.values.productSku?.trim()
                  );
                }
                return {
                  productId,
                  description: item.description,
                  quantity: item.quantity,
                  unitCost: item.unitPrice,
                  isExempt: false,
                };
              })
            )
          : [{ description: 'Importación histórica', quantity: 1, unitCost: parseChileanInteger(row.values.netAmount ?? '') ?? 0, isExempt: false }];

        const documentType = PURCHASE_DOC_TYPE_TEXT_MAP[normalizeHeader(row.values.documentType!.trim())]!;
        const folio = row.values.folio!.trim();
        const issueDate = parseChileanDate(row.values.issueDate!.trim())!;
        const paid = parseBoolean(row.values.paid?.trim() ?? '') ?? false;

        const existingDoc = hasRealItems
          ? await prisma.purchaseDocument.findFirst({ where: { companyId, contactId: contact.id, folio }, include: { items: true } })
          : null;

        let createdDoc;
        if (existingDoc) {
          if (existingDoc.items.some((item) => item.productId)) {
            throw new Error(`El documento folio ${folio} ya tiene detalle de productos vinculado — no se puede sobreescribir de nuevo`);
          }
          if (existingDoc.status !== 'ISSUED') {
            throw new Error(`El documento folio ${folio} existe pero no está emitido — no se le puede agregar detalle`);
          }
          createdDoc = await enrichPurchaseDocumentWithItems(companyId, existingDoc.id, items);
        } else {
          createdDoc = await createPurchaseDocument(
            companyId,
            {
              contactId: contact.id,
              documentType,
              folio,
              issueDate,
              items,
            },
            'ISSUED',
            true
          );
        }

        if (paid) {
          await prisma.purchaseDocument.updateMany({
            where: { id: createdDoc.id, companyId },
            data: { paidAmount: createdDoc.totalAmount, paymentStatus: 'PAID' as const },
          });
        }
        created++;
      } catch (error) {
        failedRows.push({ column: 'General', message: toRowMessage(error), rowNumber: row.rowNumber });
      }
    }
  }

  return {
    entity,
    created,
    updated: 0,
    skipped: rows.length - created,
    failedRows: failedRows.length > 0 ? failedRows : undefined,
  };
}

/**
 * Inserta las filas de importación masiva desde archivo.
 */
export async function commitImport(
  companyId: string,
  entity: ImportEntity,
  file: { name: string; buffer: Buffer }
): Promise<ImportResult> {
  const preview = await buildPreview(companyId, entity, file);

  if (preview.missingRequiredColumns.length > 0) {
    throw new Error(`Faltan columnas obligatorias: ${preview.missingRequiredColumns.join(', ')}`);
  }
  if (preview.totalRows === 0) throw new Error('El archivo no contiene filas para importar');

  if (entity === 'stock' || entity === 'historicalSales' || entity === 'historicalPurchases') {
    return commitHistoricalRows(companyId, entity, preview.rows);
  }

  if (preview.invalidRows > 0) {
    throw new Error(
      `El archivo tiene ${preview.invalidRows} fila(s) con errores. Corrígelas y vuelve a subirlo`
    );
  }

  const validRows = preview.rows;

  return prisma.$transaction(async (tx) => {
    if (entity === 'products') {
      const categoryNames = Array.from(
        new Set(validRows.map((row) => row.values.categoryName?.trim()).filter((name): name is string => !!name))
      );
      const categoryIds = new Map<string, string>();
      for (const name of categoryNames) {
        const category = await tx.category.upsert({
          where: { companyId_name: { companyId, name } },
          update: {},
          create: { companyId, name },
        });
        categoryIds.set(name, category.id);
      }

      for (const row of validRows) {
        const netPrice = parseChileanInteger(row.values.netPrice ?? '') ?? 0;
        const minStock = parseChileanInteger(row.values.minStock ?? '') ?? 0;
        const categoryName = row.values.categoryName?.trim();
        const isExempt = parseBoolean(row.values.isExempt ?? '') ?? false;

        await tx.product.create({
          data: {
            companyId,
            sku: row.values.sku!.trim(),
            name: row.values.name!.trim(),
            description: row.values.description?.trim() || undefined,
            categoryId: categoryName ? categoryIds.get(categoryName) : undefined,
            unit: row.values.unit?.trim().toUpperCase() || 'UN',
            isExempt,
            netPrice,
            grossPrice: calculateGrossPrice(netPrice, isExempt),
            costPricePMP: netPrice,
            minStock,
          },
        });
      }

      return { entity, created: validRows.length, updated: 0, skipped: 0 };
    }

    for (const row of validRows) {
      const rutClean = cleanRut(row.values.rut!);
      const tipo = row.values.tipo?.trim().toLowerCase();

      await tx.contact.create({
        data: {
          companyId,
          rut: formatRut(rutClean),
          rutClean,
          razonSocial: row.values.razonSocial!.trim(),
          giro: row.values.giro?.trim() || undefined,
          email: row.values.email?.trim() || undefined,
          phone: row.values.phone?.trim() || undefined,
          address: row.values.address?.trim() || undefined,
          comuna: row.values.comuna?.trim() || undefined,
          isCustomer: tipo !== 'proveedor',
          isSupplier: tipo === 'proveedor' || tipo === 'ambos',
        },
      });
    }

    return { entity, created: validRows.length, updated: 0, skipped: 0 };
  }, BATCH_TX_OPTIONS);
}

