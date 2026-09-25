import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import SalesDocumentPaper from '@/components/sales/SalesDocumentPaper';
import { PublicStatus } from '@/components/public/PublicShell';
import { checkRateLimit, CUSTOMER_PORTAL_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { getCustomerPortalDocument } from '@/modules/contacts/services/customer-portal.service';

export const metadata: Metadata = { title: 'Documento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CustomerPortalDocumentPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ip = getClientIp(await headers()) ?? 'unknown';
  if (!checkRateLimit(ip, CUSTOMER_PORTAL_RATE_LIMIT).allowed) {
    return <PublicStatus accent="gold" variant="error" title="Demasiadas consultas" message="Espera unos minutos y vuelve a intentarlo." />;
  }
  const document = await getCustomerPortalDocument(token, id);
  if (!document) {
    return <PublicStatus accent="gold" variant="error" title="Documento no disponible" message="El enlace no es válido o el documento no pertenece a tu cuenta." />;
  }
  return (
    <main className="theme-saas-light min-h-screen bg-background px-4 py-6 text-foreground print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <Link href={`/cliente/${token}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Volver a mi estado de cuenta
        </Link>
        <PrintButton />
      </div>
      <SalesDocumentPaper doc={document} />
    </main>
  );
}
