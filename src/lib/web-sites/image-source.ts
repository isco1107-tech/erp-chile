import type { Permission } from '@/lib/auth/permissions';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';

/**
 * Carpetas de las bibliotecas de imágenes de los editores visuales y quién
 * puede abrir sus archivos desde el panel (`GET /api/web-sites/image-source`).
 *
 * Esa ruta existe porque el navegador no puede leer los píxeles de una imagen
 * de otro origen (el almacenamiento) sin que el bucket permita CORS: para
 * quitarle el fondo a un logo, el editor pide los bytes por nuestro propio
 * dominio. Solo abre archivos de ESTAS carpetas y de la empresa de la sesión
 * (`<carpeta>/<companyId>/…`), con el permiso del editor que las sube:
 * - `web-sites`: sitios web y tiendas (`site-asset-upload.ts`);
 * - `pageant-site`: estudio visual de certámenes (`cover-upload`, `purpose=studio`);
 * - `academy-site`: sitio de la academia (`academySiteImagePrefix`).
 */
export const EDITOR_IMAGE_FOLDERS = {
  'web-sites': ['websites:write', 'store:write', 'store:manage'],
  'pageant-site': ['projects:write'],
  'academy-site': ['academy:write'],
} as const satisfies Record<string, readonly Permission[]>;

export type EditorImageFolder = keyof typeof EDITOR_IMAGE_FOLDERS;

function isEditorImageFolder(value: string): value is EditorImageFolder {
  return Object.prototype.hasOwnProperty.call(EDITOR_IMAGE_FOLDERS, value);
}

/** Carpeta de biblioteca de una imagen de NUESTRO almacenamiento y de ESTA empresa; `null` si no lo es. */
export function editorImageFolder(value: string, companyId: string): EditorImageFolder | null {
  if (!companyId || !isAllowedBlobUrl(value)) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(value).pathname);
  } catch {
    return null;
  }
  const segments = pathname.replace(/^\/+/, '').split('/');
  const [folder, company, ...rest] = segments;
  if (!folder || company !== companyId || rest.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  return isEditorImageFolder(folder) ? folder : null;
}

/** Tope de lo que se trae: las subidas de los editores no pasan de 6 MB. */
export const IMAGE_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
