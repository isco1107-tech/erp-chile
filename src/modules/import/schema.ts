import { z } from 'zod';

export const IMPORT_ENTITIES = ['products', 'contacts', 'stock', 'historicalSales', 'historicalPurchases'] as const;

export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const importEntitySchema = z.enum(IMPORT_ENTITIES);

/**
 * Tope de filas por importación.
 *
 * La inserción es una única transacción: sin un límite, un archivo de 50.000
 * filas mantiene una transacción abierta más allá del timeout de la función
 * serverless y termina en rollback después de varios minutos de espera. Es
 * preferible pedir el archivo por partes.
 */
export const MAX_IMPORT_ROWS = 2000;

/**
 * Máximo de imágenes por request de escaneo por IA (`/api/import/ai-scan`).
 *
 * Bajado de 20 a 8 al pasar a Gemini 2.5 Flash tier gratuito (~10
 * solicitudes/minuto): `ai-scan.service.ts` espacia las llamadas ~6.5s entre
 * sí para no chocar con ese límite, así que un lote de 20 tardaría más de 2
 * minutos y arriesgaría el timeout de la función serverless. Con 8 el lote más
 * lento (con algún reintento por 429) se mantiene bajo ~1 minuto. El usuario
 * puede subir varios lotes seguidos — la pantalla acumula los resultados.
 */
export const MAX_AI_SCAN_IMAGES = 8;
export const MAX_AI_SCAN_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Tope de caracteres de un prompt de texto libre (`/api/import/ai-prompt`).
 * Un prompt más largo que esto probablemente sea un pegado accidental de un
 * documento completo; se rechaza antes de gastar una llamada al modelo.
 */
export const MAX_AI_PROMPT_CHARS = 4000;

/**
 * Tope de documentos que se le pide extraer al modelo desde un mismo prompt.
 * Protege contra un prompt que liste cientos de líneas y genere una tabla de
 * revisión inmanejable en pantalla.
 */
export const MAX_AI_PROMPT_DOCUMENTS = 20;

export interface ColumnSpec {
  /** Clave interna del campo. */
  key: string;
  label: string;
  required: boolean;
  /** Encabezados aceptados en el archivo, normalizados (minúsculas, sin tildes). */
  aliases: string[];
  hint?: string;
}

/**
 * Definición de columnas por entidad. Los alias permiten que el usuario suba la
 * planilla con la que ya trabaja en vez de tener que renombrar encabezados.
 */
