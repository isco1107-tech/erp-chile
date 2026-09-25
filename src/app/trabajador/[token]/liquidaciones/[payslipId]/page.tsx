import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { PayslipDocument } from '@/components/hr/PayslipDocument';
import { checkRateLimit, EMPLOYEE_PORTAL_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getPortalPayslip } from '@/modules/hr/services/employee-portal.service';

export const metadata: Metadata = { title: 'Liquidación de sueldo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PortalPayslipPage({ params }: { params: Promise<{ token: string; payslipId: string }> }) {
  const { token, payslipId } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, EMPLOYEE_PORTAL_RATE_LIMIT).allowed) notFound();
  const slip = await getPortalPayslip(token, payslipId);
  if (!slip) notFound();
  return (
    <div className="theme-saas-light min-h-screen bg-background px-4 py-8 text-foreground print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <Link href={`/trabajador/${token}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver a mi portal
        </Link>
        <PrintButton />
      </div>
      <PayslipDocument slip={slip} />
    </div>
  );
}
