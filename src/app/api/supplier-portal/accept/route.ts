import { z } from 'zod';
import { SUPPLIER_ACCOUNT_LINK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { SupplierAccountLockedError, acceptInvitation } from '@/modules/inventory/services/seller-center-auth.service';
import { failure, json, limited, readBody, withSession } from '../http';

const schema = z.object({ token: z.string().min(1).max(100), password: z.string().min(1, 'Escribe la contraseña').max(200) }).strict();

/** Aceptar la invitación: crea la contraseña (o comprueba la que ya tiene) y deja la sesión abierta. */
export async function POST(req: Request) {
  const blocked = limited(req, SUPPLIER_ACCOUNT_LINK_RATE_LIMIT, '/api/supplier-portal/accept');
  if (blocked) return blocked;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  try {
    return await withSession({ success: true }, await acceptInvitation(body.data.token, body.data.password));
  } catch (error) {
    if (error instanceof SupplierAccountLockedError) return json({ success: false, error: error.message }, 429);
    return failure(error, 'accept');
  }
}
