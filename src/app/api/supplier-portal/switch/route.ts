import { z } from 'zod';
import { currentSupplierAccount } from '@/lib/supplier-portal/current-account';
import { switchSupplierMembership } from '@/modules/inventory/services/seller-center-auth.service';
import { failure, json, readBody, withSession } from '../http';

const schema = z.object({ membershipId: z.string().min(1).max(40) }).strict();

/** Cambiar a otra empresa de la MISMA persona: el acceso destino se valida contra los suyos. */
export async function POST(req: Request) {
  const account = await currentSupplierAccount();
  if (!account) return json({ success: false, error: 'Tu sesión venció. Vuelve a ingresar' }, 401);
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  try {
    return await withSession({ success: true }, await switchSupplierMembership(account.personId, body.data.membershipId));
  } catch (error) {
    return failure(error, 'switch');
  }
}
