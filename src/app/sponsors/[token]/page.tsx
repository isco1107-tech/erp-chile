import SponsorPortalClient from '@/components/sponsorships/SponsorPortalClient';

export const metadata = { title: 'Portal de Auspiciador' };

export default async function SponsorPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SponsorPortalClient token={token} />;
}
