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

// GIF: "GIF87a" o "GIF89a".
const GIF_MAGIC_87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF_MAGIC_89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

export type SniffedUploadType = SniffedCertificateType | 'image/gif';

/**
 * Tipo real de un archivo subido por el panel (JPEG, PNG, WEBP, GIF o PDF), o
 * `null` si no es ninguno. Nunca SVG ni HTML: se sirven desde el almacenamiento
 * público y podrían ejecutar script si alguien abre la URL directo.
 */
export function sniffUploadType(bytes: Uint8Array): SniffedUploadType | null {
  if (matchesMagic(bytes, GIF_MAGIC_87) || matchesMagic(bytes, GIF_MAGIC_89)) return 'image/gif';
  return sniffCertificateType(bytes);
}

export const SNIFFED_UPLOAD_EXTENSION: Record<SniffedUploadType, string> = {
  ...SNIFFED_CERTIFICATE_EXTENSION,
  'image/gif': 'gif',
};

/**
 * Lee la cabecera de `file` y devuelve su tipo REAL si está entre `allowed`.
 * El `contentType` y la extensión con que se guarda el archivo deben salir de
 * acá, nunca de `file.type` (lo declara quien sube el archivo).
 */
export async function sniffAllowedUpload(
  file: Blob,
  allowed: ReadonlySet<SniffedUploadType>,
): Promise<{ contentType: SniffedUploadType; extension: string } | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffUploadType(head);
  if (!sniffed || !allowed.has(sniffed)) return null;
  return { contentType: sniffed, extension: SNIFFED_UPLOAD_EXTENSION[sniffed] };
}

// ─── Adjuntos de mensajería ──────────────────────────────────────────────────
//
// Mensajería admite más formatos que las fotos y PDF del resto del panel (Office, ZIP, texto, CSV).
// El tipo que declara el navegador (`file.type`) lo controla quien sube, así que cada tipo declarado
// se contrasta con los primeros bytes reales: un ejecutable o un HTML no puede viajar rotulado como PDF.

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04": .docx, .xlsx y .zip son contenedores ZIP
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // .doc y .xls antiguos (OLE2)

/** Cuántos bytes de cabecera hay que leer para `matchesDeclaredAttachmentType`. */
export const ATTACHMENT_SNIFF_BYTES = 4096;

type AttachmentFamily = SniffedUploadType | 'zip' | 'ole' | 'text';

const ATTACHMENT_FAMILY_BY_MIME: Record<string, AttachmentFamily> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
  'application/pdf': 'application/pdf',
  'application/msword': 'ole',
  'application/vnd.ms-excel': 'ole',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'application/zip': 'zip',
  'text/plain': 'text',
  'text/csv': 'text',
};

/** Texto plano o CSV: sin bytes nulos ni caracteres de control (un binario los trae enseguida). */
function looksLikeText(bytes: Uint8Array): boolean {
  // UTF-16 con BOM (el «Texto Unicode» de Excel) trae bytes nulos a propósito.
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return true;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c) return false;
  }
  return true;
}

/**
 * ¿Los primeros bytes de un adjunto corresponden al tipo que declaró quien lo sube?
 * `false` si el tipo declarado no es uno de los que admite mensajería.
 */
export function matchesDeclaredAttachmentType(head: Uint8Array, declaredMime: string): boolean {
  const family = ATTACHMENT_FAMILY_BY_MIME[declaredMime];
  if (!family) return false;
  switch (family) {
    case 'zip':
      return matchesMagic(head, ZIP_MAGIC);
    case 'ole':
      return matchesMagic(head, OLE_MAGIC);
    case 'text':
      return head.length > 0 && looksLikeText(head);
    default:
      return sniffUploadType(head) === family;
  }
}
