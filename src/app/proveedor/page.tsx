import type { Metadata } from 'next';
import SupplierCodeEntry from '@/components/public/SupplierCodeEntry';

export const metadata: Metadata = { title: 'Portal de proveedores', robots: { index: false, follow: false } };

export default function SupplierPortalEntryPage() {
  return <SupplierCodeEntry />;
}
