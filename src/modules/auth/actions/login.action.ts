import { z } from 'zod';
import { SuspendedCompanyError, verifyCredentials } from '@/modules/auth/services/auth.service';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

type LoginResult = ActionResult<{
  id: string;
  role: string;
  email: string;
  companyId?: string;
  isSuperAdmin: boolean;
  sessionVersion: number;
  totpEnabled: boolean;
}>;

// `unknown` a propósito: la entrada llega de un body HTTP sin confiar, y Zod es
// quien establece la forma. Tiparla como ya-validada obligaba a los llamadores
// a mentirle al compilador.
export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  let user;
  try {
    user = await verifyCredentials(parsed.data.email, parsed.data.password);
  } catch (error) {
    // La empresa suspendida se distingue de las credenciales malas: el usuario
    // acertó su contraseña y merece saber que el bloqueo es administrativo.
    if (error instanceof SuspendedCompanyError) return { success: false, error: error.message };
    // El bloqueo por intentos fallidos se re-lanza (no se convierte a
    // ActionResult) para que el caller HTTP pueda responder 429 en vez de 401
    // — igual que hace /api/auth/verify-totp con su propio lockout.
    throw error;
  }
  if (!user) return { success: false, error: 'Invalid credentials' };

  return {
    success: true,
    data: {
      id: user.id,
      role: user.role,
      email: user.email,
      companyId: user.companyId ?? undefined,
      isSuperAdmin: user.isSuperAdmin,
      sessionVersion: user.sessionVersion,
      totpEnabled: user.totpEnabled,
    },
  };
}
