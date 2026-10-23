/**
 * Llamadas del navegador a la API pública de la tienda. Todas responden `{ success, data }` o
 * `{ success: false, error, … }` con un mensaje en español listo para mostrar.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; field?: string; code?: string; /** La respuesta es del servidor de la tienda (`{ success: false }`), no de la infraestructura (HTML de error, corte). */ fromApp?: boolean };

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, cache: 'no-store' });
    const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; error?: string; field?: string; code?: string } | null;
    if (response.ok && json?.success) return { ok: true, data: json.data as T };
    return { ok: false, status: response.status, error: json?.error ?? 'No pudimos completar la solicitud. Intenta de nuevo.', field: json?.field, code: json?.code, fromApp: json?.success === false };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { ok: false, status: 0, error: 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.' };
  }
}

export const quoteUrl = (siteSlug: string) => `/api/public/store/${encodeURIComponent(siteSlug)}/quote`;
export const checkoutUrl = (siteSlug: string) => `/api/public/store/${encodeURIComponent(siteSlug)}/checkout`;
export const payUrl = (orderToken: string) => `/api/public/store/order/${encodeURIComponent(orderToken)}/pay`;
