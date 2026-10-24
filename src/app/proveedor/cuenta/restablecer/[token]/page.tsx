import type { Metadata } from 'next';
import { SellerCenterReset } from '@/components/public/seller-center/AccountForms';

export const metadata: Metadata = { title: 'Nueva contraseña · Portal de proveedores', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** El enlace se valida al guardar (la página no consulta la base: no revela si el enlace sirve). */
export default async function SellerCenterResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SellerCenterReset token={token} />;
}
