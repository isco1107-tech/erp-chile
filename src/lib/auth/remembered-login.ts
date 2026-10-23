/** Only the account identifier and preference belong in local storage. */
const STORAGE_KEY = 'aether:remembered-login';
const CHANGE_EVENT = 'aether:remembered-login-change';

export function rememberedLoginSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function subscribeRememberedLogin(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function readRememberedLogin(raw: string | null): { username: string; remember: boolean } {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (typeof value === 'object' && value !== null && 'remember' in value && typeof value.remember === 'boolean') {
      const username = value.remember && 'username' in value && typeof value.username === 'string' ? value.username.slice(0, 254) : '';
      return { username, remember: value.remember };
    }
  } catch { /* Missing or invalid preferences use the default. */ }
  return { username: '', remember: true };
}

export function saveRememberedLogin(username: string, remember: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: remember ? username.trim().slice(0, 254) : '', remember }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* Private browsing or unavailable storage must not block sign-in. */ }
}

/** Ask the browser's own password manager after authentication, including 2FA. */
export function offerPasswordSave(username: string, password: string): void {
  try {
    const PasswordCredential = (window as Window & { PasswordCredential?: new (data: { id: string; password: string }) => Credential }).PasswordCredential;
    if (!window.isSecureContext || !PasswordCredential || !navigator.credentials?.store) return;
    void navigator.credentials.store(new PasswordCredential({ id: username, password })).catch(() => undefined);
  } catch { /* Browser autofill still works when the Credential Management API is unavailable. */ }
}
