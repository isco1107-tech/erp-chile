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
export function entryDestination(value: string | undefined): '/bodega' | '/pos' | '/dashboard' {
  return value === 'bodega' ? '/bodega' : value === 'pos' ? '/pos' : '/dashboard';
}

export function posEntry(cookieHeader: string | null): boolean {
  return cookieHeader?.split(';').some((part) => part.trim() === `${ERP_ENTRY_COOKIE}=pos`) ?? false;
}