export const IMPORT_COLUMNS: Record<ImportEntity, ColumnSpec[]> = {
  products: [
    { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'codigo', 'code', 'codigo producto'], hint: 'Único por empresa' },
    { key: 'name', label: 'Nombre', required: true, aliases: ['nombre', 'name', 'producto', 'descripcion'] },
    { key: 'netPrice', label: 'Precio Neto', required: true, aliases: ['precio neto', 'precio', 'netprice', 'valor', 'precio venta'], hint: 'CLP entero, sin IVA' },
    { key: 'unit', label: 'Unidad', required: false, aliases: ['unidad', 'unit', 'um'], hint: 'UN, KG, MT... (por defecto UN)' },
    { key: 'minStock', label: 'Stock Mínimo', required: false, aliases: ['stock minimo', 'minstock', 'minimo'] },
    { key: 'categoryName', label: 'Categoría', required: false, aliases: ['categoria', 'category', 'familia'], hint: 'Se crea si no existe' },
    { key: 'isExempt', label: 'Exento IVA', required: false, aliases: ['exento', 'exento iva', 'isexempt', 'sin iva'], hint: 'si / no (por defecto: afecto)' },
    { key: 'description', label: 'Descripción', required: false, aliases: ['descripcion larga', 'detalle', 'description'] },
  ],
  contacts: [
    { key: 'rut', label: 'RUT', required: true, aliases: ['rut', 'r.u.t.', 'rut cliente', 'rut proveedor'], hint: 'Validado con Módulo 11' },
    { key: 'razonSocial', label: 'Razón Social', required: true, aliases: ['razon social', 'razonsocial', 'nombre', 'cliente', 'proveedor'] },
    { key: 'giro', label: 'Giro', required: false, aliases: ['giro', 'actividad'] },
    { key: 'email', label: 'Email', required: false, aliases: ['email', 'correo', 'mail', 'e-mail'] },
    { key: 'phone', label: 'Teléfono', required: false, aliases: ['telefono', 'phone', 'fono', 'celular'] },
    { key: 'address', label: 'Dirección', required: false, aliases: ['direccion', 'address', 'domicilio'] },
    { key: 'comuna', label: 'Comuna', required: false, aliases: ['comuna'] },
    { key: 'tipo', label: 'Tipo', required: false, aliases: ['tipo', 'type', 'rol'], hint: 'cliente / proveedor / ambos' },
  ],
  stock: [
    { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'codigo', 'code', 'codigo producto'], hint: 'Debe existir en tu catálogo' },
    { key: 'warehouseCode', label: 'Código Bodega', required: false, aliases: ['bodega', 'codigo bodega', 'warehouse', 'warehousecode'], hint: 'Vacío = bodega principal' },
    { key: 'quantity', label: 'Cantidad', required: true, aliases: ['cantidad', 'quantity', 'stock', 'stock inicial'] },
    { key: 'unitCost', label: 'Costo Unitario', required: true, aliases: ['costo', 'costo unitario', 'unitcost', 'costo compra'], hint: 'CLP entero, se usa como PMP inicial' },
  ],
  historicalSales: [
    { key: 'contactRut', label: 'RUT Cliente', required: true, aliases: ['rut', 'rut cliente', 'rut comprador', 'rut contraparte'], hint: 'Si no existe, el sistema lo registrará automáticamente' },
    { key: 'razonSocial', label: 'Razón Social', required: false, aliases: ['razon social', 'razonsocial', 'nombre', 'cliente', 'nombre cliente'], hint: 'Opcional (se registra en el contacto si no existe)' },
    { key: 'dteType', label: 'Tipo de Documento', required: true, aliases: ['tipo', 'tipo documento', 'tipo de documento', 'tipo dte', 'documento', 'tipo doc'], hint: 'Factura, Factura Exenta, Boleta, Guía de Despacho o Nota de Crédito' },
    { key: 'folio', label: 'Folio', required: true, aliases: ['folio', 'numero', 'numero documento', 'nro', 'n°'] },
    { key: 'issueDate', label: 'Fecha Emisión', required: true, aliases: ['fecha', 'fecha emision', 'fecha documento', 'fecha emision dte'], hint: 'AAAA-MM-DD o DD-MM-AAAA' },
    { key: 'productSku', label: 'SKU / Código', required: false, aliases: ['sku', 'codigo', 'code', 'codigo producto', 'sku producto'], hint: 'Opcional (si no viene se genera automáticamente)' },
    { key: 'productDetail', label: 'Producto / Descripción', required: true, aliases: ['producto', 'descripcion', 'detalle', 'nombre producto', 'producto detalle', 'detalle linea', 'item'], hint: 'Si no existe, se crea automáticamente en el catálogo' },
    { key: 'quantity', label: 'Cantidad', required: true, aliases: ['cantidad', 'quantity', 'qty', 'cant', 'unidades'] },
    { key: 'unitPrice', label: 'Precio Unitario Neto', required: true, aliases: ['precio unitario neto', 'precio unitario', 'precio', 'neto unitario', 'valor unitario'], hint: 'CLP entero sin IVA' },
    { key: 'lineSubtotal', label: 'Subtotal Neto', required: false, aliases: ['subtotal neto', 'subtotal', 'subtotal linea', 'monto neto linea'], hint: 'Opcional (Cantidad × Precio Unitario)' },
    { key: 'netAmount', label: 'Monto Neto', required: false, aliases: ['neto', 'monto neto', 'net amount'], hint: 'Opcional (autocalculado)' },
    { key: 'ivaAmount', label: 'IVA 19%', required: false, aliases: ['iva', 'iva 19', 'iva 19%', 'monto iva'], hint: 'Opcional (autocalculado)' },
    { key: 'totalAmount', label: 'Monto Total', required: false, aliases: ['total', 'monto total', 'total amount', 'bruto'], hint: 'Opcional (autocalculado)' },
    { key: 'paid', label: 'Pagado', required: false, aliases: ['pagado', 'paid', 'cobrado'], hint: 'si / no (por defecto: no)' },
  ],
  historicalPurchases: [
    { key: 'contactRut', label: 'RUT Proveedor', required: true, aliases: ['rut', 'rut proveedor', 'rut contraparte'], hint: 'Si no existe, el sistema lo registrará automáticamente' },
    { key: 'razonSocial', label: 'Razón Social', required: false, aliases: ['razon social', 'razonsocial', 'nombre', 'proveedor', 'nombre proveedor'], hint: 'Opcional (se registra en el contacto si no existe)' },
    { key: 'documentType', label: 'Tipo de Documento', required: true, aliases: ['tipo', 'tipo documento', 'tipo de documento', 'documento', 'tipo doc'], hint: 'Factura, Boleta, Guía de Despacho, Nota de Crédito u Otro' },
    { key: 'folio', label: 'Folio', required: true, aliases: ['folio', 'numero', 'numero documento', 'nro', 'n°'], hint: 'Folio del documento del proveedor' },
    { key: 'issueDate', label: 'Fecha Emisión', required: true, aliases: ['fecha', 'fecha emision', 'fecha documento'], hint: 'AAAA-MM-DD o DD-MM-AAAA' },
    { key: 'productSku', label: 'SKU / Código', required: false, aliases: ['sku', 'codigo', 'code', 'codigo producto', 'sku producto'], hint: 'Opcional (si no viene se genera automáticamente)' },
    { key: 'productDetail', label: 'Producto / Descripción', required: true, aliases: ['producto', 'descripcion', 'detalle', 'nombre producto', 'producto detalle', 'detalle linea', 'item'], hint: 'Si no existe, se crea automáticamente en el catálogo' },
    { key: 'quantity', label: 'Cantidad', required: true, aliases: ['cantidad', 'quantity', 'qty', 'cant', 'unidades'] },
    { key: 'unitPrice', label: 'Precio Unitario Neto', required: true, aliases: ['precio unitario neto', 'precio unitario', 'precio', 'neto unitario', 'valor unitario', 'costo unitario', 'costo'], hint: 'CLP entero sin IVA (se usa como costo PMP inicial)' },
    { key: 'lineSubtotal', label: 'Subtotal Neto', required: false, aliases: ['subtotal neto', 'subtotal', 'subtotal linea', 'monto neto linea'], hint: 'Opcional (Cantidad × Precio Unitario)' },
    { key: 'netAmount', label: 'Monto Neto', required: false, aliases: ['neto', 'monto neto', 'net amount'], hint: 'Opcional (autocalculado)' },
    { key: 'ivaAmount', label: 'IVA 19%', required: false, aliases: ['iva', 'iva 19', 'iva 19%', 'monto iva'], hint: 'Opcional (autocalculado)' },
    { key: 'totalAmount', label: 'Monto Total', required: false, aliases: ['total', 'monto total', 'total amount', 'bruto'], hint: 'Opcional (autocalculado)' },
    { key: 'paid', label: 'Pagado', required: false, aliases: ['pagado', 'paid'], hint: 'si / no (por defecto: no)' },
  ],
};

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  products: 'Productos',
  contacts: 'Clientes y Proveedores',
  stock: 'Stock Inicial',
  historicalSales: 'Ventas Históricas',
  historicalPurchases: 'Compras Históricas',
};

