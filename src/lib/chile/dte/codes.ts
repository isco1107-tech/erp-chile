import type { DteType } from '@prisma/client';

/**
 * Traducción entre el enum interno `DteType` y los códigos numéricos del SII.
 *
 * Los códigos del SII son la identidad real del documento en el XML, el CAF y
 * el envío; el enum de Prisma es solo la representación cómoda para el resto
 * de la aplicación. Todo lo que salga hacia el SII debe pasar por acá.
 */

/** Códigos oficiales del SII por tipo de documento. */
export const SII_DOCUMENT_CODE: Partial<Record<DteType, number>> = {
  FACTURA_33: 33,
  FACTURA_EXENTA_34: 34,
  BOLETA_39: 39,
  BOLETA_EXENTA_41: 41,
  GUIA_DESPACHO_52: 52,
  NOTA_DEBITO_56: 56,
  NOTA_CREDITO_61: 61,
};

/**
 * `COTIZACION` no aparece arriba a propósito: no es un Documento Tributario
 * Electrónico. Es un documento interno sin folio del SII, sin CAF y sin
 * obligación de envío — tratarla como DTE es el error que hace que un sistema
 * intente timbrar algo que el SII no reconoce.
 */
export function isDte(dteType: DteType): boolean {
  return dteType in SII_DOCUMENT_CODE;
}

/** Código SII o error explícito. Nunca devuelve un default silencioso. */
export function siiCode(dteType: DteType): number {
  const code = SII_DOCUMENT_CODE[dteType];
  if (code === undefined) {
    throw new Error(`El tipo de documento ${dteType} no es un DTE y no tiene código del SII`);
  }
  return code;
}

/** Enum interno a partir del código del SII (para leer documentos recibidos). */
export function dteTypeFromCode(code: number): DteType | null {
  const entry = Object.entries(SII_DOCUMENT_CODE).find(([, value]) => value === code);
  return entry ? (entry[0] as DteType) : null;
}

/**
 * Boletas (39 y 41). El SII las trata distinto del resto: se envían en un
 * "Consumo de Folios" diario agregado en vez de documento por documento, y no
 * llevan datos del receptor cuando es consumidor final.
 */
export function isBoleta(dteType: DteType): boolean {
  return dteType === 'BOLETA_39' || dteType === 'BOLETA_EXENTA_41';
}

/** Documentos sin IVA por naturaleza: el monto neto va completo como exento. */
export function isExemptDocument(dteType: DteType): boolean {
  return dteType === 'FACTURA_EXENTA_34' || dteType === 'BOLETA_EXENTA_41';
}

/**
 * Documentos que referencian obligatoriamente a otro (notas de crédito y
 * débito). El SII rechaza una nota sin bloque `Referencia`.
 */
export function requiresReference(dteType: DteType): boolean {
  return dteType === 'NOTA_CREDITO_61' || dteType === 'NOTA_DEBITO_56';
}

/**
 * Variantes que operan sobre el código numérico del SII.
 *
 * Existen porque el generador de XML trabaja con el código y no con el enum:
 * traducir el código de vuelta a `DteType` solo para volver a preguntar por él
 * introduce un caso imposible ("¿y si el código no mapea a ningún enum?") en
 * medio de la construcción del documento, cuando esa validación ya ocurrió al
 * asignar el folio.
 */
export function isBoletaCode(code: number): boolean {
  return code === 39 || code === 41;
}

export function isExemptCode(code: number): boolean {
  return code === 34 || code === 41;
}

export function requiresReferenceCode(code: number): boolean {
  return code === 61 || code === 56;
}
