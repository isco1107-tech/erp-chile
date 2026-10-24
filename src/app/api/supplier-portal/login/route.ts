import { z } from 'zod';
import { extractRequestInfo, logSecurityEvent } from '@/lib/security/security-logger';
import { SUPPLIER_ACCOUNT_LOGIN_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { accountEmailSchema } from '@/lib/supplier-portal/accounts';
import { SupplierAccountLockedError, loginSupplierPerson } from '@/modules/inventory/services/seller-center-auth.service';
import { failure, json, limited, readBody, withSession } from '../http';

const schema = z.object({ email: accountEmailSchema, password: z.string().min(1, 'Escribe tu contraseña').max(200) }).strict();

/** Ingreso al Seller Center con correo y contraseña. Nunca dice si el correo existe. */
export async function POST(req: Request) {
  const blocked = limited(req, SUPPLIER_ACCOUNT_LOGIN_RATE_LIMIT, '/api/supplier-portal/login');
  if (blocked) return blocked;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const { ip, userAgent } = extractRequestInfo(req);
  const meta = { portal: 'seller-center' };
  try {
    const session = await loginSupplierPerson(body.data.email, body.data.password);
    if (!session) {
      logSecurityEvent({ type: 'LOGIN_FAILED', email: body.data.email, ip, userAgent, metadata: meta });
      return json({ success: false, error: 'Correo o contraseña incorrectos' }, 401);
    }
    logSecurityEvent({ type: 'LOGIN_SUCCESS', email: body.data.email, ip, userAgent, metadata: meta });
    return withSession({ success: true }, session);
  } catch (error) {
    if (error instanceof SupplierAccountLockedError) {
      logSecurityEvent({ type: 'LOGIN_LOCKED', email: body.data.email, ip, userAgent, metadata: meta });
      return json({ success: false, error: error.message }, 429);
    }
    return failure(error, 'login');
  }
}
