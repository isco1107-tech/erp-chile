import { isBoletaCode, requiresReferenceCode } from './codes';
import { buildTed, CONSUMIDOR_FINAL_RUT, type TedInput } from './ted';
import { element, escapeXml, fitField, siiDate, siiRut, siiTimestamp } from './xml';

/**
 * Construcción del XML de un Documento Tributario Electrónico.
 *
 * Sigue el esquema `DTE_v10.xsd` del SII. Dos reglas mandan sobre el resto:
 *
 *  1. El ORDEN de los elementos es obligatorio, no convencional. El SII valida
 *     contra un XSD con `xsd:sequence`: los mismos datos en otro orden se
 *     rechazan igual que si faltaran.
 *  2. La codificación declarada debe ser ISO-8859-1, no UTF-8. Es el único
 *     encoding que aceptan los validadores del SII para el envío.
 */

export interface DteIssuer {
  rut: string;
  businessName: string;
  /** Giro comercial. El SII lo recorta a 80 caracteres. */
  giro: string | null;
  /** Código de actividad económica del SII. */
  actividadEconomicaCodigo: string | null;
  address: string | null;
  comuna: string | null;
  ciudad: string | null;
}

export interface DteReceiver {
  rut: string;
  businessName: string;
  giro: string | null;
  address: string | null;
  comuna: string | null;
  ciudad: string | null;
}

export interface DteLine {
  /** Descripción del producto o servicio. */
  description: string;
  quantity: number;
  /** Precio unitario en pesos enteros. */
  unitPrice: number;
  /** Total de la línea en pesos enteros, ya con descuento aplicado. */
  lineTotal: number;
  /** Marca la línea como exenta dentro de un documento afecto. */
  isExempt: boolean;
  discountPercent?: number;
  sku?: string | null;
}

export interface DteTotals {
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
}

export interface DteReference {
  /** Código SII del documento referenciado. */
  siiCode: number;
  folio: number;
  issueDate: Date;
  /**
   * Código de referencia del SII: 1 anula, 2 corrige texto, 3 corrige montos.
   * Obligatorio en notas de crédito y débito.
   */
  reasonCode?: 1 | 2 | 3;
  reason?: string;
}

export interface BuildDteInput {
  siiCode: number;
  folio: number;
  issueDate: Date;
  dueDate?: Date | null;
  /** Forma de pago del SII: 1 contado, 2 crédito, 3 sin costo. */
  paymentMode: 1 | 2 | 3;
  issuer: DteIssuer;
  receiver: DteReceiver | null;
  lines: DteLine[];
  totals: DteTotals;
  references?: DteReference[];
  /** Bloque `<CAF>` literal y llave privada, para el timbre. */
  cafBlockXml: string;
  privateKeyPem: string;
  stampedAt?: Date;
  /** Tasa de IVA vigente. Parametrizable porque es una cifra legal que puede cambiar. */
  ivaRate?: number;
}

/** Largos máximos del esquema del SII, por campo. */
const MAX = {
  razonSocial: 100,
  giro: 80,
  direccion: 70,
  comuna: 20,
  ciudad: 20,
  itemName: 80,
  refReason: 90,
} as const;

/**
 * `ID` del elemento `<Documento>`. El SII exige un identificador único dentro
 * del envío; la convención del propio SII es tipo + folio.
 */
export function documentId(siiCode: number, folio: number): string {
  return `T${siiCode}F${folio}`;
}

function buildIdDoc(input: BuildDteInput): string {
  return [
    '<IdDoc>',
    element('TipoDTE', input.siiCode),
    element('Folio', input.folio),
    element('FchEmis', siiDate(input.issueDate)),
    element('FmaPago', input.paymentMode),
    input.dueDate ? element('FchVenc', siiDate(input.dueDate)) : '',
    '</IdDoc>',
  ].join('');
}

function buildEmisor(issuer: DteIssuer): string {
  return [
    '<Emisor>',
    element('RUTEmisor', siiRut(issuer.rut)),
    element('RznSoc', fitField(issuer.businessName, MAX.razonSocial)),
    element('GiroEmis', issuer.giro ? fitField(issuer.giro, MAX.giro) : null),
    element('Acteco', issuer.actividadEconomicaCodigo),
    element('DirOrigen', issuer.address ? fitField(issuer.address, MAX.direccion) : null),
    element('CmnaOrigen', issuer.comuna ? fitField(issuer.comuna, MAX.comuna) : null),
    element('CiudadOrigen', issuer.ciudad ? fitField(issuer.ciudad, MAX.ciudad) : null),
    '</Emisor>',
  ].join('');
}

/**
 * Bloque `<Receptor>`.
 *
 * En una boleta a consumidor final el SII acepta el RUT genérico 66666666-6 y
 * no exige giro ni dirección: obligar esos datos en el mostrador haría
 * impracticable la venta al público, que es justamente el caso de uso de la
 * boleta.
 */
function buildReceptor(receiver: DteReceiver | null, siiCode: number): string {
  if (!receiver) {
    return ['<Receptor>', element('RUTRecep', CONSUMIDOR_FINAL_RUT), element('RznSocRecep', 'Consumidor Final'), '</Receptor>'].join('');
  }

  const boleta = isBoletaCode(siiCode);

  return [
    '<Receptor>',
    element('RUTRecep', siiRut(receiver.rut)),
    element('RznSocRecep', fitField(receiver.businessName, MAX.razonSocial)),
    // Giro y dirección son obligatorios en factura y opcionales en boleta.
    boleta ? '' : element('GiroRecep', receiver.giro ? fitField(receiver.giro, MAX.giro) : null),
    element('DirRecep', receiver.address ? fitField(receiver.address, MAX.direccion) : null),
    element('CmnaRecep', receiver.comuna ? fitField(receiver.comuna, MAX.comuna) : null),
    element('CiudadRecep', receiver.ciudad ? fitField(receiver.ciudad, MAX.ciudad) : null),
    '</Receptor>',
  ].join('');
}

