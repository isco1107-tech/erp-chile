import ExcelJS from 'exceljs';
import { buildWorkbook } from '@/modules/reports/services/workbook.service';
import type { ReportDataset } from '@/modules/reports/services/dataset.service';

/**
 * Verificación end-to-end del libro Excel: se genera el .xlsx real, se vuelve a
 * abrir y se comprueba que las fórmulas del Panel apuntan a las columnas y
 * filas correctas, y que su resultado coincide con el que se calcula a mano
 * sobre las hojas de datos.
 *
 * El motivo: las fórmulas del Panel se arman con índices de fila calculados en
 * TypeScript. Una referencia corrida no rompe el build ni los tipos — se
 * descubre recién al abrir el archivo, y una referencia a la fila 0 hace que
 * Excel declare el libro dañado.
 */

const DAY = (d: number) => new Date(2026, 7, d);

function dataset(): ReportDataset {
  return {
    empresa: { razonSocial: 'Comercial Prueba SpA', rut: '76.543.210-K' },
    rango: { from: DAY(1), to: DAY(31) },
    generadoEn: DAY(17),
    productos: [
      {
        sku: 'SKU-1', nombre: 'Producto Uno', categoria: 'General', unidad: 'UN',
        gestionaStock: true, pmp: 1000, precioNeto: 1500, precioBruto: 1785,
        stockMinimo: 5, stockTotal: 10, valorizado: 10000, margenUnitario: 500,
      },
      {
        sku: 'SKU-2', nombre: 'Producto Dos', categoria: 'General', unidad: 'UN',
        gestionaStock: true, pmp: 2000, precioNeto: 3000, precioBruto: 3570,
        stockMinimo: 4, stockTotal: 3, valorizado: 6000, margenUnitario: 1000,
      },
    ],
    inventario: [
      { sku: 'SKU-1', producto: 'Producto Uno', bodega: 'Central', cantidad: 10, pmp: 1000, valorizado: 10000, stockMinimo: 5, bajoMinimo: false },
      { sku: 'SKU-2', producto: 'Producto Dos', bodega: 'Central', cantidad: 3, pmp: 2000, valorizado: 6000, stockMinimo: 4, bajoMinimo: true },
    ],
    kardex: [],
    ventas: [
      {
        fecha: DAY(10), tipoDte: 'Factura Electrónica (33)', folio: 1, estado: 'ISSUED',
        cliente: 'Cliente A', rutCliente: '11.111.111-1',
        neto: 100000, exento: 0, iva: 19000, total: 119000,
        pagado: 119000, saldo: 0, estadoPago: 'PAID', costoVenta: 60000, margen: 40000,
      },
      {
        fecha: DAY(12), tipoDte: 'Boleta Electrónica (39)', folio: 2, estado: 'ISSUED',
        cliente: 'Cliente B', rutCliente: '22.222.222-2',
        neto: 50000, exento: 10000, iva: 9500, total: 69500,
        pagado: 20000, saldo: 49500, estadoPago: 'PARTIAL', costoVenta: 30000, margen: 20000,
      },
      // Borrador: ninguna fórmula del panel debe contarlo.
      {
        fecha: DAY(13), tipoDte: 'Factura Electrónica (33)', folio: null, estado: 'DRAFT',
        cliente: 'Cliente C', rutCliente: '33.333.333-3',
        neto: 999999, exento: 999999, iva: 999999, total: 999999,
        pagado: 0, saldo: 999999, estadoPago: 'PENDING', costoVenta: 999999, margen: 999999,
      },
    ],
    ventasDetalle: [],
    compras: [
      {
        fecha: DAY(5), tipoDoc: 'FACTURA', folio: 'F-900', estado: 'ISSUED',
        proveedor: 'Proveedor X', rutProveedor: '44.444.444-4',
        neto: 80000, exento: 0, iva: 15200, total: 95200,
        pagado: 50000, saldo: 45200, estadoPago: 'PARTIAL',
      },
      {
        fecha: DAY(6), tipoDoc: 'FACTURA', folio: 'F-901', estado: 'CANCELLED',
        proveedor: 'Proveedor Y', rutProveedor: '55.555.555-5',
        neto: 777777, exento: 0, iva: 777777, total: 777777,
        pagado: 0, saldo: 777777, estadoPago: 'PENDING',
      },
    ],
    comprasDetalle: [],
    pagos: [
      { fecha: DAY(10), direccion: 'Ingreso', contraparte: 'Cliente A', medioPago: 'TRANSFERENCIA', documento: 'Venta folio 1', monto: 119000, referencia: '' },
      { fecha: DAY(12), direccion: 'Ingreso', contraparte: 'Cliente B', medioPago: 'EFECTIVO', documento: 'Venta folio 2', monto: 20000, referencia: '' },
      { fecha: DAY(15), direccion: 'Egreso', contraparte: 'Proveedor X', medioPago: 'TRANSFERENCIA', documento: 'Compra folio F-900', monto: 50000, referencia: '' },
    ],
    // Mismos totales que las filas ISSUED de arriba (150.000 neto, 10.000
    // exento, 90.000 costo, 28.500 IVA débito, 15.200 IVA crédito): el panel
    // ya no los suma con SUMIFS, los recibe precalculados con el signo de NC
    // ya aplicado (ver `dataset.service.ts`).
    resumenTributario: {
      ventasNetas: 150000,
      ventasExentas: 10000,
      costoVentas: 90000,
      margenBruto: 60000,
      ivaDebito: 28500,
      ivaCredito: 15200,
      ivaAPagarOFavor: 13300,
      ppmEstimado: 1600,
    },
  };
}

