import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SellerCenterLogin } from '@/components/public/seller-center/AccountForms';
import { currentSupplierAccount } from '@/lib/supplier-portal/current-account';

export const metadata: Metadata = { title: 'Ingresar · Seller Center', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SellerCenterLoginPage() {
  if (await currentSupplierAccount()) redirect('/proveedor/cuenta');
  return <SellerCenterLogin />;
}
