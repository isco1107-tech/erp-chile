import ExcelJS from 'exceljs';
import type { ReportDataset } from './dataset.service';

const CLP = '#,##0';
const CLP_DEC = '#,##0.00';
const QTY = '#,##0.###';
const PCT = '0.0%';
const DATE_FMT = 'dd-mm-yyyy';

const BRAND = 'FF1E3A5F';
const BRAND_SOFT = 'FFE8EEF4';
const ALERT = 'FFC0392B';
const OK = 'FF1E8449';

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

function addSheet(wb: ExcelJS.Workbook, name: string, columns: ColumnSpec[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 28;

  rows.forEach((row) => ws.addRow(row));

  // Formato numérico por columna, aplicado al cuerpo (fila 2 en adelante).
  columns.forEach((c, i) => {
    if (!c.numFmt) return;
    ws.getColumn(i + 1).numFmt = c.numFmt;
  });

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
    // Bandas alternadas: legibilidad al escanear cientos de filas.
    for (let r = 2; r <= rows.length + 1; r++) {
      if (r % 2 === 0) {
        ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
      }
    }
  }

  return ws;
}

/**
 * Barra de datos en la columna indicada: mini-gráfico dentro de la celda.
 *
 * `cfvo` es opcional en los tipos de exceljs pero obligatorio al serializar: sin
 * los dos extremos de la escala, `writeBuffer()` lanza y el export completo cae
 * con 500. Se declaran explícitamente en vez de castear la regla.
 */
function addDataBar(ws: ExcelJS.Worksheet, colLetter: string, lastRow: number, argb: string) {
  if (lastRow < 2) return;
  const rule: ExcelJS.DataBarRuleType & { color: Partial<ExcelJS.Color> } = {
    type: 'dataBar',
    cfvo: [{ type: 'min' }, { type: 'max' }],
    color: { argb },
    priority: 1,
  };
  ws.addConditionalFormatting({ ref: `${colLetter}2:${colLetter}${lastRow}`, rules: [rule] });
}