let wb: ExcelJS.Workbook;
let panel: ExcelJS.Worksheet;

beforeAll(async () => {
  const buffer = await buildWorkbook(dataset());
  wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  panel = wb.getWorksheet('Panel')!;
});

/** Fórmula de la celda D de la fila cuyo rótulo (columna A) es `label`. */
function kpiFormula(label: string): string {
  for (let r = 1; r <= panel.rowCount; r++) {
    if (panel.getCell(`A${r}`).value === label) {
      const value = panel.getCell(`D${r}`).value;
      if (value && typeof value === 'object' && 'formula' in value) return String(value.formula);
      throw new Error(`El KPI "${label}" no contiene una fórmula`);
    }
  }
  throw new Error(`No se encontró el KPI "${label}" en el Panel`);
}

/** Valor fijo de la celda D de la fila cuyo rótulo (columna A) es `label`. */
function kpiValue(label: string): number {
  for (let r = 1; r <= panel.rowCount; r++) {
    if (panel.getCell(`A${r}`).value === label) {
      const value = panel.getCell(`D${r}`).value;
      if (typeof value === 'number') return value;
      throw new Error(`El KPI "${label}" no contiene un valor fijo`);
    }
  }
  throw new Error(`No se encontró el KPI "${label}" en el Panel`);
}

/** Fila (1-indexada) del rótulo en la columna A del Panel. */
function kpiRow(label: string): number {
  for (let r = 1; r <= panel.rowCount; r++) {
    if (panel.getCell(`A${r}`).value === label) return r;
  }
  throw new Error(`No se encontró el KPI "${label}" en el Panel`);
}

/** Letra de columna de un encabezado en una hoja de datos. */
function columnOf(sheet: string, header: string): string {
  const ws = wb.getWorksheet(sheet)!;
  const row = ws.getRow(1);
  for (let c = 1; c <= row.cellCount; c++) {
    if (row.getCell(c).value === header) return ws.getColumn(c).letter;
  }
  throw new Error(`La hoja "${sheet}" no tiene la columna "${header}"`);
}

