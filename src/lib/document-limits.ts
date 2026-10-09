/**
 * Máximo de líneas por documento (venta, compra, orden, recepción, POS).
 *
 * Cada línea se procesa con el correlativo de folio y los productos del
 * documento bloqueados hasta el commit. Sin tope, un documento con miles de
 * líneas mantenía esos locks hasta vencer la transacción y frenaba todas las
 * ventas de la empresa (auditoría de estrés 2026-10-05). 300 líneas cubre
 * con holgura cualquier documento real.
 */
export const MAX_DOCUMENT_LINES = 300;

export const MAX_DOCUMENT_LINES_MESSAGE = `Un documento admite hasta ${MAX_DOCUMENT_LINES} líneas: divídelo en dos o más documentos.`;
