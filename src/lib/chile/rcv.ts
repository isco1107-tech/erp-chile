import Papa from 'papaparse';
import { formatRut, rutKey } from '@/lib/chile/rut';

/**
 * Registro de Compras y Ventas (RCV) del SII.
 *
 * El SII arma el RCV con los DTE que recibió de ambos lados: en Compras están
 * todas las facturas que los proveedores emitieron a la empresa, y en Ventas
 * las que la empresa emitió. Cuadrarlo contra el ERP responde dos preguntas
 * que el F29 no puede responder solo: ¿hay facturas de proveedores que el SII
 * conoce y aquí no se registraron (crédito fiscal perdido)? ¿hay documentos en
 * el ERP que el SII no tiene (no se enviaron, o se registraron con datos
 * distintos)?
 *
 * Todo lo de este archivo es puro: lee el CSV que se descarga desde
 * "Registro de Compras y Ventas → Descargar detalles" y compara listas.
 */

export type RcvSide = 'PURCHASES' | 'SALES';

export interface RcvEntry {
  siiCode: number;
  rut: string;
  name: string;
  folio: number;
  /** `AAAA-MM-DD` */
  date: string | null;
  exemptAmount: number;
  netAmount: number;
  ivaAmount: number;
  totalAmount: number;
}

export class RcvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RcvParseError';
  }
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Encabezados aceptados por campo, ya normalizados. El primero que aparezca gana. */
const COLUMN_ALIASES: Record<keyof RcvEntry, string[]> = {
  siiCode: ['tipo doc', 'tipo documento', 'tipo dte', 'tipo'],
  rut: ['rut proveedor', 'rut cliente', 'rut emisor', 'rut receptor', 'rut'],
  name: ['razon social', 'nombre', 'razon social proveedor', 'razon social cliente'],
  folio: ['folio'],
  date: ['fecha docto', 'fecha documento', 'fecha emision', 'fecha'],
  exemptAmount: ['monto exento', 'exento'],
  netAmount: ['monto neto', 'neto'],
  ivaAmount: ['monto iva recuperable', 'monto iva', 'iva recuperable', 'iva'],
  totalAmount: ['monto total', 'total'],
};

const REQUIRED: (keyof RcvEntry)[] = ['siiCode', 'rut', 'folio', 'totalAmount'];

const FIELD_LABELS: Record<keyof RcvEntry, string> = {
  siiCode: 'Tipo Doc',
  rut: 'RUT',
  name: 'Razón Social',
  folio: 'Folio',
  date: 'Fecha Docto',
  exemptAmount: 'Monto Exento',
  netAmount: 'Monto Neto',
  ivaAmount: 'Monto IVA',
  totalAmount: 'Monto Total',
};

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (cleaned === '') return 0;
  // Los montos del RCV son enteros; algunos exportadores agregan separador de miles.
  const normalized = /^-?\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return null;
}

/**
 * Lee el detalle del RCV. Detecta el separador (el SII usa `;`) y ubica las
 * columnas por su encabezado, no por posición: el SII ha agregado columnas al
 * archivo más de una vez y un lector posicional se desalinea en silencio.
 */
export function parseRcvCsv(content: string): RcvEntry[] {
  const withoutBom = content.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(withoutBom, { skipEmptyLines: 'greedy', delimiter: '' });
  const rows = parsed.data.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) throw new RcvParseError('El archivo está vacío');

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes('folio') && normalized.some((cell) => cell.startsWith('tipo doc') || cell === 'tipo');
  });
  if (headerIndex === -1) {
    throw new RcvParseError('No se encontró el encabezado del RCV (Tipo Doc, RUT, Folio…). Descarga el "detalle" desde el SII en formato CSV.');
  }

  const header = rows[headerIndex].map(normalizeHeader);
  const columns = {} as Record<keyof RcvEntry, number>;
  for (const field of Object.keys(COLUMN_ALIASES) as (keyof RcvEntry)[]) {
    let index = -1;
    for (const alias of COLUMN_ALIASES[field]) {
      index = header.indexOf(alias);
      if (index !== -1) break;
    }
    columns[field] = index;
  }
  const missing = REQUIRED.filter((field) => columns[field] === -1);
  if (missing.length > 0) {
    throw new RcvParseError(`Al archivo le faltan columnas: ${missing.map((field) => FIELD_LABELS[field]).join(', ')}`);
  }

  const cell = (row: string[], field: keyof RcvEntry): string | undefined => (columns[field] >= 0 ? row[columns[field]] : undefined);

  const entries: RcvEntry[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const siiCode = Number((cell(row, 'siiCode') ?? '').trim());
    const folio = Number((cell(row, 'folio') ?? '').trim());
    const rawRut = (cell(row, 'rut') ?? '').trim();
    // Filas de totales o resumen al pie del archivo: sin tipo/folio numérico.
    if (!Number.isInteger(siiCode) || siiCode <= 0 || !Number.isInteger(folio) || folio <= 0 || !rawRut) continue;
    entries.push({
      siiCode,
      rut: formatRut(rutKey(rawRut)),
      name: (cell(row, 'name') ?? '').trim(),
      folio,
      date: parseDate(cell(row, 'date')),
      exemptAmount: parseAmount(cell(row, 'exemptAmount')),
      netAmount: parseAmount(cell(row, 'netAmount')),
      ivaAmount: parseAmount(cell(row, 'ivaAmount')),
      totalAmount: parseAmount(cell(row, 'totalAmount')),
    });
  }
  if (entries.length === 0) throw new RcvParseError('El archivo no trae documentos: revisa que sea el detalle y no el resumen del RCV');
  return entries;
}

