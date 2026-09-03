import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, type ColumnSpec, type ImportEntity } from '../schema';

/**
 * Lectura de planillas.
 *
 * El `.xlsx` se lee con exceljs, que ya es dependencia del proyecto para
 * generar reportes. No se usa el paquete `xlsx` de npm: está congelado en
 * 0.18.5 y arrastra dos advisories HIGH (prototype pollution GHSA-4r6h-8v6p-xvw6
 * y ReDoS GHSA-5pgg-2g8v-p4x9) cuyos parches solo existen fuera del registro.
 * Meter un parser de archivos subidos por el usuario con prototype pollution
 * conocida sería exactamente el peor lugar donde tenerla.
 */

/** Normaliza un encabezado: minúsculas, sin tildes, sin espacios repetidos. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    // Rango de diacríticos combinantes: "Categoría" y "Categoria" deben mapear igual.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // exceljs devuelve objetos para fórmulas, hipervínculos y texto enriquecido.
    const candidate = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => part.text).join('');
    if (candidate.text !== undefined) return String(candidate.text);
    if (candidate.result !== undefined) return String(candidate.result);
    return '';
  }
  return String(value).trim();
}

export interface RawSheet {
  headers: string[];
  rows: string[][];
  truncated: boolean;
}

async function readXlsx(buffer: Buffer): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo no contiene ninguna hoja');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    headers.push(cellToString(cell.value));
  });
  if (headers.every((h) => h === '')) throw new Error('La primera fila debe contener los encabezados de columna');

  const rows: string[][] = [];
  let truncated = false;
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true;
      break;
    }
    const row = sheet.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= headers.length; c++) {
      values.push(cellToString(row.getCell(c).value));
    }
    // Fila completamente vacía: Excel las arrastra al final del archivo.
    if (values.every((v) => v === '')) continue;
    rows.push(values);
  }

  return { headers, rows, truncated };
}

function readCsv(text: string): RawSheet {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    // Sin `header: true`: se necesita el orden original para poder reportar
    // encabezados duplicados o desconocidos con su posición.
  });

  const [headerRow, ...dataRows] = parsed.data;
  if (!headerRow) throw new Error('El archivo está vacío');

  const headers = headerRow.map((h) => String(h ?? '').trim());
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const rows = dataRows
    .slice(0, MAX_IMPORT_ROWS)
    .map((row) => headers.map((_, i) => String(row[i] ?? '').trim()));

  return { headers, rows, truncated };
}

export async function readSpreadsheet(file: { name: string; buffer: Buffer }): Promise<RawSheet> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) return readCsv(file.buffer.toString('utf8'));
  if (lower.endsWith('.xlsx')) return readXlsx(file.buffer);
  throw new Error('Formato no soportado. Suba un archivo .xlsx o .csv');
}

export interface HeaderMapping {
  /** clave interna → índice de columna en el archivo. */
  columnIndex: Record<string, number>;
  unknownHeaders: string[];
  missingRequiredColumns: string[];
}

/**
 * Empareja los encabezados del archivo contra un set de columnas dado.
 * Separado de `mapHeaders` para que un formato alternativo de una misma
 * entidad (ver `PURCHASE_LINE_ITEM_COLUMNS`) pueda mapearse sin necesitar una
 * entrada propia en `ImportEntity`/`IMPORT_COLUMNS`.
 */
export function mapHeadersForSpecs(specs: ColumnSpec[], headers: string[]): HeaderMapping {
  const normalized = headers.map(normalizeHeader);

  const columnIndex: Record<string, number> = {};
  const matchedIndexes = new Set<number>();

  for (const spec of specs) {
    const index = normalized.findIndex((header, i) => !matchedIndexes.has(i) && spec.aliases.includes(header));
    if (index >= 0) {
      columnIndex[spec.key] = index;
      matchedIndexes.add(index);
    }
  }

  const unknownHeaders = headers.filter((header, i) => header !== '' && !matchedIndexes.has(i));
  const missingRequiredColumns = specs
    .filter((spec) => spec.required && columnIndex[spec.key] === undefined)
    .map((spec) => spec.label);

  return { columnIndex, unknownHeaders, missingRequiredColumns };
}

/** Empareja los encabezados del archivo con las columnas conocidas de la entidad. */
export function mapHeaders(entity: ImportEntity, headers: string[]): HeaderMapping {
  return mapHeadersForSpecs(IMPORT_COLUMNS[entity], headers);
}
