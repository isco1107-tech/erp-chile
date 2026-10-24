import { z } from 'zod';
import { extractRequestInfo, logSecurityEvent } from '@/lib/security/security-logger';
import { SUPPLIER_ACCOUNT_LINK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { resetPassword } from '@/modules/inventory/services/seller-center-auth.service';
import { clearSession, failure, json, limited, readBody } from '../http';

const schema = z.object({ token: z.string().min(1).max(100), password: z.string().min(1).max(200) }).strict();

/** Nueva contraseña con el enlace del correo. Cierra todas las sesiones abiertas de la persona. */
export async function POST(req: Request) {
  const blocked = limited(req, SUPPLIER_ACCOUNT_LINK_RATE_LIMIT, '/api/supplier-portal/reset');
  if (blocked) return blocked;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  try {
    await resetPassword(body.data.token, body.data.password);
    const { ip, userAgent } = extractRequestInfo(req);
    logSecurityEvent({ type: 'PASSWORD_RESET_COMPLETED', ip, userAgent, metadata: { portal: 'seller-center' } });
    return clearSession(json({ success: true, message: 'Listo: ya puedes entrar con tu nueva contraseña.' }));
  } catch (error) {
    return failure(error, 'reset');
  }
}
