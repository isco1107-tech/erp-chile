import type { Metadata } from 'next';
import { SellerCenterForgot } from '@/components/public/seller-center/AccountForms';

export const metadata: Metadata = { title: 'Recuperar contraseña · Portal de proveedores', robots: { index: false, follow: false } };

export default function SellerCenterForgotPage() {
  return <SellerCenterForgot />;
}
