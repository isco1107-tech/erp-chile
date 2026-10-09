import HomeLanding from '@/components/marketing/home/HomeLanding';
import StructuredData from '@/components/marketing/StructuredData';
import releases from '../../../public/downloads/releases.json';
import { getAppUrl } from '@/lib/email/mailer';

export { metadata } from '../page';

/** Explicit commercial page remains accessible to existing customers. */
export default function ProductPage() {
  const salesEmail = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';
  return <>
    <StructuredData base={getAppUrl()} salesEmail={salesEmail} />
    <HomeLanding
      releases={releases}
      salesEmail={salesEmail}
      legalName={process.env.AETHER_LEGAL_NAME}
      legalRut={process.env.AETHER_LEGAL_RUT}
    />
  </>;
}
