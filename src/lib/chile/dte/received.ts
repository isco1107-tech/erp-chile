import crypto from 'crypto';
import { formatRut, rutKey } from '@/lib/chile/rut';

/**
 * Lectura de DTE recibidos de proveedores.
 *
 * Un proveedor entrega su documento como `EnvioDTE` (un sobre firmado con uno
 * o más `<DTE>`) o como un `<DTE>` suelto. De cada uno se extraen los datos de
 * negocio (emisor, folio, montos, líneas, referencias) y se verifica el
 * timbre electrónico: la firma `<FRMT>` del bloque `<DD>` con la llave pública
 * que el propio CAF trae en `<RSAPK>`.
 *
 * Mismo criterio que `caf.ts`: se trabaja sobre el texto con expresiones
 * acotadas y nunca se reserializa un árbol XML, porque el timbre se calculó
 * sobre los bytes exactos del `<DD>`.
 *
 * Alcance honesto de la verificación: un timbre VALID dice que los datos del
 * `<DD>` no se alteraron después de firmarse con la llave del CAF. Que ese CAF
 * lo haya entregado realmente el SII (firma `<FRMA>` con la llave del SII) no
 * se comprueba acá; la autenticidad ante el SII se confirma cruzando el
 * documento con el Registro de Compras (RCV).
 */

export type TedStatus = 'VALID' | 'INVALID' | 'MISSING';

export interface ReceivedDteLine {
  lineNumber: number;
  name: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  discount: number;
  amount: number;
  exempt: boolean;
}

export interface ReceivedDteReference {
  lineNumber: number;
  /** Tipo de documento referenciado: código SII (`33`) o texto (`801` = OC, `HES`…). */
  docType: string;
  folio: string;
  date: string | null;
  /** 1 anula, 2 corrige texto, 3 corrige montos. */
  code: number | null;
  reason: string | null;
}

export interface ParsedReceivedDte {
  siiCode: number;
  folio: number;
  /** `AAAA-MM-DD`, tal como lo declara el documento. */
  issueDate: string;
  dueDate: string | null;
  issuerRut: string;
  issuerName: string;
  issuerGiro: string | null;
  receiverRut: string;
  receiverName: string | null;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  totalAmount: number;
  lines: ReceivedDteLine[];
  references: ReceivedDteReference[];
  tedStatus: TedStatus;
  /** Por qué el timbre no es válido, para mostrarlo tal cual. */
  tedIssue: string | null;
  /** Bloque `<DTE>…</DTE>` literal. */
  xml: string;
}

export class ReceivedDteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceivedDteParseError';
  }
}

// ─── Lectura de texto XML ────────────────────────────────────────────────────

/**
 * Recorre las ocurrencias de un elemento (`<DTE>` o `<sii:DTE>`) en tiempo
 * lineal: la apertura se busca con una expresión acotada y el cierre con
 * `indexOf`. Una expresión perezosa del tipo `<DTE>[\s\S]*?</DTE>` sobre un
 * archivo con miles de aperturas sin cierre se vuelve cuadrática, y este
 * archivo lo sube un usuario.
 */
