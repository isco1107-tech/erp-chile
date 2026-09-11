import crypto from 'crypto';
import { element, escapeXml, fitField, siiDate, siiRut, siiTimestamp } from './xml';

/**
 * Timbre Electrónico de Documentos (TED).
 *
 * Es el bloque que va impreso como código de barras PDF417 en la
 * representación en papel de un DTE, y el que permite verificar sin conexión
 * que el documento fue autorizado: contiene los datos esenciales de la
 * operación, el CAF que autorizó el folio, y la firma de todo eso hecha con la
 * llave privada que el propio SII entregó dentro de ese CAF.
 *
 * Cadena de confianza: el SII firma el `<DA>` del CAF (firma `<FRMA>`) → el CAF
 * contiene la llave privada del contribuyente para ese rango → el
 * contribuyente firma el `<DD>` de cada documento (firma `<FRMT>`). Quien
 * valida recorre esa cadena al revés sin necesitar consultar al SII.
 */

export interface TedInput {
  /** RUT del emisor, se normaliza al formato del SII. */
  issuerRut: string;
  /** Código numérico del SII (33, 39, 61…). */
  siiCode: number;
  folio: number;
  issueDate: Date;
  /** RUT del receptor. Para boleta a consumidor final se usa `66666666-6`. */
  receiverRut: string;
  receiverName: string;
  /** Monto TOTAL del documento, en pesos enteros. */
  totalAmount: number;
  /** Descripción del primer ítem; el SII la recorta a 40 caracteres. */
  firstItemDescription: string;
  /** Bloque `<CAF>…</CAF>` literal, tal como vino del SII. */
  cafBlockXml: string;
  /** Llave privada RSA (PEM) extraída del CAF. */
  privateKeyPem: string;
  /** Momento del timbrado. Inyectable para poder testear con un valor fijo. */
  stampedAt?: Date;
}

/** RUT genérico que el SII define para boletas a consumidor final sin identificar. */
export const CONSUMIDOR_FINAL_RUT = '66666666-6';

/** Largo máximo de `IT1` según el esquema del SII. */
const IT1_MAX_LENGTH = 40;
/** Largo máximo de `RSR` (razón social del receptor). */
const RSR_MAX_LENGTH = 40;

/**
 * Serializa el bloque `<DD>` (Datos del Documento).
 *
 * El orden de los elementos NO es libre: el esquema del SII lo fija, y la
 * firma se calcula sobre esta serialización exacta. Se emite en una sola línea
 * sin espacios entre etiquetas para que el resultado sea reproducible byte a
 * byte — cualquier reformateo posterior invalida la firma.
 */
export function buildDd(input: TedInput): string {
  const stampedAt = input.stampedAt ?? new Date();

  return [
    '<DD>',
    element('RE', siiRut(input.issuerRut)),
    element('TD', input.siiCode),
    element('F', input.folio),
    element('FE', siiDate(input.issueDate)),
    element('RR', siiRut(input.receiverRut)),
    element('RSR', fitField(input.receiverName, RSR_MAX_LENGTH)),
    element('MNT', Math.round(input.totalAmount)),
    element('IT1', fitField(input.firstItemDescription, IT1_MAX_LENGTH)),
    input.cafBlockXml,
    element('TSTED', siiTimestamp(stampedAt)),
    '</DD>',
  ].join('');
}

/**
 * Firma el `<DD>` con la llave privada del CAF.
 *
 * SHA1withRSA no es una elección de diseño: es el algoritmo que el SII
 * especifica para el TED y el único que sus validadores aceptan. SHA-1 está
 * criptográficamente obsoleto para uso general, pero acá el formato lo impone
 * la contraparte y no hay alternativa negociable.
 */
export function signDd(dd: string, privateKeyPem: string): string {
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(dd, 'utf8');
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

export interface BuiltTed {
  /** `<TED>…</TED>` completo, listo para incrustar en el DTE. */
  xml: string;
  /** El `<DD>` serializado, que es exactamente lo que se firmó. */
  dd: string;
  /** Firma en base64. */
  signature: string;
}

/** Construye el TED completo: datos del documento más su firma. */
export function buildTed(input: TedInput): BuiltTed {
  if (!Number.isInteger(input.folio) || input.folio < 1) {
    throw new Error('El folio del timbre debe ser un entero positivo');
  }
  if (!Number.isInteger(input.totalAmount) || input.totalAmount < 0) {
    throw new Error('El monto del timbre debe ser un entero en pesos');
  }

  const dd = buildDd(input);
  const signature = signDd(dd, input.privateKeyPem);

  const xml = `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${escapeXml(signature)}</FRMT></TED>`;

  return { xml, dd, signature };
}

/**
 * Verifica un TED con la llave pública del CAF. Se usa para comprobar al subir
 * el CAF que la pareja de llaves es coherente, y para validar documentos
 * recibidos de terceros.
 */
export function verifyTed(dd: string, signature: string, publicKeyPem: string): boolean {
  try {
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(dd, 'utf8');
    verifier.end();
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Contenido que se codifica en el PDF417 impreso.
 *
 * El SII exige el TED completo, sin declaración XML y en una sola línea. Se
 * expone aparte de `buildTed` porque la impresión y la emisión son momentos
 * distintos: un documento ya emitido se reimprime sin volver a firmarlo.
 */
export function tedBarcodePayload(tedXml: string): string {
  return tedXml.replace(/\r?\n\s*/g, '');
}