/** Permiso que exige escribir cada entidad, además de `import:data`. */
export const ENTITY_WRITE_PERMISSION = {
  products: 'products:write',
  contacts: 'contacts:write',
  stock: 'inventory:write',
  historicalSales: 'sales:write',
  historicalPurchases: 'purchases:write',
} as const;

/**
 * Subconjunto de `DteType` aceptado en la importación histórica de ventas.
 */
export const HISTORICAL_SALES_DTE_TYPES = [
  'FACTURA_33',
  'FACTURA_EXENTA_34',
  'BOLETA_39',
  'GUIA_DESPACHO_52',
  'NOTA_CREDITO_61',
  'NOTA_DEBITO_56',
] as const;

/**
 * Texto libre (columna del Excel, o lo que devuelva la IA al leer una foto) →
 * `DteType`. Las claves ya están normalizadas con `normalizeHeader` (minúsculas,
 * sin tildes) porque así se comparan en el validador de filas.
 */
export const DTE_TYPE_TEXT_MAP: Record<string, (typeof HISTORICAL_SALES_DTE_TYPES)[number]> = {
  factura: 'FACTURA_33',
  'factura afecta': 'FACTURA_33',
  'factura electronica': 'FACTURA_33',
  'factura 33': 'FACTURA_33',
  '33': 'FACTURA_33',
  'factura exenta': 'FACTURA_EXENTA_34',
  'factura no afecta': 'FACTURA_EXENTA_34',
  'factura no afecta o exenta': 'FACTURA_EXENTA_34',
  'factura exenta 34': 'FACTURA_EXENTA_34',
  '34': 'FACTURA_EXENTA_34',
  boleta: 'BOLETA_39',
  'boleta electronica': 'BOLETA_39',
  'boleta 39': 'BOLETA_39',
  '39': 'BOLETA_39',
  guia: 'GUIA_DESPACHO_52',
  'guia despacho': 'GUIA_DESPACHO_52',
  'guia de despacho': 'GUIA_DESPACHO_52',
  '52': 'GUIA_DESPACHO_52',
  'nota de credito': 'NOTA_CREDITO_61',
  'nota credito': 'NOTA_CREDITO_61',
  'nota de credito 61': 'NOTA_CREDITO_61',
  '61': 'NOTA_CREDITO_61',
  nc: 'NOTA_CREDITO_61',
  'nota de debito': 'NOTA_DEBITO_56',
  'nota debito': 'NOTA_DEBITO_56',
  'nota de debito 56': 'NOTA_DEBITO_56',
  '56': 'NOTA_DEBITO_56',
  nd: 'NOTA_DEBITO_56',
};

