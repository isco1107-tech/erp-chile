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

export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export type SniffedCertificateType = SniffedImageType | 'application/pdf';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
// WEBP: contenedor RIFF ("RIFF" + 4 bytes de tamaño + "WEBP"), por eso no es
// una firma contigua — se comprueba en dos tramos.
const WEBP_RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_FORMAT_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function matchesMagic(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, i) => bytes[offset + i] === byte);
}

function isWebp(bytes: Uint8Array): boolean {
  return matchesMagic(bytes, WEBP_RIFF_MAGIC) && matchesMagic(bytes, WEBP_FORMAT_MAGIC, 8);
}

/** `null` si los bytes no corresponden a JPEG, PNG ni WEBP. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (matchesMagic(bytes, PNG_MAGIC)) return 'image/png';
  if (matchesMagic(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (isWebp(bytes)) return 'image/webp';
  return null;
}

/** Igual que `sniffImageType`, pero además acepta PDF — para el certificado
 * médico opcional (puede ser una foto del papel o un PDF escaneado) y para
 * documentos como el pagaré firmado. */
export function sniffCertificateType(bytes: Uint8Array): SniffedCertificateType | null {
  if (matchesMagic(bytes, PDF_MAGIC)) return 'application/pdf';
  return sniffImageType(bytes);
}

export const SNIFFED_IMAGE_EXTENSION: Record<SniffedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const SNIFFED_CERTIFICATE_EXTENSION: Record<SniffedCertificateType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
