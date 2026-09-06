/**
 * Glosario de términos tributarios/contables en español simple, sin jerga,
 * para los tooltips `<InfoTooltip />` del dashboard. Fuente única de verdad
 * para que el texto no diverja entre los distintos puntos donde se usa.
 *
 * Textos definidos por el hallazgo #1 de la auditoría de UX (2026-08-20):
 * el sistema no explicaba ningún término y eso generaba errores costosos en
 * usuarios que no son contadores.
 */
export const TAX_GLOSSARY = {
  iva: 'Impuesto al Valor Agregado: 19% que se suma al precio de la mayoría de productos y servicios.',
  neto: 'El precio antes de sumar el IVA.',
  exento: 'Producto o servicio que por ley no paga IVA.',
  pmp: 'Precio Medio Ponderado: el costo promedio de un producto, recalculado cada vez que compras más stock a un precio distinto.',
  folio: 'El número correlativo que identifica este documento ante el SII. No se puede repetir ni saltar.',
  dte: 'Documento Tributario Electrónico: el nombre genérico para facturas, boletas, guías y notas que emite el sistema.',
  f29: 'La declaración mensual de impuestos que se presenta al SII, con el IVA que cobraste y el que pagaste.',
  ppm: 'Pago Provisional Mensual: un anticipo al impuesto a la renta que se paga cada mes junto con el F29.',
  debitoFiscal: 'El IVA que cobraste en tus ventas este período.',
  creditoFiscal: 'El IVA que pagaste en tus compras este período. Se resta del débito fiscal para saber cuánto pagar al SII.',
  notaCreditoDebito: 'Documento que corrige una factura o boleta ya emitida, para anular o modificar parte de un monto.',
  cxc: 'Cuentas por Cobrar: el dinero que tus clientes te deben.',
  cxp: 'Cuentas por Pagar: el dinero que tú le debes a tus proveedores.',
  remanente: 'Crédito de IVA que te sobró el mes pasado (pagaste más IVA del que cobraste) y se arrastra para descontarlo este mes.',
  retencionHonorarios: 'Un porcentaje que le descuentas a quien te emite una boleta de honorarios, y que tú (no él) declaras y pagas al SII.',
} as const;