describe('Libro Excel — hojas de datos', () => {
  it('genera todas las hojas esperadas', () => {
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual([
      'Panel', 'Productos', 'Inventario', 'Kardex',
      'Ventas', 'Ventas detalle', 'Compras', 'Compras detalle', 'Pagos',
    ]);
  });

  it('escribe los datos bajo el encabezado, sin desfase de filas', () => {
    const ventas = wb.getWorksheet('Ventas')!;
    expect(ventas.getRow(1).getCell(1).value).toBe('Fecha');
    expect(ventas.getRow(2).getCell(4).value).toBe('ISSUED');
    expect(ventas.getRow(2).getCell(7).value).toBe(100000);
    // 1 encabezado + 3 documentos.
    expect(ventas.rowCount).toBe(4);
  });

  it('mantiene el estado como enum crudo, que es contra lo que filtran los SUMIFS', () => {
    const ventas = wb.getWorksheet('Ventas')!;
    const estados = [2, 3, 4].map((r) => ventas.getRow(r).getCell(4).value);
    expect(estados).toEqual(['ISSUED', 'ISSUED', 'DRAFT']);
  });
});

describe('Panel — las fórmulas apuntan a celdas válidas', () => {
  it('ninguna fórmula referencia una fila inexistente (fila 0 corrompe el libro)', () => {
    for (let r = 1; r <= panel.rowCount; r++) {
      const value = panel.getCell(`D${r}`).value;
      if (!value || typeof value !== 'object' || !('formula' in value)) continue;
      const formula = String(value.formula);
      // Referencias locales del Panel: columna+fila sin "Hoja!" delante.
      const refs = formula.match(/(?<![!\w$])\$?[A-Z]{1,2}\$?(\d+)/g) ?? [];
      for (const ref of refs) {
        const rowNumber = Number(ref.replace(/[^0-9]/g, ''));
        expect(rowNumber).toBeGreaterThan(0);
      }
    }
  });

  it('% Margen bruto divide margen bruto por ventas netas', () => {
    const margen = kpiRow('Margen bruto');
    const ventasNetas = kpiRow('Ventas netas (emitidas)');
    expect(kpiFormula('% Margen bruto')).toBe(`IFERROR(D${margen}/D${ventasNetas},0)`);
  });

  it('Ticket promedio divide ventas netas por el número de documentos emitidos', () => {
    const ventasNetas = kpiRow('Ventas netas (emitidas)');
    expect(kpiFormula('Ticket promedio')).toBe(
      `IFERROR(D${ventasNetas}/COUNTIFS(Ventas!D:D,"ISSUED"),0)`
    );
  });

  it('el resultado comercial y el estimador de IVA vienen del resumen precalculado, no de SUMIFS', () => {
    // Antes estas seis cifras eran `SUMIFS(...,"ISSUED")` directo sobre la
    // hoja de datos: una Nota de Crédito sumaba en vez de restar, duplicando
    // ventas, costo, margen e IVA en vez de cancelarlos. Ahora vienen fijas
    // desde `dataset.service.ts`, que sí aplica el signo.
    expect(kpiValue('Ventas netas (emitidas)')).toBe(150000);
    expect(kpiValue('Ventas exentas')).toBe(10000);
    expect(kpiValue('Costo de ventas')).toBe(90000);
    expect(kpiValue('Margen bruto')).toBe(60000);
    expect(kpiValue('IVA débito fiscal (ventas)')).toBe(28500);
    expect(kpiValue('IVA crédito fiscal (compras)')).toBe(15200);
    expect(kpiValue('IVA a pagar / (a favor)')).toBe(13300);
    expect(kpiValue('PPM estimado del período')).toBe(1600);
  });
});

