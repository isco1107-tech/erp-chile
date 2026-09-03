/**
 * Detección de tipo de archivo por los primeros bytes reales (firma/"magic
 * number"), no por la extensión del nombre ni por el `Content-Type` que
 * declara el navegador — ambos los controla quien sube el archivo y son
 * triviales de falsificar. Usado por el endpoint público de postulaciones
 * (Sección 3 del módulo de candidatas): ahí el archivo llega de internet sin
 * autenticación, así que confiar en el MIME declarado permitiría subir
 * cualquier binario disfrazado de imagen.
 *
 * Cubre únicamente los formatos que este endpoint acepta: JPEG y PNG para las
 * fotografías, más PDF para el certificado médico opcional. No es un sniffer
 * general de tipos MIME.
 */

export type SniffedImageType = 'image/jpeg' | 'image/png';
export type SniffedCertificateType = SniffedImageType | 'application/pdf';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function matchesMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, i) => bytes[i] === byte);
}

/** `null` si los bytes no corresponden a JPEG ni PNG. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (matchesMagic(bytes, PNG_MAGIC)) return 'image/png';
  if (matchesMagic(bytes, JPEG_MAGIC)) return 'image/jpeg';
  return null;
}

/** Igual que `sniffImageType`, pero además acepta PDF — para el certificado
 * médico opcional, que puede ser una foto del papel o un PDF escaneado. */
export function sniffCertificateType(bytes: Uint8Array): SniffedCertificateType | null {
  if (matchesMagic(bytes, PDF_MAGIC)) return 'application/pdf';
  return sniffImageType(bytes);
}

export const SNIFFED_IMAGE_EXTENSION: Record<SniffedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const SNIFFED_CERTIFICATE_EXTENSION: Record<SniffedCertificateType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
