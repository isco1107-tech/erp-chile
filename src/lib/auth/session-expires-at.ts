import 'server-only';

import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth/session';

/**
 * Vencimiento de ESTA sesión en milisegundos (claim `exp` del JWT ya validado
 * por `getAuthContext`), para avisar antes de que se corte. `null` si no se
 * puede leer: el aviso es una ayuda, nunca un control de acceso.
 */
export async function currentSessionExpiresAt(): Promise<number | null> {
  try {
    const token = (await cookies()).get('session')?.value;
    const exp = token ? (await verifySessionToken(token)).exp : undefined;
    return exp ? exp * 1000 : null;
  } catch {
    return null;
  }
}
