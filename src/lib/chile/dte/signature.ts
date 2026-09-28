import crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization, findAncestorNs } from 'xml-crypto';
import type { DigitalCertificate } from './certificate';

/**
 * Firma XML-DSig de los documentos del SII (DTE, EnvioDTE, semilla del token).
 *
 * Lo que exige el SII: C14N inclusivo (REC-xml-c14n-20010315), RSA-SHA1,
 * digest SHA-1, y `KeyInfo` con `RSAKeyValue` + `X509Certificate`.
 *
 * Dos decisiones que no son obvias:
 *
 * 1. **Se firma en el contexto final.** El C14N inclusivo de un elemento
 *    incluye los namespaces que hereda de sus ancestros. Un `<Documento>`
 *    dentro de un `EnvioDTE` hereda `xmlns` y `xmlns:xsi` del sobre, y el SII
 *    verifica ahí: firmar el DTE suelto y después meterlo al sobre produce un
 *    digest que el SII no reproduce. Por eso primero se arma el XML final y
 *    se firma cada elemento en su lugar.
 *
 * 2. **La firma se inserta como texto.** Nunca se parsea y re-serializa el
 *    documento completo (ver CLAUDE.md, "Nunca reserializar un XML firmado"):
 *    el parser solo se usa para calcular la forma canónica de lo que se firma;
 *    los bytes del documento quedan tal como se generaron.
 */

export type SigningCredentials = Pick<DigitalCertificate, 'privateKeyPem' | 'certificateBase64' | 'modulusBase64' | 'exponentBase64'>;

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SIGNATURE_PLACEHOLDER = '@@FIRMA_PENDIENTE@@';

export class XmlSignatureError extends Error {}

function parse(xml: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') errors.push(message);
    },
  }).parseFromString(xml, 'text/xml');
  if (errors.length > 0 || !doc.documentElement) throw new XmlSignatureError(`XML mal formado: ${errors[0] ?? 'sin elemento raíz'}`);
  return doc as unknown as Document;
}

/** Forma canónica (C14N inclusivo, sin comentarios) del nodo que selecciona `xpath`, con los namespaces que hereda. */
function canonicalize(xml: string, xpath: string, select: (doc: Document) => Node | null): string {
  const doc = parse(xml);
  const node = select(doc);
  if (!node) throw new XmlSignatureError(`No se encontró el elemento a firmar (${xpath})`);
  const output = new C14nCanonicalization().process(node, { ancestorNamespaces: findAncestorNs(doc, xpath) });
  if (typeof output !== 'string') throw new XmlSignatureError('La canonicalización no devolvió texto');
  return output;
}

function elementById(doc: Document, id: string): Element | null {
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].getAttribute('ID') === id) return all[i];
  }
  return null;
}

function nextSignedInfo(doc: Document, afterId: string): Node | null {
  const target = elementById(doc, afterId);
  let sibling = target?.nextSibling ?? null;
  while (sibling && sibling.nodeType !== 1) sibling = sibling.nextSibling;
  if (!sibling || (sibling as Element).localName !== 'Signature') return null;
  const signedInfo = (sibling as Element).getElementsByTagNameNS(DSIG_NS, 'SignedInfo');
  return signedInfo.length > 0 ? signedInfo[0] : null;
}

function sha1Base64(text: string): string {
  return crypto.createHash('sha1').update(text, 'utf8').digest('base64');
}

function rsaSha1Base64(text: string, privateKeyPem: string): string {
  return crypto.createSign('RSA-SHA1').update(text, 'utf8').sign(privateKeyPem, 'base64');
}

