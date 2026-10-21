import 'server-only';

import { ZAPSIGN_PRODUCTION_URL, ZAPSIGN_SANDBOX_URL } from '@/lib/zapsign/client';

/**
 * Verifica un token de ZapSign antes de guardarlo, listando la primera página
 * de documentos (`GET /api/v1/docs/?page=1`, el endpoint de lectura más
 * liviano de su API). El token solo va en el header y la URL es una de dos
 * constantes: nada que escriba el usuario entra a la URL.
 */

const TIMEOUT_MS = 10_000;

export type ZapsignCheck = { ok: true } | { ok: false; error: string };

export async function verifyZapsignToken(token: string, sandbox: boolean): Promise<ZapsignCheck> {
  const baseUrl = sandbox ? ZAPSIGN_SANDBOX_URL : ZAPSIGN_PRODUCTION_URL;
  try {
    const response = await fetch(`${baseUrl}/api/v1/docs/?page=1`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: sandbox
          ? 'ZapSign rechazó el token en el entorno de prueba (sandbox). Usa un token de sandbox, o apaga el modo de prueba si es uno de producción.'
          : 'ZapSign rechazó el token. Revisa que esté completo y que sea de producción; si es de la cuenta de prueba, activa el modo de prueba.',
      };
    }
    if (!response.ok) return { ok: false, error: `ZapSign respondió un error (${response.status}). Intenta de nuevo en unos minutos.` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo contactar a ZapSign para verificar el token. Intenta de nuevo en unos minutos.' };
  }
}
