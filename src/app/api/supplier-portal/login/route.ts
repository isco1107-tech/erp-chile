import { z } from 'zod';
import {
  extractRequestInfo,
  logSecurityEvent,
} from '@/lib/security/security-logger';
import { SUPPLIER_ACCOUNT_LOGIN_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { sellerIdentifierSchema } from '@/lib/supplier-portal/identity';
import {
  SupplierAccountLockedError,
  loginSupplierPerson,
} from '@/modules/inventory/services/seller-center-auth.service';
import { failure, json, limited, readBody, withSession } from '../http';

const password = z.string().min(1, 'Escribe tu contraseña').max(200);
// Preserve the existing email API while accepting a normalized phone identifier.
const schema = z.union([
  z.object({ identifier: sellerIdentifierSchema, password }).strict(),
  z.object({ email: sellerIdentifierSchema, password }).strict(),
]);

/** Ingreso al Seller Center con correo y contraseña. Nunca dice si el correo existe. */
export async function POST(req: Request) {
  const blocked = limited(
    req,
    SUPPLIER_ACCOUNT_LOGIN_RATE_LIMIT,
    '/api/supplier-portal/login',
  );
  if (blocked) return blocked;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const identifier =
    'identifier' in body.data ? body.data.identifier : body.data.email;
  const { ip, userAgent } = extractRequestInfo(req);
  const meta = { portal: 'seller-center' };
  try {
    const session = await loginSupplierPerson(identifier, body.data.password);
    if (!session) {
      logSecurityEvent({
        type: 'LOGIN_FAILED',
        ...(identifier.includes('@') ? { email: identifier } : {}),
        ip,
        userAgent,
        metadata: meta,
      });
      return json(
        { success: false, error: 'Correo o contraseña incorrectos' },
        401,
      );
    }
    logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      ...(identifier.includes('@') ? { email: identifier } : {}),
      ip,
      userAgent,
      metadata: meta,
    });
    return withSession({ success: true }, session);
  } catch (error) {
    if (error instanceof SupplierAccountLockedError) {
      logSecurityEvent({
        type: 'LOGIN_LOCKED',
        ...(identifier.includes('@') ? { email: identifier } : {}),
        ip,
        userAgent,
        metadata: meta,
      });
      return json({ success: false, error: error.message }, 429);
    }
    return failure(error, 'login');
  }
}
