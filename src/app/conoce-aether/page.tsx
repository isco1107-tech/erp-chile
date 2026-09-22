import Landing from '@/components/marketing/Landing';
import releases from '../../../public/downloads/releases.json';

export { metadata } from '../page';

/** Explicit commercial page remains accessible to existing customers. */
export default function ProductPage() {
  return <Landing releases={releases} salesEmail={process.env.AETHER_SALES_EMAIL} salesWhatsapp={process.env.AETHER_SALES_WHATSAPP} />;
}
