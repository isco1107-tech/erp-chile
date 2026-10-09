/**
 * Glosario único de términos tributarios, contables, de inventario y de
 * personas, en español simple y sin jerga. Es la fuente de verdad de DOS
 * lugares que nunca deben contradecirse:
 *
 *   - los tooltips `<InfoTooltip />` / `<FieldLabel />` del panel (usan `short`);
 *   - el glosario del manual y del asistente (`GLOSSARY` en
 *     `src/modules/manual/knowledge.ts` se deriva de aquí y usa `definition`).
 *
 * Cada entrada tiene:
 *   - `term`: el nombre como lo ve el usuario;
 *   - `short`: texto de tooltip, máximo `GLOSSARY_SHORT_MAX` caracteres;
 *   - `definition`: explicación completa para el manual.
 *
 * Reglas: nunca cifras que cambian (tasas de AFP, topes, valor de UF/UTM):
 * esas entran como parámetros guardados, ver CLAUDE.md. Orden del objeto =
 * orden en el manual.
 *
 * Origen: hallazgo #1 de la auditoría de UX (2026-08-20): el sistema no
 * explicaba ningún término y eso generaba errores costosos en usuarios que no
 * son contadores.
 */

export interface GlossaryEntry {
  term: string;
  short: string;
  definition: string;
}

/** Largo máximo de un `short` (un tooltip más largo ya no se lee de un vistazo). */
export const GLOSSARY_SHORT_MAX = 130;

