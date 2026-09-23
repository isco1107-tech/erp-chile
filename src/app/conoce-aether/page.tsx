import Landing from '@/components/marketing/Landing';
import StructuredData from '@/components/marketing/StructuredData';
import releases from '../../../public/downloads/releases.json';
import { getAppUrl } from '@/lib/email/mailer';

export { metadata } from '../page';

/** Explicit commercial page remains accessible to existing customers. */
export default function ProductPage() {
  const salesEmail = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';
  return <>
    <StructuredData base={getAppUrl()} salesEmail={salesEmail} />
    <Landing releases={releases} salesEmail={salesEmail} salesWhatsapp={process.env.AETHER_SALES_WHATSAPP} legalName={process.env.AETHER_LEGAL_NAME} legalRut={process.env.AETHER_LEGAL_RUT} />
  </>;
}