// ─── Cuadratura ──────────────────────────────────────────────────────────────

/**
 * Familia de documento para comparar. Una factura afecta (33) y una exenta
 * (34) del mismo folio y emisor no pueden coexistir en la práctica, y el ERP
 * no siempre distingue cuál fue: se comparan como una sola familia.
 */
function family(code: number): string {
  if (code === 33 || code === 34) return 'F';
  if (code === 39 || code === 41) return 'B';
  return String(code);
}

export function rcvKey(entry: Pick<RcvEntry, 'siiCode' | 'rut' | 'folio'>): string {
  return `${family(entry.siiCode)}|${rutKey(entry.rut)}|${entry.folio}`;
}

/** Signo contable: las notas de crédito restan. */
export function rcvSign(code: number): 1 | -1 {
  return code === 61 || code === 112 || code === 60 ? -1 : 1;
}

export interface ErpRcvEntry extends RcvEntry {
  documentId: string;
}

export interface RcvDifference {
  sii: RcvEntry;
  erp: ErpRcvEntry;
  fields: ('netAmount' | 'exemptAmount' | 'ivaAmount' | 'totalAmount')[];
}

export interface RcvTotals {
  count: number;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
}

export interface RcvReconciliation {
  matched: { sii: RcvEntry; erp: ErpRcvEntry }[];
  differences: RcvDifference[];
  onlyInSii: RcvEntry[];
  onlyInErp: ErpRcvEntry[];
  totals: { sii: RcvTotals; erp: RcvTotals };
}

function sumTotals(entries: RcvEntry[]): RcvTotals {
  return entries.reduce<RcvTotals>(
    (acc, entry) => {
      const sign = rcvSign(entry.siiCode);
      return {
        count: acc.count + 1,
        netAmount: acc.netAmount + sign * entry.netAmount,
        exemptAmount: acc.exemptAmount + sign * entry.exemptAmount,
        ivaAmount: acc.ivaAmount + sign * entry.ivaAmount,
        totalAmount: acc.totalAmount + sign * entry.totalAmount,
      };
    },
    { count: 0, netAmount: 0, exemptAmount: 0, ivaAmount: 0, totalAmount: 0 }
  );
}

/**
 * Cruza el RCV con los documentos del ERP del mismo período. Compara montos
 * campo a campo y tolera ±1 peso en el IVA (redondeo por línea vs. por
 * documento), nunca en el total.
 */
export function reconcileRcv(sii: RcvEntry[], erp: ErpRcvEntry[]): RcvReconciliation {
  const erpByKey = new Map<string, ErpRcvEntry>();
  for (const entry of erp) erpByKey.set(rcvKey(entry), entry);

  const matched: RcvReconciliation['matched'] = [];
  const differences: RcvDifference[] = [];
  const onlyInSii: RcvEntry[] = [];
  const used = new Set<string>();

  for (const entry of sii) {
    const key = rcvKey(entry);
    const counterpart = erpByKey.get(key);
    if (!counterpart || used.has(key)) {
      onlyInSii.push(entry);
      continue;
    }
    used.add(key);
    const fields: RcvDifference['fields'] = [];
    if (entry.totalAmount !== counterpart.totalAmount) fields.push('totalAmount');
    if (entry.netAmount !== counterpart.netAmount) fields.push('netAmount');
    if (entry.exemptAmount !== counterpart.exemptAmount) fields.push('exemptAmount');
    if (Math.abs(entry.ivaAmount - counterpart.ivaAmount) > 1) fields.push('ivaAmount');
    if (fields.length === 0) matched.push({ sii: entry, erp: counterpart });
    else differences.push({ sii: entry, erp: counterpart, fields });
  }

  const onlyInErp = erp.filter((entry) => !used.has(rcvKey(entry)));

  return {
    matched,
    differences,
    onlyInSii,
    onlyInErp,
    totals: { sii: sumTotals(sii), erp: sumTotals(erp) },
  };
}

/** Código SII que corresponde a un documento de compra del ERP (o null si no va al RCV). */
export function purchaseRcvCode(documentType: string, amounts: { netAmount: number; ivaAmount: number; exemptAmount: number }): number | null {
  switch (documentType) {
    case 'FACTURA':
      return amounts.netAmount === 0 && amounts.ivaAmount === 0 && amounts.exemptAmount > 0 ? 34 : 33;
    case 'NOTA_CREDITO':
      return 61;
    case 'NOTA_DEBITO':
      return 56;
    default:
      // Boletas y guías de proveedores no forman parte del RCV de compras.
      return null;
  }
}

/**
 * Documentos de venta que el RCV lista por folio. Las boletas (39/41) el SII
 * las informa agregadas en el resumen, no documento a documento, y las guías
 * (52) no son parte del registro.
 */
export const SALES_RCV_CODES = [33, 34, 46, 56, 61, 110, 111, 112];