export const GLOSSARY_ENTRIES = {
  iva: {
    term: 'IVA',
    short: 'Impuesto al Valor Agregado: 19% que se suma al precio de la mayoría de productos y servicios.',
    definition:
      'Impuesto al Valor Agregado, 19% en Chile, sobre el monto neto de las líneas afectas. Los productos marcados como exentos no lo pagan.',
  },
  neto: {
    term: 'Neto / Bruto',
    short: 'El neto es el precio antes de sumar el IVA; el bruto es el neto más el IVA.',
    definition: 'El neto es el monto sin IVA; el bruto es el neto más el IVA. Los montos finales se manejan en pesos enteros.',
  },
  exento: {
    term: 'Exento de IVA',
    short: 'Producto o servicio que por ley no paga IVA.',
    definition:
      'Producto o servicio que por ley no paga IVA. Se marca en el producto (no en el documento): su monto va al total exento del documento.',
  },
  debitoFiscal: {
    term: 'Débito fiscal',
    short: 'El IVA que cobraste en tus ventas este período.',
    definition: 'El IVA que recaudaste en tus ventas del período y le debes al SII.',
  },
  creditoFiscal: {
    term: 'Crédito fiscal',
    short: 'El IVA que pagaste en tus compras este período. Se resta del débito fiscal para saber cuánto pagar al SII.',
    definition: 'El IVA que pagaste en tus compras del período y puedes descontar del débito.',
  },
  remanente: {
    term: 'Remanente de crédito fiscal',
    short: 'Crédito de IVA que te sobró el mes pasado (pagaste más IVA del que cobraste) y se descuenta este mes.',
    definition: 'Cuando el crédito del mes supera al débito, la diferencia queda como remanente y se arrastra al mes siguiente.',
  },
  f29: {
    term: 'F29',
    short: 'La declaración mensual de impuestos que se presenta al SII, con el IVA que cobraste y el que pagaste.',
    definition:
      'Formulario mensual del SII donde se declara el IVA y el PPM. El sistema lo calcula sobre tus documentos reales como apoyo; la declaración la hace tu contador.',
  },
  ppm: {
    term: 'PPM',
    short: 'Pago Provisional Mensual: un anticipo al impuesto a la renta que se paga cada mes junto con el F29.',
    definition:
      'Pago Provisional Mensual: anticipo del impuesto a la renta, un porcentaje de tus ventas netas. La tasa se configura en el Perfil de Empresa.',
  },
  rcv: {
    term: 'RCV',
    short: 'Registro de Compras y Ventas: el libro que el SII arma con los documentos electrónicos informados.',
    definition:
      'Registro de Compras y Ventas: el libro que el SII arma con los documentos electrónicos informados. Se cuadra con el ERP antes de declarar.',
  },
  dte: {
    term: 'DTE',
    short: 'Documento Tributario Electrónico: el nombre genérico para facturas, boletas, guías y notas que emite el sistema.',
    definition:
      'Documento Tributario Electrónico: boleta (39), factura afecta (33), factura exenta (34), guía de despacho (52), nota de débito (56) y nota de crédito (61).',
  },
  folio: {
    term: 'Folio',
    short: 'El número correlativo que identifica este documento ante el SII. No se puede repetir ni saltar.',
    definition:
      'Número correlativo de cada documento tributario. No se reutiliza ni se salta: un documento emitido se corrige con nota de crédito, no borrándolo.',
  },
  caf: {
    term: 'CAF',
    short: 'Archivo del SII que autoriza un rango de folios para emitir documentos electrónicos.',
    definition:
      'Código de Autorización de Folios: archivo del SII que autoriza un rango de folios para un tipo de documento y trae la llave con que se timbra.',
  },
  ted: {
    term: 'Timbre electrónico (TED)',
    short: 'Firma que va en cada documento emitido con CAF y permite verificar que no fue alterado.',
    definition: 'Firma que va en cada documento emitido con CAF; permite verificar que no fue alterado.',
  },
  cotizacion: {
    term: 'Cotización',
    short: 'Propuesta de precios para el cliente. No es documento tributario ni mueve stock.',
    definition: 'Propuesta de precio al cliente. No es un documento tributario: no usa folio ni mueve stock.',
  },
  notaVenta: {
    term: 'Nota de venta',
    short: 'Pedido confirmado del cliente antes de facturar o despachar; permite entregas parciales.',
    definition: 'Pedido del cliente que reserva stock y se factura o despacha por partes.',
  },
  guiaDespacho: {
    term: 'Guía de despacho',
    short: 'Respalda el traslado de mercadería; después se puede formalizar con una factura.',
    definition: 'Documento que acompaña la mercadería que sale; mueve stock y después se factura.',
  },
  notaCreditoDebito: {
    term: 'Nota de crédito',
    short: 'Documento que corrige una factura o boleta ya emitida, para anular o modificar parte de un monto.',
    definition: 'Documento que anula o rebaja, total o parcialmente, uno emitido antes.',
  },
  boleta: {
    term: 'Boleta',
    short: 'Documento de venta a consumidor final; el comprador no usa su IVA como crédito.',
    definition:
      'Documento de venta a consumidor final (persona sin giro). El IVA va incluido en el precio y el comprador no lo usa como crédito fiscal.',
  },
  factura: {
    term: 'Factura',
    short: 'Documento de venta a empresas: separa el IVA y el comprador lo usa como crédito fiscal.',
    definition:
      'Documento de venta a empresas: muestra el neto y el IVA por separado, y el comprador usa ese IVA como crédito fiscal. La factura exenta es la que no lleva IVA.',
  },
  consumidorFinal: {
    term: 'Consumidor final',
    short: 'Cliente sin RUT informado; las boletas usan el RUT genérico 66.666.666-6.',
    definition:
      'Cliente sin RUT informado: las boletas a consumidor final usan el RUT genérico 66.666.666-6. No se cuenta como cliente en los análisis.',
  },
  pmp: {
    term: 'PMP',
    short: 'Precio Medio Ponderado: el costo promedio de un producto, recalculado cada vez que compras a un precio distinto.',
    definition:
      'Precio Medio Ponderado: el costo unitario de un producto, recalculado en cada compra como promedio entre el stock que tenías y lo que entró.',
  },
  kardex: {
    term: 'Kardex',
    short: 'Historial de entradas y salidas de cada producto con su costo; explica el stock actual.',
    definition:
      'Historial de movimientos de un producto: cada entrada, salida, ajuste y transferencia, con cantidad, costo y documento de origen.',
  },
  stockValorizado: {
    term: 'Stock valorizado',
    short: 'La cantidad en bodega por su costo promedio (PMP): el valor contable del inventario.',
    definition: 'La cantidad en bodega multiplicada por su costo PMP vigente: el valor contable del inventario.',
  },
  loteFefo: {
    term: 'Lote / FEFO',
    short: 'Un lote agrupa unidades con el mismo vencimiento. FEFO: primero en vencer, primero en salir.',
    definition:
      'Un lote agrupa unidades con la misma fecha de vencimiento. FEFO ("primero en vencer, primero en salir") es la regla con que se despachan.',
  },
  sku: {
    term: 'SKU',
    short: 'Código interno único para identificar cada producto; puede ser el código de barras.',
    definition:
      'Código interno único para identificar cada producto (no se puede repetir en la empresa). Puede ser el mismo del código de barras.',
  },
  stockMinimo: {
    term: 'Stock mínimo',
    short: 'Cuando el stock baja de esta cantidad te avisamos para reponer. Con 0 no hay aviso.',
    definition:
      'Cantidad bajo la cual el sistema te avisa que hay que reponer el producto (alerta de stock bajo). Con 0 no se avisa.',
  },
  productoInventariable: {
    term: 'Producto inventariable',
    short: 'Actívalo si el producto tiene stock que contar (no para servicios). Así se descuenta al vender.',
    definition:
      'Producto con stock que se cuenta y se descuenta al vender. Los servicios no se marcan: no tienen stock y se pueden vender siempre.',
  },
  bodega: {
    term: 'Bodega',
    short: 'Lugar físico donde guardas mercadería; el stock se controla por bodega.',
    definition: 'Lugar físico donde guardas mercadería (bodega, tienda, sucursal). El stock se controla por bodega y se puede transferir entre ellas.',
  },
  stockNegativo: {
    term: 'Ventas con stock negativo',
    short: 'Permite vender aunque el sistema no tenga stock registrado; úsalo solo si cargas el stock después.',
    definition:
      'Si está activo, el sistema deja vender aunque el stock registrado no alcance y el saldo queda negativo. Úsalo solo si cargas las compras o el stock después; si no, el inventario deja de ser confiable.',
  },
  industria: {
    term: 'Industria (rubro)',
    short: 'Rubro de tu empresa. Define el plan de cuentas inicial: Servicios deja sin uso las cuentas de inventario.',
    definition:
      'Rubro de la empresa. Define el plan de cuentas inicial: con «Servicios» las cuentas de Existencias y Costo de ventas quedan desactivadas. Solo se aplica al crear el plan; cambiarlo después no modifica un plan ya creado.',
  },
  boletaHonorarios: {
    term: 'Boleta de honorarios',
    short: 'Documento de un profesional independiente por sus servicios, con una retención de impuesto.',
    definition:
      'Documento de un profesional independiente por sus servicios, con una retención de impuesto calculada con la tasa de tu empresa.',
  },
  retencionHonorarios: {
    term: 'Retención de honorarios',
    short: 'Porcentaje que descuentas a quien te emite una boleta de honorarios; tú lo declaras y pagas al SII.',
    definition:
      'Porcentaje que le descuentas a quien te emite una boleta de honorarios, y que tú (no él) declaras y pagas al SII. La tasa se configura en el Perfil de Empresa.',
  },
  cxc: {
    term: 'Cuenta por cobrar (CxC)',
    short: 'Cuentas por Cobrar: el dinero que tus clientes te deben.',
    definition: 'Lo que un cliente te debe por un documento a crédito todavía no pagado del todo.',
  },
  cxp: {
    term: 'Cuenta por pagar (CxP)',
    short: 'Cuentas por Pagar: el dinero que tú le debes a tus proveedores.',
    definition: 'Lo que le debes a un proveedor por una factura todavía no pagada del todo.',
  },
  conciliacion: {
    term: 'Conciliación bancaria',
    short: 'Comparar la cartola del banco con tus cobros y pagos registrados para que ambos saldos calcen.',
    definition: 'Comparar la cartola del banco con tus cobros y pagos registrados para que ambos saldos calcen.',
  },
  nominaPago: {
    term: 'Nómina de pago',
    short: 'Lote de facturas de proveedores que se pagan juntas con un archivo para el portal del banco.',
    definition: 'Lote de facturas de proveedores que se pagan juntas con un archivo para el portal del banco.',
  },
  turnoCaja: {
    term: 'Turno de caja',
    short: 'Período entre la apertura y el cierre de una caja del punto de venta, con su arqueo.',
    definition:
      'Período entre la apertura y el cierre de una caja del punto de venta. Al cerrarlo se hace el arqueo: se cuenta el efectivo y se compara con lo esperado.',
  },
  arqueo: {
    term: 'Arqueo de caja',
    short: 'Conteo del efectivo al cerrar un turno, comparado contra lo esperado.',
    definition: 'Conteo del efectivo al cerrar un turno del POS, comparado contra lo esperado, dejando la diferencia declarada.',
  },
  centroCosto: {
    term: 'Centro de costo',
    short: 'Área, sucursal o proyecto al que imputas un gasto o ingreso para medir su resultado.',
    definition:
      'Área, sucursal o proyecto al que imputas un gasto o ingreso para medir cuánto gana o gasta cada uno por separado.',
  },
  glosa: {
    term: 'Glosa',
    short: 'Texto libre que explica el motivo de un movimiento o asiento.',
    definition: 'Texto libre que explica el motivo de un movimiento o asiento contable, para entenderlo después sin buscar el documento.',
  },
  liquidacion: {
    term: 'Liquidación de sueldo',
    short: 'Detalle mensual del sueldo: haberes, descuentos previsionales, impuesto único y líquido a pagar.',
    definition: 'Detalle mensual del sueldo de un trabajador: haberes, descuentos previsionales, impuesto único y líquido a pagar.',
  },
  afp: {
    term: 'AFP',
    short: 'Administradora de Fondos de Pensiones donde cotiza el trabajador.',
    definition:
      'Administradora de Fondos de Pensiones donde cotiza el trabajador para su jubilación. La tasa de cada AFP se confirma cada mes en Previred.',
  },
  isapre: {
    term: 'Isapre',
    short: 'Seguro de salud privado al que cotiza el trabajador (si no, cotiza en Fonasa).',
    definition:
      'Seguro de salud privado al que cotiza el trabajador. Su plan se pacta en UF; si el trabajador no está en una isapre, cotiza en Fonasa.',
  },
  fonasa: {
    term: 'Fonasa',
    short: 'Sistema público de salud; es la opción si el trabajador no está en una isapre.',
    definition: 'Sistema público de salud. Es la opción del trabajador que no está en una isapre.',
  },
  sueldoImponible: {
    term: 'Sueldo imponible',
    short: 'Remuneración sobre la que se calculan las cotizaciones de pensión y salud.',
    definition:
      'Remuneración sobre la que se calculan las cotizaciones de pensión y salud (sueldo base, gratificación y otros haberes imponibles, hasta el tope legal del mes).',
  },
  gratificacion: {
    term: 'Gratificación',
    short: 'Parte de las utilidades que la ley obliga a pagar al trabajador; elige la modalidad que dice su contrato.',
    definition:
      'Parte de las utilidades que la ley obliga a pagar al trabajador. Elige la modalidad que dice su contrato; el tope se toma de los parámetros del período.',
  },
  colacionMovilizacion: {
    term: 'Colación y movilización',
    short: 'Asignaciones para alimentación y traslado; no son imponibles (no pagan cotizaciones).',
    definition:
      'Asignaciones para alimentación y traslado del trabajador. No son imponibles: no pagan cotizaciones, y se suman al líquido a pagar.',
  },
  previred: {
    term: 'Previred',
    short: 'Plataforma donde se declaran y pagan las cotizaciones. Úsala para confirmar UF, UTM y topes.',
    definition:
      'Plataforma donde se pagan las cotizaciones previsionales y que publica cada mes los indicadores (UF, UTM, topes y tasas) que usa el cálculo de sueldos.',
  },
  ufUtm: {
    term: 'UF / UTM',
    short: 'Unidades reajustables oficiales (UF diaria, UTM mensual) para topes, multas y montos legales.',
    definition:
      'Unidades reajustables chilenas. Se usan para topes previsionales, planes de salud y tramos del impuesto único; su valor se confirma cada mes.',
  },
  finiquito: {
    term: 'Finiquito',
    short: 'Documento que cierra la relación laboral con el cálculo de lo que se le debe al trabajador.',
    definition: 'Documento que cierra la relación laboral con el cálculo de lo que se le debe al trabajador al término del contrato.',
  },
  rut: {
    term: 'RUT',
    short: 'Rol Único Tributario: identifica a personas y empresas ante el SII (ej. 76.123.456-7).',
    definition:
      'Rol Único Tributario: el número que identifica a personas y empresas ante el SII (ej. 76.123.456-7). Se valida con su dígito verificador.',
  },
  razonSocial: {
    term: 'Razón social',
    short: 'Nombre legal de la empresa tal como figura en el SII y en los documentos tributarios.',
    definition:
      'Nombre legal de la empresa tal como figura en el SII y en los documentos tributarios. Puede ser distinto del nombre de fantasía con que se la conoce.',
  },
  giro: {
    term: 'Giro',
    short: "Actividad económica declarada al SII (ej. 'Venta al por menor de café').",
    definition: "Actividad económica que la empresa declara al SII (ej. 'Venta al por menor de café'). Aparece impresa en las facturas.",
  },
  codigoActividad: {
    term: 'Código de actividad',
    short: 'Código numérico del SII que clasifica tu giro; lo ves en tu carpeta tributaria.',
    definition: 'Código numérico del SII que clasifica tu giro. Lo ves en tu carpeta tributaria electrónica, en la sección de actividades.',
  },
  npsCsat: {
    term: 'NPS / CSAT',
    short: 'Indicadores de satisfacción del cliente: CSAT (1 a 5) mide conformidad y NPS (0 a 10) cuánto te recomendaría.',
    definition:
      'Indicadores de satisfacción: CSAT mide qué tan conforme quedó el cliente (1 a 5) y NPS cuánto te recomendaría (0 a 10).',
  },
  rfm: {
    term: 'RFM',
    short: 'Segmenta clientes por Recencia (cuándo compró), Frecuencia (cuántas veces) y Monto (cuánto).',
    definition: 'Segmentación de clientes por Recencia (cuándo compró), Frecuencia (cuántas veces) y Monto (cuánto).',
  },
  canje: {
    term: 'Canje',
    short: 'Aporte de un auspiciador en productos o servicios en vez de dinero.',
    definition: 'Aporte de un auspiciador en productos o servicios en vez de dinero; se valoriza y se reporta aparte del efectivo.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY_ENTRIES;

/** Textos cortos de tooltip por clave (los que ya consumía el panel). */
export const TAX_GLOSSARY: Record<GlossaryKey, string> = Object.fromEntries(
  (Object.keys(GLOSSARY_ENTRIES) as GlossaryKey[]).map((key) => [key, GLOSSARY_ENTRIES[key].short])
) as Record<GlossaryKey, string>;

/** Entradas en el orden del objeto, para el manual y el asistente. */
export const GLOSSARY_LIST: GlossaryEntry[] = (Object.keys(GLOSSARY_ENTRIES) as GlossaryKey[]).map((key) => ({
  term: GLOSSARY_ENTRIES[key].term,
  short: GLOSSARY_ENTRIES[key].short,
  definition: GLOSSARY_ENTRIES[key].definition,
}));

export function getGlossaryEntry(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY_ENTRIES[key];
}