/**
 * Bloque `<Totales>`.
 *
 * `MntNeto`, `TasaIVA` e `IVA` se omiten cuando no hay monto afecto: en un
 * documento totalmente exento el SII rechaza un `<IVA>0</IVA>` explícito, hay
 * que no declararlo. Es la clase de detalle que solo aparece al validar contra
 * el esquema real.
 */
function buildTotales(totals: DteTotals, ivaRate: number): string {
  const parts = ['<Totales>'];

  if (totals.netAmount > 0) parts.push(element('MntNeto', totals.netAmount));
  if (totals.exemptAmount > 0) parts.push(element('MntExe', totals.exemptAmount));
  if (totals.netAmount > 0) {
    parts.push(element('TasaIVA', ivaRate));
    parts.push(element('IVA', totals.ivaAmount));
  }
  parts.push(element('MntTotal', totals.totalAmount));
  parts.push('</Totales>');

  return parts.join('');
}

/**
 * Líneas de detalle.
 *
 * `IndExe` marca una línea exenta dentro de un documento afecto — sin esa
 * marca, el SII asume que toda línea de un documento tipo 33 paga IVA y la
 * suma declarada en `<Totales>` deja de cuadrar con el detalle.
 */
function buildDetalle(lines: DteLine[]): string {
  return lines
    .map((line, index) =>
      [
        '<Detalle>',
        element('NroLinDet', index + 1),
        line.sku ? `<CdgItem>${element('TpoCodigo', 'INT')}${element('VlrCodigo', line.sku)}</CdgItem>` : '',
        line.isExempt ? element('IndExe', 1) : '',
        element('NmbItem', fitField(line.description, MAX.itemName)),
        element('QtyItem', line.quantity),
        element('PrcItem', line.unitPrice),
        line.discountPercent && line.discountPercent > 0 ? element('DescuentoPct', line.discountPercent) : '',
        element('MontoItem', Math.round(line.lineTotal)),
        '</Detalle>',
      ].join('')
    )
    .join('');
}

function buildReferencias(references: DteReference[]): string {
  return references
    .map((reference, index) =>
      [
        '<Referencia>',
        element('NroLinRef', index + 1),
        element('TpoDocRef', reference.siiCode),
        element('FolioRef', reference.folio),
        element('FchRef', siiDate(reference.issueDate)),
        reference.reasonCode ? element('CodRef', reference.reasonCode) : '',
        reference.reason ? element('RazonRef', fitField(reference.reason, MAX.refReason)) : '',
        '</Referencia>',
      ].join('')
    )
    .join('');
}

export interface BuiltDte {
  /** XML completo del `<DTE>`, sin firmar todavía con el certificado de la empresa. */
  xml: string;
  /** El `<TED>` incrustado, para poder imprimirlo como PDF417 sin recalcularlo. */
  tedXml: string;
  documentId: string;
}

/**
 * Arma el `<DTE>` completo, con su timbre ya calculado.
 *
 * Lo que devuelve NO está firmado con el certificado digital de la empresa: le
 * falta el bloque `<Signature>` de XML-DSig que exige el SII para aceptar el
 * envío. El timbre (TED) y la firma del documento son cosas distintas — el
 * primero usa la llave del CAF y va impreso; la segunda usa el certificado del
 * representante legal y autentica el envío.
 */
export function buildDte(input: BuildDteInput): BuiltDte {
  if (requiresReferenceCode(input.siiCode) && (!input.references || input.references.length === 0)) {
    throw new Error('Las notas de crédito y débito exigen referenciar el documento que modifican');
  }
  if (input.lines.length === 0) {
    throw new Error('El documento debe tener al menos una línea de detalle');
  }

  const ivaRate = input.ivaRate ?? 19;
  const stampedAt = input.stampedAt ?? new Date();
  const id = documentId(input.siiCode, input.folio);

  const tedInput: TedInput = {
    issuerRut: input.issuer.rut,
    siiCode: input.siiCode,
    folio: input.folio,
    issueDate: input.issueDate,
    receiverRut: input.receiver?.rut ?? CONSUMIDOR_FINAL_RUT,
    receiverName: input.receiver?.businessName ?? 'Consumidor Final',
    totalAmount: input.totals.totalAmount,
    firstItemDescription: input.lines[0].description,
    cafBlockXml: input.cafBlockXml,
    privateKeyPem: input.privateKeyPem,
    stampedAt,
  };
  const ted = buildTed(tedInput);

  const documento = [
    `<Documento ID="${escapeXml(id)}">`,
    '<Encabezado>',
    buildIdDoc(input),
    buildEmisor(input.issuer),
    buildReceptor(input.receiver, input.siiCode),
    buildTotales(input.totals, ivaRate),
    '</Encabezado>',
    buildDetalle(input.lines),
    input.references && input.references.length > 0 ? buildReferencias(input.references) : '',
    ted.xml,
    element('TmstFirma', siiTimestamp(stampedAt)),
    '</Documento>',
  ].join('');

  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><DTE version="1.0">${documento}</DTE>`;

  return { xml, tedXml: ted.xml, documentId: id };
}
