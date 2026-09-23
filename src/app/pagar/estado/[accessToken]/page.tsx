import type { Metadata } from 'next';
import InstallmentPaymentStatusClient from '@/components/payment-plans/InstallmentPaymentStatusClient';

export const metadata: Metadata = { title: 'Estado del pago', robots: { index: false, follow: false } };

export default async function InstallmentPaymentStatusPage({ params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;
  return <InstallmentPaymentStatusClient accessToken={accessToken} />;
}
