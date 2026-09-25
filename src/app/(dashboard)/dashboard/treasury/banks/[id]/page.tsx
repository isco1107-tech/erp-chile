import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { BankLineStatus } from '@prisma/client';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getReconciliationAction } from '@/modules/treasury/actions/banks.actions';
import ReconciliationClient from '@/components/treasury/ReconciliationClient';

export const metadata = { title: 'Conciliación bancaria' };

const STATUSES: readonly (BankLineStatus | 'ALL')[] = ['UNMATCHED', 'MATCHED', 'IGNORED', 'ALL'];

export default async function ReconciliationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ id }, { status: rawStatus }] = await Promise.all([params, searchParams]);
  const status = STATUSES.find((value) => value === rawStatus) ?? 'UNMATCHED';
  const [context, result] = await Promise.all([getAuthContext(), getReconciliationAction(id, status)]);
  if (!result.success) notFound();

  return (
    <div className="space-y-6">
      <Link href="/dashboard/treasury/banks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Bancos
      </Link>
      <ReconciliationClient view={result.data} status={status} canWrite={can(context, 'treasury:write')} />
    </div>
  );
}