/**
 * Subconjunto de `PurchaseDocumentType` aceptado en la importación histórica de compras.
 */
export const HISTORICAL_PURCHASE_DOCUMENT_TYPES = [
  'FACTURA',
  'BOLETA',
  'GUIA_DESPACHO',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'OTRO',
] as const;

export const PURCHASE_DOC_TYPE_TEXT_MAP: Record<string, (typeof HISTORICAL_PURCHASE_DOCUMENT_TYPES)[number]> = {
  factura: 'FACTURA',
  'factura 33': 'FACTURA',
  '33': 'FACTURA',
  boleta: 'BOLETA',
  'boleta 39': 'BOLETA',
  '39': 'BOLETA',
  guia: 'GUIA_DESPACHO',
  'guia despacho': 'GUIA_DESPACHO',
  'guia de despacho': 'GUIA_DESPACHO',
  '52': 'GUIA_DESPACHO',
  'nota de credito': 'NOTA_CREDITO',
  'nota credito': 'NOTA_CREDITO',
  '61': 'NOTA_CREDITO',
  nc: 'NOTA_CREDITO',
  'nota de debito': 'NOTA_DEBITO',
  'nota debito': 'NOTA_DEBITO',
  '56': 'NOTA_DEBITO',
  nd: 'NOTA_DEBITO',
  otro: 'OTRO',
};


export interface RowError {
  column: string;
  message: string;
}

export interface CommitRowError extends RowError {
  /** Fila del archivo original (o del lote de fotos) donde ocurrió el error. */
  rowNumber: number;
}

/**
 * Línea de detalle (producto/servicio) de un documento armado por IA (foto o
 * prompt de texto). Ausente o vacío = comportamiento histórico de siempre
 * (una sola línea sintética sin `productId`, sin efecto en stock/PMP).
 */
export interface AiScanItemLine {
  /** Id local estable para editar en la tabla sin perder foco; no persiste. */
  localId: string;
  description: string;
  quantity: number;
  /** Precio unitario NETO en CLP entero, ya resuelto (no el precio impreso crudo). */
  unitPrice: number;
  /**
   * Producto real del catálogo vinculado a esta línea. `null` = sin
   * coincidencia confirmada: la línea se guarda como detalle informativo
   * (aporta al total del documento) pero no mueve stock/PMP, igual que el
   * comportamiento anterior a este vínculo con el catálogo.
   */
  productId: string | null;
  /** Solo para mostrar en pantalla junto al selector de producto. */
  productLabel: string | null;
}

export interface ParsedRow {
  /** Número de fila en el archivo original, contando el encabezado. */
  rowNumber: number;
  values: Record<string, string>;
  errors: RowError[];
  /**
   * Detalle de productos. Solo lo llenan `historicalSales`/`historicalPurchases`
   * armadas por IA (fotos o prompt) — el flujo de Excel/CSV nunca lo trae.
   */
  items?: AiScanItemLine[];
}

export interface ImportPreview {
  entity: ImportEntity;
  fileName: string;
  /** Encabezados detectados que no corresponden a ninguna columna conocida. */
  unknownHeaders: string[];
  missingRequiredColumns: string[];
  rows: ParsedRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  truncated: boolean;
}

export interface ImportResult {
  entity: ImportEntity;
  created: number;
  updated: number;
  skipped: number;
  /**
   * Filas que pasaron la vista previa pero fallaron al confirmar (folio
   * duplicado detectado justo en ese instante, producto eliminado entretanto,
   * etc). Solo lo llenan `stock`/`historicalSales`/`historicalPurchases`:
   * `products`/`contacts` siguen siendo todo-o-nada en una única transacción,
   * así que ante cualquier error ninguno de sus registros llega a crearse.
   */
  failedRows?: CommitRowError[];
}

export type AiScanConfidence = 'high' | 'medium' | 'low';

/**
 * Fila extraída por IA desde una foto de factura/boleta, ya mapeada al mismo
 * `values` (todo string) que produciría el parser de Excel/CSV para
 * `historicalSales`/`historicalPurchases` — así el front reutiliza la misma
 * tabla editable y el mismo commit que el flujo de planilla.
 */
export interface AiScanRow {
  entity: 'historicalSales' | 'historicalPurchases';
  row: ParsedRow;
  confidence: AiScanConfidence;
  warnings: string[];
  /** Nombre del archivo de imagen del que se extrajo, para ubicarla en la revisión. */
  sourceFileName: string;
}
