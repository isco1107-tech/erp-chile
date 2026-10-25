import 'server-only';

import type ExcelJS from 'exceljs';

/** Estilo común de los archivos de «Exportar datos» (la tinta de marca en el encabezado). */
export const BRAND = 'FF12161F';
export const CLP_FORMAT = '#,##0';
export const QTY_FORMAT = '#,##0.###';
export const DATETIME_FORMAT = 'dd-mm-yyyy hh:mm';

export function styleHeader(sheet: ExcelJS.Worksheet, options: { filter?: boolean } = {}): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;
  if (options.filter !== false) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

/**
 * La hora de Santiago como si fuera la del reloj de Excel. Excel no guarda husos
 * horarios: si se escribe el instante en UTC, una venta de las 20:15 aparece a
 * las 23:15. Así la columna es una fecha real (se puede ordenar y filtrar) y
 * muestra la hora que vio quien la hizo.
 */
export function santiagoWallClock(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')));
}

/**
 * Excel interpreta como fórmula un texto que empieza con `=`, `+`, `-` o `@`:
 * lo que escribió un cliente o un cajero (una nota, un nombre) no puede ejecutar nada
 * al abrir el archivo.
 */
export function safeCell(value: string | null | undefined): string {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
