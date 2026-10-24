import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SellerCenterClient from '@/components/public/seller-center/SellerCenterClient';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { isMonthKey, monthLabel, recentMonths } from '@/lib/supplier-portal/accounts';
import { currentSupplierAccount } from '@/lib/supplier-portal/current-account';
import { getSellerCenterView } from '@/modules/inventory/services/seller-center-view.service';

export const metadata: Metadata = { title: 'Portal de proveedores', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/** Meses que se pueden elegir: los últimos 12. */
const MONTHS_BACK = 12;

export default async function SellerCenterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await currentSupplierAccount();
  if (!account) redirect('/proveedor/cuenta/ingresar');

  const today = santiagoDateParts(new Date());
  const current = `${today.year}-${String(today.month).padStart(2, '0')}`;
  const months = recentMonths(current, MONTHS_BACK);
  const raw = (await searchParams).mes;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const month = isMonthKey(requested) && months.includes(requested) ? requested : current;
  const view = await getSellerCenterView(account, month);

  return (
    <SellerCenterClient
      account={{ personName: account.personName, company: { name: account.company.name, email: account.company.email, phone: account.company.phone }, supplier: account.supplier, others: account.others }}
      view={view}
      months={months.map((value) => ({ value, label: monthLabel(value) }))}
    />
  );
}
