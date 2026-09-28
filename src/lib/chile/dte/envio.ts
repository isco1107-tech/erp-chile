import { isBoletaCode } from './codes';
import { signElementById, XmlSignatureError, type SigningCredentials } from './signature';
import { element, siiDate, siiRut, siiTimestamp } from './xml';
import { validateRut } from '@/lib/chile/rut';

/**
 * Sobre `EnvioDTE`: uno o más DTE firmados, con su carátula, firmado a su
 * vez como un todo. Es lo que se sube al SII (y lo que se le entrega al
 * receptor en el intercambio).
 *
 * Orden de firma:
 *  1. Cada `<DTE>` se firma SUELTO (`signDte`), sin los namespaces del sobre:
 *     así lo verifica el SII, y ese mismo XML firmado es el que sirve para
 *     el intercambio con el receptor. Se guarda en `SalesDocument.signedXml`.
 *  2. Se arma el sobre insertando esos DTE firmados como texto, sin tocarlos.
 *  3. Se firma `<SetDTE>` en su lugar (hereda `xmlns` y `xmlns:xsi`).
 *
 * Las boletas (39/41) no van por acá: el SII las recibe por otro canal
 * (`EnvioBOLETA`, API REST), aún no implementado.
 */

/** RUT del SII: receptor de todo `EnvioDTE` que se le sube. */
export const SII_RUT = '60803000-K';

const SET_ID = 'SetDoc';

export interface EnvioDteDocument {
  /** XML del `<DTE>` YA firmado con `signDte`. */
  signedXml: string;
  siiCode: number;
}

/**
 * Firma un DTE suelto (el `xml` de `buildDte`). El resultado es el que se
 * guarda y se reutiliza: nunca se vuelve a firmar ni a serializar.
 */
export function signDte(xml: string, documentId: string, credentials: SigningCredentials): string {
  return signElementById(xml, documentId, credentials);
}

export interface EnvioDteInput {
  issuerRut: string;
  /** RUT del titular del certificado ("RUT que envía"): debe estar autorizado ante el SII para esa empresa. */
  senderRut: string;
  /** Resolución que autoriza a la empresa como emisor electrónico (en certificación: fecha y número 0). */
  resolutionDate: string;
  resolutionNumber: number;
  documents: EnvioDteDocument[];
  signedAt: Date;
  /** Receptor del sobre: el SII al subirlo, el cliente en el intercambio. */
  receiverRut?: string;
}

function stripDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
}

function caratula(input: EnvioDteInput): string {
  const counts = new Map<number, number>();
  for (const doc of input.documents) counts.set(doc.siiCode, (counts.get(doc.siiCode) ?? 0) + 1);
  const subtotals = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([code, count]) => `<SubTotDTE>${element('TpoDTE', code)}${element('NroDTE', count)}</SubTotDTE>`)
    .join('');
  return (
    `<Caratula version="1.0">` +
    element('RutEmisor', siiRut(input.issuerRut)) +
    element('RutEnvia', siiRut(input.senderRut)) +
    element('RutReceptor', siiRut(input.receiverRut ?? SII_RUT)) +
    element('FchResol', input.resolutionDate) +
    element('NroResol', input.resolutionNumber) +
    element('TmstFirmaEnv', siiTimestamp(input.signedAt)) +
    subtotals +
    `</Caratula>`
  );
}

/** Arma y firma el `EnvioDTE`. Devuelve el XML final, declarado ISO-8859-1. */
export function buildSignedEnvioDte(input: EnvioDteInput, credentials: SigningCredentials): string {
  if (input.documents.length === 0) throw new XmlSignatureError('El envío necesita al menos un documento');
  if (input.documents.length > 2000) throw new XmlSignatureError('Un envío admite hasta 2.000 documentos');
  if (input.documents.some((doc) => isBoletaCode(doc.siiCode))) {
    throw new XmlSignatureError('Las boletas se envían al SII por otro canal, todavía no disponible');
  }
  for (const [label, rut] of [['emisor', input.issuerRut], ['que envía', input.senderRut], ['receptor', input.receiverRut ?? SII_RUT]] as const) {
    if (!validateRut(rut)) throw new XmlSignatureError(`RUT ${label} inválido: ${rut}`);
  }
  for (const doc of input.documents) {
    if (!/<Signature[\s>]/.test(doc.signedXml)) throw new XmlSignatureError('Todos los DTE deben ir firmados antes de armar el envío');
    const docIssuer = /<RUTEmisor>([^<]+)<\/RUTEmisor>/.exec(doc.signedXml)?.[1];
    if (docIssuer !== siiRut(input.issuerRut)) {
      throw new XmlSignatureError('Un envío solo puede llevar documentos del mismo emisor que su carátula');
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.resolutionDate) || siiDate(new Date(`${input.resolutionDate}T12:00:00Z`)) !== input.resolutionDate) {
    throw new XmlSignatureError('La fecha de resolución debe tener formato AAAA-MM-DD');
  }

  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">` +
    `<SetDTE ID="${SET_ID}">${caratula(input)}${input.documents.map((doc) => stripDeclaration(doc.signedXml)).join('')}</SetDTE>` +
    `</EnvioDTE>`;

  return signElementById(xml, SET_ID, credentials);
}

/**
 * Bytes a subir: el SII exige ISO-8859-1. Un carácter fuera de ese juego
 * (emoji, comillas tipográficas) no tiene representación y cambiaría lo
 * firmado, así que se rechaza en vez de reemplazarse en silencio.
 */
export function encodeLatin1(xml: string): Buffer {
  for (let i = 0; i < xml.length; i += 1) {
    if (xml.charCodeAt(i) > 0xff) {
      throw new XmlSignatureError(`El documento tiene un carácter que el SII no acepta (posición ${i}): "${xml[i]}"`);
    }
  }
  return Buffer.from(xml, 'latin1');
}
