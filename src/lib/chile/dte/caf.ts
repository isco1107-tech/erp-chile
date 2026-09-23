import crypto from 'crypto';
import type { DteType } from '@prisma/client';
import { dteTypeFromCode } from './codes';

/**
 * Lectura y validación de un CAF (Código de Autorización de Folios).
 *
 * Qué es: el archivo XML que el contribuyente descarga del SII y que autoriza
 * un RANGO de folios para UN tipo de documento. Sin CAF no hay emisión legal
 * posible — el folio no es un contador que uno elige, es un número que el SII
 * entregó de antemano. Además trae la llave privada RSA con la que se firma el
 * timbre (TED) de cada documento de ese rango.
 *
 * Por qué se parsea con extracción de texto y no con un parser XML: el bloque
 * `<DA>` debe viajar dentro del TED de cada documento EXACTAMENTE con los
 * mismos bytes que entregó el SII, porque la firma `<FRMA>` del propio SII se
 * calculó sobre esa serialización. Cualquier parser que lea a un árbol y
 * vuelva a serializar cambia espacios, saltos de línea o el orden de atributos
 * e invalida esa firma. Acá el requisito de negocio empuja a conservar el
 * texto original, no a normalizarlo.
 */

export interface ParsedCaf {
  /** RUT del emisor autorizado, formato SII (sin puntos, con guion). */
  issuerRut: string;
  issuerName: string;
  dteType: DteType;
  siiCode: number;
  rangeFrom: number;
  rangeTo: number;
  /** Fecha de autorización que declara el propio CAF. */
  authorizedAt: Date;
  /** Llave privada RSA en PEM, para firmar el TED de cada documento. */
  privateKeyPem: string;
  publicKeyPem: string;
  /** `<CAF ...>…</CAF>` completo y literal, tal como se embebe en el TED. */
  cafBlockXml: string;
}

export class CafParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CafParseError';
  }
}

/** Extrae el contenido de la primera ocurrencia de un elemento simple. */
function tagContent(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

/** Extrae el elemento COMPLETO, con sus etiquetas, sin alterar su contenido. */
function tagBlock(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`).exec(xml);
  return match ? match[0] : null;
}

/**
 * Normaliza una llave que puede venir sin las cabeceras PEM o con saltos de
 * línea perdidos. Node exige el formato PEM canónico (64 caracteres por línea)
 * y falla con un error críptico si el cuerpo viene en una sola línea.
 */
function normalizePem(raw: string, label: string): string {
  const trimmed = raw.trim();
  const header = `-----BEGIN ${label}-----`;
  const footer = `-----END ${label}-----`;

  const body = trimmed
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  if (!body) throw new CafParseError(`El CAF no contiene una llave ${label} legible`);

  const lines = body.match(/.{1,64}/g) ?? [];
  return `${header}\n${lines.join('\n')}\n${footer}\n`;
}

/**
 * Lee un CAF. Lanza `CafParseError` con un mensaje accionable ante cualquier
 * inconsistencia: subir el CAF equivocado (otro tipo de documento, otra
 * empresa) es el error más frecuente y el más caro de descubrir tarde.
 */
export function parseCaf(xml: string): ParsedCaf {
  if (!xml.includes('<CAF')) {
    throw new CafParseError('El archivo no parece un CAF del SII: no contiene un bloque <CAF>');
  }

  const cafBlockXml = tagBlock(xml, 'CAF');
  if (!cafBlockXml) throw new CafParseError('El CAF está incompleto: falta el bloque <CAF>');

  const da = tagBlock(cafBlockXml, 'DA');
  if (!da) throw new CafParseError('El CAF está incompleto: falta el bloque <DA>');
  if (!tagBlock(cafBlockXml, 'FRMA')) {
    throw new CafParseError('El CAF está incompleto: falta la firma <FRMA> del SII');
  }

  const issuerRut = tagContent(da, 'RE');
  const issuerName = tagContent(da, 'RS');
  const rawCode = tagContent(da, 'TD');
  const rng = tagBlock(da, 'RNG');
  const authorizedRaw = tagContent(da, 'FA');

  if (!issuerRut) throw new CafParseError('El CAF no declara el RUT del emisor (<RE>)');
  if (!rawCode) throw new CafParseError('El CAF no declara el tipo de documento (<TD>)');
  if (!rng) throw new CafParseError('El CAF no declara el rango de folios (<RNG>)');

  const rangeFrom = Number(tagContent(rng, 'D'));
  const rangeTo = Number(tagContent(rng, 'H'));
  if (!Number.isInteger(rangeFrom) || !Number.isInteger(rangeTo) || rangeFrom < 1 || rangeTo < rangeFrom) {
    throw new CafParseError('El rango de folios del CAF no es válido');
  }

  const siiCode = Number(rawCode);
  const dteType = dteTypeFromCode(siiCode);
  if (!dteType) {
    throw new CafParseError(`El CAF es para el tipo de documento ${siiCode}, que este sistema no emite`);
  }

  const privateKeyRaw = tagContent(xml, 'RSASK');
  const publicKeyRaw = tagContent(xml, 'RSAPUBK');
  if (!privateKeyRaw) {
    throw new CafParseError(
      'El CAF no incluye la llave privada (<RSASK>). Descarga el archivo completo desde el SII, no solo el bloque de autorización'
    );
  }

  const privateKeyPem = normalizePem(privateKeyRaw, 'RSA PRIVATE KEY');
  const publicKeyPem = publicKeyRaw ? normalizePem(publicKeyRaw, 'PUBLIC KEY') : '';

  // Verificación real de que la llave sirve para firmar: un CAF con la llave
  // truncada pasa todas las comprobaciones de texto y recién falla al emitir
  // el primer documento, cuando ya se consumió un folio.
  try {
    crypto.createPrivateKey(privateKeyPem);
  } catch {
    throw new CafParseError('La llave privada del CAF no se pudo interpretar; el archivo puede estar dañado');
  }

  const authorizedAt = authorizedRaw ? new Date(`${authorizedRaw}T00:00:00`) : new Date();
  if (Number.isNaN(authorizedAt.getTime())) {
    throw new CafParseError('La fecha de autorización del CAF no es válida');
  }

  return {
    issuerRut,
    issuerName: issuerName ?? '',
    dteType,
    siiCode,
    rangeFrom,
    rangeTo,
    authorizedAt,
    privateKeyPem,
    publicKeyPem,
    cafBlockXml,
  };
}

/**
 * Compara el RUT del CAF con el de la empresa. El SII rechaza cualquier
 * documento timbrado con un CAF de otro contribuyente, así que esto se valida
 * al subir el archivo y no al emitir.
 */
export function cafBelongsTo(caf: ParsedCaf, companyRut: string): boolean {
  const normalize = (rut: string) => rut.replace(/[.\s]/g, '').toUpperCase();
  return normalize(caf.issuerRut) === normalize(companyRut);
}

/** Cantidad de folios que autoriza el rango, incluyendo ambos extremos. */
export function cafFolioCount(caf: Pick<ParsedCaf, 'rangeFrom' | 'rangeTo'>): number {
  return caf.rangeTo - caf.rangeFrom + 1;
}
