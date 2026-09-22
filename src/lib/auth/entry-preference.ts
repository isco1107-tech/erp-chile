/** Navigation preference only. Never use this cookie to grant access. */
export const ERP_ENTRY_COOKIE = 'aether-entry';
export const ERP_ENTRY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
};