function titleBlock(ws: ExcelJS.Worksheet, data: ReportDataset) {
  ws.mergeCells('A1:F1');
  const t = ws.getCell('A1');
  t.value = `${data.empresa.razonSocial} — Panel de control`;
  t.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:F2');
  const s = ws.getCell('A2');
  const fmt = (d: Date) => d.toLocaleDateString('es-CL');
  s.value = `RUT ${data.empresa.rut}  ·  Período ${fmt(data.rango.from)} a ${fmt(data.rango.to)}  ·  Generado ${data.generadoEn.toLocaleString('es-CL')}`;
  s.font = { size: 10, color: { argb: 'FF44607F' } };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.mergeCells(`A${row}:F${row}`);
  const c = ws.getCell(`A${row}`);
  c.value = text;
  c.font = { bold: true, size: 12, color: { argb: BRAND } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
  c.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 22;
}

type Kpi = { label: string; numFmt: string; hint?: string } & ({ formula: string; value?: never } | { value: number; formula?: never });

function kpiRows(ws: ExcelJS.Worksheet, startRow: number, kpis: Kpi[]): number {
  let row = startRow;
  for (const kpi of kpis) {
    ws.getCell(`A${row}`).value = kpi.label;
    ws.getCell(`A${row}`).font = { bold: true, size: 11 };
    ws.mergeCells(`A${row}:C${row}`);

    const valueCell = ws.getCell(`D${row}`);
    // Las cifras que dependen del signo de una Nota de Crédito/Débito
    // (ventas, costo, margen, IVA) vienen precalculadas desde
    // `dataset.service.ts` como valor fijo — sumarlas con SUMIFS directo
    // sobre la hoja Ventas/Compras las duplicaba en vez de restarlas. Los KPI
    // que no dependen del signo (cuentas por cobrar/pagar, flujo de caja)
    // siguen siendo fórmula viva.
    valueCell.value = kpi.formula !== undefined ? { formula: kpi.formula } : kpi.value!;
    valueCell.numFmt = kpi.numFmt;
    valueCell.font = { bold: true, size: 12, color: { argb: BRAND } };
    valueCell.alignment = { horizontal: 'right' };
    ws.mergeCells(`D${row}:E${row}`);

    if (kpi.hint) {
      const hint = ws.getCell(`F${row}`);
      hint.value = kpi.hint;
      hint.font = { size: 9, italic: true, color: { argb: 'FF7A8FA6' } };
    }
    ws.getRow(row).height = 20;
    row++;
  }
  return row;
}

/**
 * Construye el libro completo. El panel usa fórmulas vivas (SUMIFS/COUNTIFS)
 * contra las hojas de datos en vez de valores precalculados: si el usuario
 * filtra, corrige o agrega filas en Excel, los indicadores se recalculan solos.
 */
export async function buildWorkbook(data: ReportDataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP Chile';
  wb.created = data.generadoEn;

  const dash = wb.addWorksheet('Panel', { views: [{ state: 'frozen', ySplit: 2 }] });
  dash.columns = [
    { width: 30 },
    { width: 14 },
    { width: 10 },
    { width: 18 },
    { width: 10 },
    { width: 46 },
  ];

  // ---------- Hojas de datos ----------
  const wsProductos = addSheet(
    wb,
    'Productos',
    [
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Producto', key: 'nombre', width: 38 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Gestiona stock', key: 'gestionaStock', width: 14 },
      { header: 'PMP', key: 'pmp', width: 14, numFmt: CLP_DEC },
      { header: 'Precio neto', key: 'precioNeto', width: 14, numFmt: CLP },
      { header: 'Precio bruto', key: 'precioBruto', width: 14, numFmt: CLP },
      { header: 'Margen unitario', key: 'margenUnitario', width: 16, numFmt: CLP },
      { header: 'Stock mínimo', key: 'stockMinimo', width: 13, numFmt: QTY },
      { header: 'Stock total', key: 'stockTotal', width: 13, numFmt: QTY },
      { header: 'Valorizado', key: 'valorizado', width: 16, numFmt: CLP },
    ],
    data.productos as unknown as Record<string, unknown>[]
  );
  addDataBar(wsProductos, 'L', data.productos.length + 1, 'FF5B9BD5');

  const wsInventario = addSheet(
    wb,
    'Inventario',
    [
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Producto', key: 'producto', width: 38 },
      { header: 'Bodega', key: 'bodega', width: 22 },
      { header: 'Cantidad', key: 'cantidad', width: 13, numFmt: QTY },
      { header: 'PMP', key: 'pmp', width: 14, numFmt: CLP_DEC },
      { header: 'Valorizado', key: 'valorizado', width: 16, numFmt: CLP },
      { header: 'Stock mínimo', key: 'stockMinimo', width: 13, numFmt: QTY },
      { header: 'Bajo mínimo', key: 'bajoMinimo', width: 13 },
    ],
    data.inventario as unknown as Record<string, unknown>[]
  );
  addDataBar(wsInventario, 'F', data.inventario.length + 1, 'FF70AD47');
  // Semáforo de quiebre de stock: la fila se pinta si la cantidad cae bajo el mínimo.
  if (data.inventario.length > 0) {
    wsInventario.addConditionalFormatting({
      ref: `A2:H${data.inventario.length + 1}`,
      rules: [
        {
          type: 'expression',
          formulae: ['AND($G2>0,$D2<$G2)'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDE7E6' } } },
          priority: 1,
        } as ExcelJS.ExpressionRuleType,
      ],
    });
  }

  addSheet(
    wb,
    'Kardex',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Producto', key: 'producto', width: 34 },
      { header: 'Bodega', key: 'bodega', width: 20 },
      { header: 'Tipo movimiento', key: 'tipo', width: 20 },
      { header: 'Cantidad', key: 'cantidad', width: 12, numFmt: QTY },
      { header: 'Costo unitario', key: 'costoUnitario', width: 14, numFmt: CLP_DEC },
      { header: 'Costo total', key: 'costoTotal', width: 14, numFmt: CLP },
      { header: 'Stock anterior', key: 'stockAnterior', width: 13, numFmt: QTY },
      { header: 'Stock nuevo', key: 'stockNuevo', width: 13, numFmt: QTY },
      { header: 'PMP anterior', key: 'pmpAnterior', width: 14, numFmt: CLP_DEC },
      { header: 'PMP nuevo', key: 'pmpNuevo', width: 14, numFmt: CLP_DEC },
      { header: 'Referencia', key: 'referencia', width: 30 },
    ],
    data.kardex as unknown as Record<string, unknown>[]
  );

  const wsVentas = addSheet(
    wb,
    'Ventas',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'Tipo DTE', key: 'tipoDte', width: 24 },
      { header: 'Folio', key: 'folio', width: 10 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'RUT', key: 'rutCliente', width: 14 },
      { header: 'Neto', key: 'neto', width: 15, numFmt: CLP },
      { header: 'Exento', key: 'exento', width: 13, numFmt: CLP },
      { header: 'IVA', key: 'iva', width: 13, numFmt: CLP },
      { header: 'Total', key: 'total', width: 16, numFmt: CLP },
      { header: 'Pagado', key: 'pagado', width: 15, numFmt: CLP },
      { header: 'Saldo', key: 'saldo', width: 15, numFmt: CLP },
      { header: 'Estado pago', key: 'estadoPago', width: 13 },
      { header: 'Costo de venta', key: 'costoVenta', width: 15, numFmt: CLP },
      { header: 'Margen', key: 'margen', width: 15, numFmt: CLP },
    ],
    data.ventas as unknown as Record<string, unknown>[]
  );
  addDataBar(wsVentas, 'J', data.ventas.length + 1, 'FF5B9BD5');

  addSheet(
    wb,
    'Ventas detalle',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'Tipo DTE', key: 'tipoDte', width: 24 },
      { header: 'Folio', key: 'folio', width: 10 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 36 },
      { header: 'Cantidad', key: 'cantidad', width: 11, numFmt: QTY },
      { header: 'Precio unitario', key: 'precioUnitario', width: 14, numFmt: CLP },
      { header: 'Desc. %', key: 'descuentoPct', width: 10 },
      { header: 'Exento', key: 'exento', width: 9 },
      { header: 'Neto', key: 'neto', width: 14, numFmt: CLP },
      { header: 'IVA', key: 'iva', width: 12, numFmt: CLP },
      { header: 'Total', key: 'total', width: 14, numFmt: CLP },
      { header: 'Costo unitario', key: 'costoUnitario', width: 14, numFmt: CLP_DEC },
      { header: 'Margen línea', key: 'margenLinea', width: 14, numFmt: CLP },
    ],
    data.ventasDetalle as unknown as Record<string, unknown>[]
  );

  addSheet(
    wb,
    'Compras',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'Tipo doc.', key: 'tipoDoc', width: 16 },
      { header: 'Folio', key: 'folio', width: 12 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Proveedor', key: 'proveedor', width: 32 },
      { header: 'RUT', key: 'rutProveedor', width: 14 },
      { header: 'Neto', key: 'neto', width: 15, numFmt: CLP },
      { header: 'Exento', key: 'exento', width: 13, numFmt: CLP },
      { header: 'IVA', key: 'iva', width: 13, numFmt: CLP },
      { header: 'Total', key: 'total', width: 16, numFmt: CLP },
      { header: 'Pagado', key: 'pagado', width: 15, numFmt: CLP },
      { header: 'Saldo', key: 'saldo', width: 15, numFmt: CLP },
      { header: 'Estado pago', key: 'estadoPago', width: 13 },
    ],
    data.compras as unknown as Record<string, unknown>[]
  );

  addSheet(
    wb,
    'Compras detalle',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'Tipo doc.', key: 'tipoDoc', width: 16 },
      { header: 'Folio', key: 'folio', width: 12 },
      { header: 'Proveedor', key: 'proveedor', width: 30 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Descripción', key: 'descripcion', width: 36 },
      { header: 'Cantidad', key: 'cantidad', width: 11, numFmt: QTY },
      { header: 'Costo unitario', key: 'costoUnitario', width: 14, numFmt: CLP },
      { header: 'Exento', key: 'exento', width: 9 },
      { header: 'Neto', key: 'neto', width: 14, numFmt: CLP },
      { header: 'IVA', key: 'iva', width: 12, numFmt: CLP },
      { header: 'Total', key: 'total', width: 14, numFmt: CLP },
    ],
    data.comprasDetalle as unknown as Record<string, unknown>[]
  );

  const wsPagos = addSheet(
    wb,
    'Pagos',
    [
      { header: 'Fecha', key: 'fecha', width: 12, numFmt: DATE_FMT },
      { header: 'Dirección', key: 'direccion', width: 12 },
      { header: 'Contraparte', key: 'contraparte', width: 32 },
      { header: 'Medio de pago', key: 'medioPago', width: 18 },
      { header: 'Documento', key: 'documento', width: 24 },
      { header: 'Monto', key: 'monto', width: 16, numFmt: CLP },
      { header: 'Referencia', key: 'referencia', width: 20 },
    ],
    data.pagos as unknown as Record<string, unknown>[]
  );
  addDataBar(wsPagos, 'F', data.pagos.length + 1, 'FFED7D31');

  // ---------- Panel ----------
  titleBlock(dash, data);

  let row = 4;
  sectionHeader(dash, row++, 'RESULTADO COMERCIAL');
  // `row` se muta al escribir las filas, así que las fórmulas que se refieren a
  // otros KPI se anclan a esta constante. Usar `row` directamente dentro del
  // arreglo lo evalúa ANTES de escribir nada y produce referencias corridas
  // (incluso D0, que Excel rechaza como archivo dañado).
  const comercialRow = row;
  const resumen = data.resumenTributario;
  row = kpiRows(dash, row, [
    {
      label: 'Ventas netas (emitidas)',
      value: resumen.ventasNetas,
      numFmt: CLP,
      hint: 'Excluye borradores y anulados; las Notas de Crédito restan, no suman',
    },
    { label: 'Ventas exentas', value: resumen.ventasExentas, numFmt: CLP },
    { label: 'Costo de ventas', value: resumen.costoVentas, numFmt: CLP, hint: 'Valorizado al PMP vigente al momento de la venta' },
    { label: 'Margen bruto', value: resumen.margenBruto, numFmt: CLP },
    { label: '% Margen bruto', formula: `IFERROR(D${comercialRow + 3}/D${comercialRow},0)`, numFmt: PCT },
    { label: 'Ticket promedio', formula: `IFERROR(D${comercialRow}/COUNTIFS(Ventas!D:D,"ISSUED"),0)`, numFmt: CLP },
    { label: 'N° documentos emitidos', formula: `COUNTIFS(Ventas!D:D,"ISSUED")`, numFmt: '#,##0' },
  ]);

  row++;
  sectionHeader(dash, row++, 'ESTIMADOR DE IVA DEL PERÍODO SELECCIONADO');
  row = kpiRows(dash, row, [
    { label: 'IVA débito fiscal (ventas)', value: resumen.ivaDebito, numFmt: CLP, hint: 'Notas de Crédito ya restadas, no duplicadas' },
    { label: 'IVA crédito fiscal (compras)', value: resumen.ivaCredito, numFmt: CLP, hint: 'Notas de Crédito de proveedor ya restadas' },
    {
      label: 'IVA a pagar / (a favor)',
      value: resumen.ivaAPagarOFavor,
      numFmt: CLP,
      hint: 'Negativo = a favor. No es la declaración F29: no arrastra remanente de meses anteriores. Para el F29 real, usar Tesorería',
    },
    {
      label: 'PPM estimado del período',
      value: resumen.ppmEstimado,
      numFmt: CLP,
      hint: 'Sobre ventas netas + exentas, a la tasa configurada en Ajustes de la empresa',
    },
  ]);

  row++;
  sectionHeader(dash, row++, 'INVENTARIO');
  row = kpiRows(dash, row, [
    { label: 'Inventario valorizado', formula: `SUM(Inventario!F:F)`, numFmt: CLP, hint: 'Suma de cantidad × PMP en todas las bodegas' },
    { label: 'Unidades en stock', formula: `SUM(Inventario!D:D)`, numFmt: QTY },
    { label: 'SKUs bajo stock mínimo', formula: `COUNTIFS(Inventario!H:H,TRUE)`, numFmt: '#,##0', hint: 'Filas resaltadas en rojo en la hoja Inventario' },
    { label: 'SKUs en catálogo', formula: `COUNTA(Productos!A:A)-1`, numFmt: '#,##0' },
  ]);

  row++;
  sectionHeader(dash, row++, 'FINANZAS');
  row = kpiRows(dash, row, [
    { label: 'Cuentas por cobrar', formula: `SUMIFS(Ventas!L:L,Ventas!D:D,"ISSUED")`, numFmt: CLP, hint: 'Saldo pendiente de documentos emitidos' },
    { label: 'Cuentas por pagar', formula: `SUMIFS(Compras!L:L,Compras!D:D,"ISSUED")`, numFmt: CLP },
    { label: 'Cobros recibidos', formula: `SUMIFS(Pagos!F:F,Pagos!B:B,"Ingreso")`, numFmt: CLP },
    { label: 'Pagos efectuados', formula: `SUMIFS(Pagos!F:F,Pagos!B:B,"Egreso")`, numFmt: CLP },
    { label: 'Flujo neto del período', formula: `SUMIFS(Pagos!F:F,Pagos!B:B,"Ingreso")-SUMIFS(Pagos!F:F,Pagos!B:B,"Egreso")`, numFmt: CLP },
  ]);

  // Semáforo: verde si el flujo neto es positivo, rojo si no.
  dash.addConditionalFormatting({
    ref: `D${row - 1}:E${row - 1}`,
    rules: [
      { type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { font: { color: { argb: ALERT }, bold: true } }, priority: 1 } as ExcelJS.CellIsRuleType,
      { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: OK }, bold: true } }, priority: 2 } as ExcelJS.CellIsRuleType,
    ],
  });

  row += 2;
  sectionHeader(dash, row++, 'CÓMO USAR ESTE ARCHIVO');
  const tips = [
    'Los indicadores de arriba son fórmulas vivas: si filtras o editas las hojas de datos, se recalculan solos.',
    'Cada hoja de datos trae autofiltro en la primera fila. Usa Datos → Filtro para segmentar.',
    'Para gráficos: selecciona un rango y usa Insertar → Gráfico dinámico. Los datos ya vienen normalizados para tabla dinámica.',
    'En Inventario, las filas en rojo están bajo el stock mínimo definido en el catálogo.',
    'Kardex es la trazabilidad completa: cada movimiento con su PMP antes y después.',
  ];
  for (const tip of tips) {
    dash.mergeCells(`A${row}:F${row}`);
    const c = dash.getCell(`A${row}`);
    c.value = `•  ${tip}`;
    c.font = { size: 10, color: { argb: 'FF44607F' } };
    c.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    row++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
