import 'server-only';

import { cookies } from 'next/headers';
import { resolveSupplierSession, type SupplierAccount } from '@/modules/inventory/services/seller-center-auth.service';
import { SUPPLIER_SESSION_COOKIE } from './session';

/** La cuenta del Seller Center de quien hace la solicitud, o `null` (sin sesión o ya no sirve). */
export async function currentSupplierAccount(): Promise<SupplierAccount | null> {
  const store = await cookies();
  return resolveSupplierSession(store.get(SUPPLIER_SESSION_COOKIE)?.value);
}