describe('Panel — los SUMIFS apuntan a la columna correcta de cada hoja', () => {
  const cases: Array<[string, string, string, string]> = [
    ['Cuentas por cobrar', 'Ventas', 'Saldo', 'Estado'],
    ['Cuentas por pagar', 'Compras', 'Saldo', 'Estado'],
  ];

  it.each(cases)('%s suma %s!%s filtrando por %s', (label, sheet, sumHeader, critHeader) => {
    const sumCol = columnOf(sheet, sumHeader);
    const critCol = columnOf(sheet, critHeader);
    expect(kpiFormula(label)).toBe(`SUMIFS(${sheet}!${sumCol}:${sumCol},${sheet}!${critCol}:${critCol},"ISSUED")`);
  });

  it('los KPI de inventario suman las columnas Valorizado y Cantidad', () => {
    expect(kpiFormula('Inventario valorizado')).toBe(`SUM(Inventario!${columnOf('Inventario', 'Valorizado')}:${columnOf('Inventario', 'Valorizado')})`);
    expect(kpiFormula('Unidades en stock')).toBe(`SUM(Inventario!${columnOf('Inventario', 'Cantidad')}:${columnOf('Inventario', 'Cantidad')})`);
    expect(kpiFormula('SKUs bajo stock mínimo')).toBe(`COUNTIFS(Inventario!${columnOf('Inventario', 'Bajo mínimo')}:${columnOf('Inventario', 'Bajo mínimo')},TRUE)`);
  });

  it('los KPI de caja filtran la columna Dirección de Pagos', () => {
    const monto = columnOf('Pagos', 'Monto');
    const dir = columnOf('Pagos', 'Dirección');
    expect(kpiFormula('Cobros recibidos')).toBe(`SUMIFS(Pagos!${monto}:${monto},Pagos!${dir}:${dir},"Ingreso")`);
    expect(kpiFormula('Pagos efectuados')).toBe(`SUMIFS(Pagos!${monto}:${monto},Pagos!${dir}:${dir},"Egreso")`);
  });
});

/**
 * Evalúa a mano lo que Excel calculará, leyendo las hojas ya escritas. Si las
 * fórmulas apuntan bien y los datos están donde se espera, estos números tienen
 * que cuadrar con el dataset de entrada.
 */
function sumIfIssued(sheet: string, sumHeader: string): number {
  const ws = wb.getWorksheet(sheet)!;
  const sumCol = columnOf(sheet, sumHeader);
  const critCol = columnOf(sheet, 'Estado');
  let total = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    if (ws.getCell(`${critCol}${r}`).value !== 'ISSUED') continue;
    total += Number(ws.getCell(`${sumCol}${r}`).value ?? 0);
  }
  return total;
}

describe('Panel — los valores resueltos cuadran con el dataset', () => {
  it('suma solo documentos emitidos y descarta borradores y anulados', () => {
    expect(sumIfIssued('Ventas', 'Neto')).toBe(150000);
    expect(sumIfIssued('Ventas', 'Exento')).toBe(10000);
    expect(sumIfIssued('Ventas', 'IVA')).toBe(28500);
    expect(sumIfIssued('Ventas', 'Margen')).toBe(60000);
    expect(sumIfIssued('Ventas', 'Saldo')).toBe(49500);
    // La compra CANCELLED queda fuera del crédito fiscal.
    expect(sumIfIssued('Compras', 'IVA')).toBe(15200);
    expect(sumIfIssued('Compras', 'Saldo')).toBe(45200);
  });

  it('el IVA a pagar del período es el débito menos el crédito', () => {
    expect(sumIfIssued('Ventas', 'IVA') - sumIfIssued('Compras', 'IVA')).toBe(13300);
  });

  it('el inventario valorizado suma cantidad × PMP de todas las bodegas', () => {
    const ws = wb.getWorksheet('Inventario')!;
    const col = columnOf('Inventario', 'Valorizado');
    let total = 0;
    for (let r = 2; r <= ws.rowCount; r++) total += Number(ws.getCell(`${col}${r}`).value ?? 0);
    expect(total).toBe(16000);
  });

  it('el flujo neto del período es ingresos menos egresos', () => {
    const ws = wb.getWorksheet('Pagos')!;
    const monto = columnOf('Pagos', 'Monto');
    const dir = columnOf('Pagos', 'Dirección');
    let neto = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const amount = Number(ws.getCell(`${monto}${r}`).value ?? 0);
      neto += ws.getCell(`${dir}${r}`).value === 'Ingreso' ? amount : -amount;
    }
    expect(neto).toBe(89000);
  });

  it('marca bajo mínimo como booleano, que es lo que COUNTIFS(...,TRUE) cuenta', () => {
    const ws = wb.getWorksheet('Inventario')!;
    const col = columnOf('Inventario', 'Bajo mínimo');
    expect(ws.getCell(`${col}2`).value).toBe(false);
    expect(ws.getCell(`${col}3`).value).toBe(true);
  });
});