function signatureBlock(signedInfo: string, credentials: SigningCredentials): string {
  return (
    `<Signature xmlns="${DSIG_NS}">${signedInfo}` +
    `<SignatureValue>${SIGNATURE_PLACEHOLDER}</SignatureValue>` +
    `<KeyInfo><KeyValue><RSAKeyValue><Modulus>${credentials.modulusBase64}</Modulus><Exponent>${credentials.exponentBase64}</Exponent></RSAKeyValue></KeyValue>` +
    `<X509Data><X509Certificate>${credentials.certificateBase64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

function signedInfoXml(referenceUri: string, digest: string, enveloped: boolean): string {
  const transforms = enveloped ? `<Transforms><Transform Algorithm="${ENVELOPED_ALGORITHM}"/></Transforms>` : '';
  return (
    `<SignedInfo><CanonicalizationMethod Algorithm="${C14N_ALGORITHM}"/>` +
    `<SignatureMethod Algorithm="${DSIG_NS}rsa-sha1"/>` +
    `<Reference URI="${referenceUri}">${transforms}<DigestMethod Algorithm="${DSIG_NS}sha1"/><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`
  );
}

/**
 * Posición del texto justo después de la etiqueta de cierre del elemento con
 * `ID="id"`. Se busca en el texto (no en el árbol) porque ahí es donde se
 * inserta la firma sin tocar el resto de los bytes.
 */
function endOfElementWithId(xml: string, id: string): number {
  const attribute = `ID="${id}"`;
  const attributeAt = xml.indexOf(attribute);
  if (attributeAt < 0 || xml.indexOf(attribute, attributeAt + 1) >= 0) {
    throw new XmlSignatureError(`El ID "${id}" debe aparecer exactamente una vez en el documento`);
  }
  const start = xml.lastIndexOf('<', attributeAt);
  const tag = /^<([A-Za-z_][\w.-]*)/.exec(xml.slice(start))?.[1];
  if (!tag) throw new XmlSignatureError(`No se pudo leer el elemento con ID "${id}"`);

  const pattern = new RegExp(`<(/?)${tag}(?=[\\s/>])[^>]*?(/?)>`, 'g');
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    const closing = match[1] === '/';
    const selfClosing = match[2] === '/';
    if (!closing && !selfClosing) depth += 1;
    if (closing) depth -= 1;
    if ((closing && depth === 0) || (selfClosing && depth === 0)) return match.index + match[0].length;
  }
  throw new XmlSignatureError(`El elemento con ID "${id}" no está cerrado`);
}

function fillSignatureValue(xml: string, signedInfoCanonical: string, privateKeyPem: string): string {
  const at = xml.indexOf(SIGNATURE_PLACEHOLDER);
  if (at < 0 || xml.indexOf(SIGNATURE_PLACEHOLDER, at + 1) >= 0) throw new XmlSignatureError('Marcador de firma inesperado');
  return xml.slice(0, at) + rsaSha1Base64(signedInfoCanonical, privateKeyPem) + xml.slice(at + SIGNATURE_PLACEHOLDER.length);
}

/**
 * Firma el elemento `ID="id"` (un `<Documento>`, un `<SetDTE>`) y agrega la
 * `<Signature>` inmediatamente después de él, como hermana, que es donde la
 * esperan los esquemas del SII. Devuelve el XML con la firma; el resto del
 * texto queda byte a byte igual.
 */
export function signElementById(xml: string, id: string, credentials: SigningCredentials): string {
  if (xml.includes(SIGNATURE_PLACEHOLDER)) throw new XmlSignatureError('El documento contiene el marcador interno de firma');
  const xpath = `//*[@ID='${id}']`;
  const digest = sha1Base64(canonicalize(xml, xpath, (doc) => elementById(doc, id)));

  const insertAt = endOfElementWithId(xml, id);
  const withSignature = xml.slice(0, insertAt) + signatureBlock(signedInfoXml(`#${id}`, digest, false), credentials) + xml.slice(insertAt);

  // SignedInfo también se canonicaliza en su lugar final: hereda el
  // namespace de la firma y los prefijos declarados más arriba (xsi).
  const signedInfoXpath = `//*[@ID='${id}']/following-sibling::*[local-name()='Signature'][1]/*[local-name()='SignedInfo']`;
  const signedInfoCanonical = canonicalize(withSignature, signedInfoXpath, (doc) => nextSignedInfo(doc, id));
  return fillSignatureValue(withSignature, signedInfoCanonical, credentials.privateKeyPem);
}

/**
 * Firma el documento completo (`URI=""`) con la transformación "enveloped":
 * la firma va como último hijo de la raíz y se excluye del digest. Es la que
 * pide el SII para la semilla con que se obtiene el token.
 */
export function signEnveloped(xml: string, credentials: SigningCredentials): string {
  if (xml.includes(SIGNATURE_PLACEHOLDER)) throw new XmlSignatureError('El documento contiene el marcador interno de firma');
  const digest = sha1Base64(canonicalize(xml, '/*', (doc) => doc.documentElement));

  const rootTag = /<([A-Za-z_][\w.-]*)[\s>]/.exec(xml.replace(/^<\?xml[^>]*\?>/, ''))?.[1];
  const closeAt = rootTag ? xml.lastIndexOf(`</${rootTag}>`) : -1;
  if (closeAt < 0) throw new XmlSignatureError('No se encontró el cierre de la raíz');
  const withSignature = xml.slice(0, closeAt) + signatureBlock(signedInfoXml('', digest, true), credentials) + xml.slice(closeAt);

  const signedInfoCanonical = canonicalize(withSignature, "/*/*[local-name()='Signature']/*[local-name()='SignedInfo']", (doc) => {
    const found = doc.documentElement.getElementsByTagNameNS(DSIG_NS, 'SignedInfo');
    return found.length > 0 ? found[0] : null;
  });
  return fillSignatureValue(withSignature, signedInfoCanonical, credentials.privateKeyPem);
}