function scan(xml: string, tag: string, limit = Number.POSITIVE_INFINITY): { start: number; innerStart: number; innerEnd: number; end: number }[] {
  const open = new RegExp(`<((?:[A-Za-z_][\\w.-]{0,40}:)?${tag})(?:\\s[^<>]{0,2000})?>`, 'g');
  const found: { start: number; innerStart: number; innerEnd: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while (found.length < limit && (match = open.exec(xml)) !== null) {
    const close = `</${match[1]}>`;
    const innerStart = open.lastIndex;
    const innerEnd = xml.indexOf(close, innerStart);
    if (innerEnd === -1) break;
    const end = innerEnd + close.length;
    found.push({ start: match.index, innerStart, innerEnd, end });
    open.lastIndex = end;
  }
  return found;
}

function blocks(xml: string, tag: string): string[] {
  return scan(xml, tag).map((hit) => xml.slice(hit.start, hit.end));
}

function block(xml: string, tag: string): string | null {
  const [hit] = scan(xml, tag, 1);
  return hit ? xml.slice(hit.start, hit.end) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Texto de la primera ocurrencia de un elemento simple, ya sin entidades. */
function text(xml: string, tag: string): string | null {
  const [hit] = scan(xml, tag, 1);
  if (!hit) return null;
  const raw = xml.slice(hit.innerStart, hit.innerEnd).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const value = decodeEntities(raw).trim();
  return value === '' ? null : value;
}

function firstText(xml: string, tags: string[]): string | null {
  for (const tag of tags) {
    const value = text(xml, tag);
    if (value !== null) return value;
  }
  return null;
}

function amount(xml: string, tag: string): number {
  const raw = text(xml, tag);
  if (raw === null) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function decimal(xml: string, tag: string): number | null {
  const raw = text(xml, tag);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}


/**
 * Decodifica el archivo según lo que declara. Los DTE del SII vienen en
 * ISO-8859-1; leerlos como UTF-8 convierte cada tilde en "�" y rompe tanto la
 * razón social como la verificación del timbre.
 */
export function decodeDteFile(buffer: Buffer): string {
  const head = buffer.subarray(0, 200).toString('latin1');
  const declared = /encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase() ?? '';
  if (declared.includes('8859') || declared.includes('latin')) return buffer.toString('latin1');
  const utf8 = buffer.toString('utf8');
  // Sin declaración y con bytes que no son UTF-8 válido: es Latin-1.
  return utf8.includes('�') ? buffer.toString('latin1') : utf8;
}

// ─── Timbre electrónico ──────────────────────────────────────────────────────

function base64ToBase64Url(value: string): string {
  return value.replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Llave pública del CAF a partir de su módulo y exponente (`<RSAPK><M>/<E>`). */
function cafPublicKey(dd: string): crypto.KeyObject | null {
  const rsapk = block(dd, 'RSAPK');
  if (!rsapk) return null;
  const modulus = text(rsapk, 'M');
  const exponent = text(rsapk, 'E');
  if (!modulus || !exponent) return null;
  try {
    return crypto.createPublicKey({
      key: { kty: 'RSA', n: base64ToBase64Url(modulus), e: base64ToBase64Url(exponent) },
      format: 'jwk',
    });
  } catch {
    return null;
  }
}

/**
 * Verifica la firma del `<DD>`. El SII firma el `<DD>` en ISO-8859-1 y sin
 * espacios entre etiquetas; como hay emisores que lo indentan al armar el
 * archivo, se prueba también la versión aplanada.
 */
function verifyDdSignature(dd: string, signature: string, key: crypto.KeyObject): boolean {
  const flattened = dd.replace(/>\s+</g, '><');
  const candidates = [dd, flattened];
  for (const candidate of candidates) {
    for (const encoding of ['latin1', 'utf8'] as const) {
      try {
        const verifier = crypto.createVerify('RSA-SHA1');
        verifier.update(Buffer.from(candidate, encoding));
        verifier.end();
        if (verifier.verify(key, signature.replace(/\s+/g, ''), 'base64')) return true;
      } catch {
        // Firma o llave ilegible: se trata como no verificada.
      }
    }
  }
  return false;
}

interface TedCheck {
  status: TedStatus;
  issue: string | null;
}

function checkTed(
  documento: string,
  expected: { issuerRut: string; siiCode: number; folio: number; totalAmount: number; receiverRut: string }
): TedCheck {
  const ted = block(documento, 'TED');
  if (!ted) return { status: 'MISSING', issue: 'El documento no trae timbre electrónico (TED)' };

  const dd = block(ted, 'DD');
  const signature = text(ted, 'FRMT');
  if (!dd || !signature) return { status: 'INVALID', issue: 'El timbre está incompleto: falta el bloque DD o su firma' };

  // Los datos del timbre deben coincidir con los del documento: un TED válido
  // copiado desde otra factura es la forma más simple de falsificar una.
  const mismatches: string[] = [];
  if (rutKey(text(dd, 'RE') ?? '') !== rutKey(expected.issuerRut)) mismatches.push('RUT emisor');
  if (Number(text(dd, 'TD')) !== expected.siiCode) mismatches.push('tipo de documento');
  if (Number(text(dd, 'F')) !== expected.folio) mismatches.push('folio');
  if (Math.round(Number(text(dd, 'MNT'))) !== expected.totalAmount) mismatches.push('monto total');
  if (rutKey(text(dd, 'RR') ?? '') !== rutKey(expected.receiverRut)) mismatches.push('RUT receptor');
  if (mismatches.length > 0) {
    return { status: 'INVALID', issue: `El timbre no coincide con el documento (${mismatches.join(', ')})` };
  }

  const caf = block(dd, 'CAF');
  if (caf) {
    const da = block(caf, 'DA');
    const from = Number(text(block(da ?? '', 'RNG') ?? '', 'D'));
    const to = Number(text(block(da ?? '', 'RNG') ?? '', 'H'));
    if (Number.isInteger(from) && Number.isInteger(to) && to >= from && (expected.folio < from || expected.folio > to)) {
      return { status: 'INVALID', issue: 'El folio está fuera del rango autorizado por el CAF del timbre' };
    }
    if (da && rutKey(text(da, 'RE') ?? '') !== rutKey(expected.issuerRut)) {
      return { status: 'INVALID', issue: 'El CAF del timbre pertenece a otro emisor' };
    }
  }

  const key = cafPublicKey(dd);
  if (!key) return { status: 'INVALID', issue: 'El timbre no trae una llave pública legible en su CAF' };
  if (!verifyDdSignature(dd, signature, key)) {
    return { status: 'INVALID', issue: 'La firma del timbre no cuadra: el documento pudo ser alterado' };
  }
  return { status: 'VALID', issue: null };
}

// ─── Documento ───────────────────────────────────────────────────────────────

function parseLines(documento: string): ReceivedDteLine[] {
  return blocks(documento, 'Detalle').map((detail, index) => {
    const quantity = decimal(detail, 'QtyItem');
    const unitPrice = decimal(detail, 'PrcItem');
    const lineAmount = amount(detail, 'MontoItem');
    return {
      lineNumber: Number(text(detail, 'NroLinDet')) || index + 1,
      name: text(detail, 'NmbItem') ?? `Línea ${index + 1}`,
      description: text(detail, 'DscItem'),
      quantity,
      unit: text(detail, 'UnmdItem'),
      unitPrice,
      discount: amount(detail, 'DescuentoMonto'),
      amount: lineAmount,
      // IndExe 1 = exento; 2 = no facturable (tampoco lleva IVA).
      exempt: ['1', '2'].includes(text(detail, 'IndExe') ?? ''),
    };
  });
}

function parseReferences(documento: string): ReceivedDteReference[] {
  return blocks(documento, 'Referencia').map((reference, index) => {
    const code = text(reference, 'CodRef');
    return {
      lineNumber: Number(text(reference, 'NroLinRef')) || index + 1,
      docType: text(reference, 'TpoDocRef') ?? '',
      folio: text(reference, 'FolioRef') ?? '',
      date: isoDate(text(reference, 'FchRef')),
      code: code ? Number(code) || null : null,
      reason: text(reference, 'RazonRef'),
    };
  });
}

function parseOne(dteXml: string): ParsedReceivedDte {
  const documento = block(dteXml, 'Documento') ?? block(dteXml, 'Exportaciones') ?? block(dteXml, 'Liquidacion');
  if (!documento) throw new ReceivedDteParseError('Un DTE del archivo no trae el bloque <Documento>');

  const encabezado = block(documento, 'Encabezado');
  if (!encabezado) throw new ReceivedDteParseError('Un DTE del archivo no trae <Encabezado>');
  const idDoc = block(encabezado, 'IdDoc') ?? '';
  const emisor = block(encabezado, 'Emisor') ?? '';
  const receptor = block(encabezado, 'Receptor') ?? '';
  const totales = block(encabezado, 'Totales') ?? '';

  const siiCode = Number(text(idDoc, 'TipoDTE'));
  const folio = Number(text(idDoc, 'Folio'));
  const issueDate = isoDate(text(idDoc, 'FchEmis'));
  const issuerRutRaw = text(emisor, 'RUTEmisor');
  const receiverRutRaw = text(receptor, 'RUTRecep');

  if (!Number.isInteger(siiCode) || siiCode <= 0) throw new ReceivedDteParseError('Un DTE no declara su tipo de documento (<TipoDTE>)');
  if (!Number.isInteger(folio) || folio <= 0) throw new ReceivedDteParseError('Un DTE no declara un folio válido');
  if (!issueDate) throw new ReceivedDteParseError(`El DTE folio ${folio} no declara su fecha de emisión`);
  if (!issuerRutRaw) throw new ReceivedDteParseError(`El DTE folio ${folio} no declara el RUT del emisor`);
  if (!receiverRutRaw) throw new ReceivedDteParseError(`El DTE folio ${folio} no declara el RUT del receptor`);

  const issuerRut = formatRut(rutKey(issuerRutRaw));
  const receiverRut = formatRut(rutKey(receiverRutRaw));
  const totalAmount = amount(totales, 'MntTotal');
  const ted = checkTed(documento, { issuerRut, siiCode, folio, totalAmount, receiverRut });

  return {
    siiCode,
    folio,
    issueDate,
    dueDate: isoDate(text(idDoc, 'FchVenc')),
    issuerRut,
    issuerName: firstText(emisor, ['RznSoc', 'RznSocEmisor']) ?? issuerRut,
    issuerGiro: firstText(emisor, ['GiroEmis', 'GiroEmisor']),
    receiverRut,
    receiverName: text(receptor, 'RznSocRecep'),
    netAmount: amount(totales, 'MntNeto'),
    exemptAmount: amount(totales, 'MntExe'),
    ivaAmount: amount(totales, 'IVA'),
    totalAmount,
    lines: parseLines(documento),
    references: parseReferences(documento),
    tedStatus: ted.status,
    tedIssue: ted.issue,
    xml: dteXml,
  };
}

/**
 * Lee todos los DTE de un archivo (`EnvioDTE`, `EnvioBOLETA` o un `<DTE>`
 * suelto). Un archivo sin ningún `<DTE>` es un error explícito: lo más común
 * es haber subido el acuse de recibo o la respuesta del SII en su lugar.
 */
export function parseReceivedDtes(xml: string): ParsedReceivedDte[] {
  const dtes = blocks(xml, 'DTE');
  if (dtes.length === 0) {
    throw new ReceivedDteParseError(
      'El archivo no contiene ningún DTE. Sube el XML que te envió el proveedor (EnvioDTE), no el acuse de recibo ni el PDF.'
    );
  }
  return dtes.map(parseOne);
}

/** Primera referencia a un documento tributario (para notas de crédito/débito). */
export function taxReference(references: ReceivedDteReference[]): ReceivedDteReference | null {
  return references.find((reference) => /^\d+$/.test(reference.docType) && [30, 32, 33, 34, 39, 41, 46, 52, 56, 61].includes(Number(reference.docType))) ?? null;
}

/**
 * Traduce el código del SII al tipo de documento de compra del ERP.
 * Lo que no tiene equivalente directo (liquidación factura, exportación)
 * queda como `OTRO` para que la persona decida cómo tratarlo.
 */
export function purchaseTypeForCode(code: number): 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'GUIA_DESPACHO' | 'OTRO' {
  switch (code) {
    case 30:
    case 32:
    case 33:
    case 34:
      return 'FACTURA';
    case 35:
    case 38:
    case 39:
    case 41:
      return 'BOLETA';
    case 52:
      return 'GUIA_DESPACHO';
    case 55:
    case 56:
      return 'NOTA_DEBITO';
    case 60:
    case 61:
      return 'NOTA_CREDITO';
    default:
      return 'OTRO';
  }
}

export interface PurchaseDraftLine {
  description: string;
  quantity: number;
  unitCost: number;
  isExempt: boolean;
}

/**
 * Líneas del borrador de compra a partir del detalle del DTE. El costo de
 * compra en el ERP es entero por unidad; cuando precio × cantidad no da un
 * entero exacto (precios con decimales, descuentos), la línea se registra como
 * 1 × monto de la línea y la cantidad original queda en la descripción, para
 * que el total del borrador cuadre con el del proveedor.
 */
export function purchaseDraftLines(dte: Pick<ParsedReceivedDte, 'lines' | 'netAmount' | 'exemptAmount' | 'siiCode'>): PurchaseDraftLine[] {
  const exemptDocument = dte.siiCode === 34 || dte.siiCode === 41;
  const lines = dte.lines
    .filter((line) => line.amount > 0)
    .map((line): PurchaseDraftLine => {
      const exempt = exemptDocument || line.exempt;
      const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
      const perUnit = line.amount / quantity;
      if (Number.isInteger(quantity) && Number.isInteger(perUnit)) {
        return { description: line.name, quantity, unitCost: perUnit, isExempt: exempt };
      }
      const detail = line.quantity ? ` (${line.quantity.toLocaleString('es-CL')}${line.unit ? ` ${line.unit}` : ''})` : '';
      return { description: `${line.name}${detail}`, quantity: 1, unitCost: line.amount, isExempt: exempt };
    });
  if (lines.length > 0) return lines;

  // Documento sin detalle con montos (p. ej. nota de crédito que solo corrige
  // texto, o un emisor que no desglosa): una línea por monto de los totales.
  const fallback: PurchaseDraftLine[] = [];
  if (dte.netAmount > 0) fallback.push({ description: 'Monto neto según DTE', quantity: 1, unitCost: dte.netAmount, isExempt: false });
  if (dte.exemptAmount > 0) fallback.push({ description: 'Monto exento según DTE', quantity: 1, unitCost: dte.exemptAmount, isExempt: true });
  return fallback;
}
