/** Navigation preference only. Never use this cookie to grant access. */
export const ERP_ENTRY_COOKIE = 'aether-entry';
export const ERP_ENTRY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
};

export function warehouseEntry(cookieHeader: string | null): boolean {
  return cookieHeader?.split(';').some((part) => part.trim() === `${ERP_ENTRY_COOKIE}=bodega`) ?? false;
}

/** Lista cerrada: preferencia de navegación, sin otorgar ningún permiso. */
export function entryDestination(value: string | undefined): '/bodega' | '/pos' | '/control' | '/dashboard' {
  return value === 'bodega' ? '/bodega' : value === 'pos' ? '/pos' : value === 'control' ? '/control' : '/dashboard';
}

/**
 * Las apps que abren hardware del teléfono o del mostrador (cámara en Bodega, USB del cajón e impresora en el
 * POS) reciben ese permiso por la cabecera `Permissions-Policy` del DOCUMENTO (next.config.js). Una navegación
 * interna desde el login, el selector de empresa o el cambio de contraseña conservaría la política de esa
 * página (sin cámara ni USB), así que a estas rutas se entra con una carga completa.
 */
export function needsFullPageLoad(path: string): boolean {
  return path === '/bodega' || path === '/pos';
}

export function posEntry(cookieHeader: string | null): boolean {
  return cookieHeader?.split(';').some((part) => part.trim() === `${ERP_ENTRY_COOKIE}=pos`) ?? false;
}

export function controlEntry(header:string|null):boolean {return header?.split(';').some(part=>part.trim()===`${ERP_ENTRY_COOKIE}=control`)??false;}
