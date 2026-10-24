import { z } from 'zod';
import { extractRequestInfo, logSecurityEvent } from '@/lib/security/security-logger';
import { SUPPLIER_ACCOUNT_LINK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { accountEmailSchema } from '@/lib/supplier-portal/accounts';
import { requestPasswordReset } from '@/modules/inventory/services/seller-center-auth.service';
import { failure, json, limited, readBody } from '../http';

const schema = z.object({ email: accountEmailSchema }).strict();

/** Pedir un enlace para elegir otra contraseña. La respuesta es la misma exista o no el correo. */
export async function POST(req: Request) {
  const blocked = limited(req, SUPPLIER_ACCOUNT_LINK_RATE_LIMIT, '/api/supplier-portal/forgot');
  if (blocked) return blocked;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  try {
    await requestPasswordReset(body.data.email);
    const { ip, userAgent } = extractRequestInfo(req);
    logSecurityEvent({ type: 'PASSWORD_RESET_REQUESTED', email: body.data.email, ip, userAgent, metadata: { portal: 'seller-center' } });
    return json({ success: true, message: 'Si el correo tiene una cuenta, te llegará un enlace para elegir una nueva contraseña.' });
  } catch (error) {
    return failure(error, 'forgot');
  }
}
