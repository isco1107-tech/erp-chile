/**
 * Lógica pura del material de la academia: qué archivos se aceptan (por sus
 * primeros bytes, no por lo que declara el navegador), cómo se nombran en el
 * almacenamiento, qué enlaces son válidos y a qué correos se envía. Sin Prisma
 * ni red, para probarla y usarla también desde el cliente.
 */

import { sniffImageType } from '@/lib/security/file-signature';

/**
 * Tope por archivo. Vercel corta las solicitudes en ~4,5 MB, así que lo que
 * pese más se comparte como enlace (Drive, OneDrive, YouTube…).
 */
export const MATERIAL_MAX_BYTES = 4 * 1024 * 1024;

/** Máximo de direcciones a las que se envía un material de una vez. */
export const MAX_MATERIAL_RECIPIENTS = 300;

/** Segundos que deben pasar antes de poder reenviar el mismo material (evita el doble clic). */
export const RESEND_COOLDOWN_SECONDS = 60;

export interface MaterialType {
  contentType: string;
  extension: string;
  /** Texto corto para la etiqueta del archivo. */
  label: string;
}

const PDF: MaterialType = { contentType: 'application/pdf', extension: 'pdf', label: 'PDF' };

/** Por extensión: los Office modernos y OpenDocument son ZIP; los antiguos, OLE. */
const ZIP_TYPES: Record<string, MaterialType> = {
  docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', label: 'Word' },
  pptx: { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx', label: 'PowerPoint' },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', label: 'Excel' },
  odt: { contentType: 'application/vnd.oasis.opendocument.text', extension: 'odt', label: 'Documento' },
  odp: { contentType: 'application/vnd.oasis.opendocument.presentation', extension: 'odp', label: 'Presentación' },
  ods: { contentType: 'application/vnd.oasis.opendocument.spreadsheet', extension: 'ods', label: 'Planilla' },
};
const OLE_TYPES: Record<string, MaterialType> = {
  doc: { contentType: 'application/msword', extension: 'doc', label: 'Word' },
  ppt: { contentType: 'application/vnd.ms-powerpoint', extension: 'ppt', label: 'PowerPoint' },
  xls: { contentType: 'application/vnd.ms-excel', extension: 'xls', label: 'Excel' },
};
const IMAGE_TYPES: Record<string, MaterialType> = {
  'image/jpeg': { contentType: 'image/jpeg', extension: 'jpg', label: 'Imagen' },
  'image/png': { contentType: 'image/png', extension: 'png', label: 'Imagen' },
  'image/webp': { contentType: 'image/webp', extension: 'webp', label: 'Imagen' },
};

/** Para el atributo `accept` del selector de archivos. */
export const MATERIAL_ACCEPT = ['pdf', ...Object.keys(ZIP_TYPES), ...Object.keys(OLE_TYPES), 'jpg', 'jpeg', 'png', 'webp'].map((ext) => `.${ext}`).join(',');

export const MATERIAL_TYPES_HINT = 'PDF, Word, PowerPoint, Excel, OpenDocument o imagen (JPG, PNG, WEBP)';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Tipo real del archivo, o `null` si no es uno de los aceptados. Un Office
 * moderno o antiguo comparte firma con cualquier otro ZIP u OLE, así que además
 * debe traer la extensión que le corresponde.
 */
export function sniffMaterialType(bytes: Uint8Array, fileName: string): MaterialType | null {
  if (startsWith(bytes, PDF_MAGIC)) return PDF;
  const image = sniffImageType(bytes);
  if (image) return IMAGE_TYPES[image] ?? null;
  const ext = fileExtension(fileName);
  if (startsWith(bytes, ZIP_MAGIC)) return ZIP_TYPES[ext] ?? null;
  if (startsWith(bytes, OLE_MAGIC)) return OLE_TYPES[ext] ?? null;
  return null;
}

/** Nombre del archivo tal como lo mostramos: sin carpetas y con largo acotado. */
export function displayFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
  return clean || 'archivo';
}

/** Etiqueta corta para mostrar ("PDF", "PowerPoint", "Enlace"…), a partir del tipo guardado. */
export function materialTypeLabel(kind: 'FILE' | 'LINK', contentType: string | null): string {
  if (kind === 'LINK') return 'Enlace';
  if (!contentType) return 'Archivo';
  if (contentType === PDF.contentType) return PDF.label;
  for (const type of [...Object.values(ZIP_TYPES), ...Object.values(OLE_TYPES), ...Object.values(IMAGE_TYPES)]) {
    if (type.contentType === contentType) return type.label;
  }
  return 'Archivo';
}

/** "850 KB", "2,4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** "Clase 3 – Pasarela.pptx" → "clase-3-pasarela": legible en la URL de descarga y sin caracteres raros. */
export function slugifyFileBase(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'material';
}

/** Carpeta del almacenamiento donde viven los archivos de una empresa. */
export function materialPrefix(companyId: string): string {
  return `academy-material/${companyId}/`;
}

/** Clave completa: la parte aleatoria hace imposible adivinar el enlace de otro material. */
export function materialObjectKey(companyId: string, fileName: string, type: MaterialType, random: string): string {
  return `${materialPrefix(companyId)}${random}-${slugifyFileBase(fileName)}.${type.extension}`;
}

/**
 * Enlace externo permitido: https, con dominio y sin usuario ni clave. No
 * acepta `javascript:`, `data:`, `http:` ni nada que no sea una página web.
 */
export function safeMaterialLink(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 500) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ── A quién se envía ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RecipientStudent {
  fullName: string;
  email: string | null;
  guardianEmail: string | null;
}

export interface RecipientPlan {
  /** Direcciones únicas (en minúscula). */
  emails: string[];
  /** Alumnas sin ninguna dirección: hay que completarlas en su ficha. */
  withoutEmail: string[];
  /** Hubo más direcciones que el tope y se recortó la lista. */
  truncated: boolean;
}

/**
 * Direcciones a las que llega el material: el correo de cada alumna y el de su
 * apoderado (si lo registró), sin repetir. Una alumna sin ninguno de los dos
 * se informa para que el equipo la complete.
 */
export function collectRecipients(students: readonly RecipientStudent[], max: number = MAX_MATERIAL_RECIPIENTS): RecipientPlan {
  const seen = new Set<string>();
  const emails: string[] = [];
  const withoutEmail: string[] = [];
  for (const student of students) {
    const own = [student.email, student.guardianEmail]
      .map((value) => (value ?? '').trim().toLowerCase())
      .filter((value) => EMAIL_RE.test(value));
    if (own.length === 0) withoutEmail.push(student.fullName);
    for (const address of own) {
      if (seen.has(address)) continue;
      seen.add(address);
      emails.push(address);
    }
  }
  return { emails: emails.slice(0, max), withoutEmail, truncated: emails.length > max };
}
