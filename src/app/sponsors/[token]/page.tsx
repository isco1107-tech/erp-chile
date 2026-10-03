import SponsorPortalClient from '@/components/sponsorships/SponsorPortalClient';
import PublicPrivacyFooter from '@/components/legal/PublicPrivacyFooter';

export const metadata = { title: 'Portal de Auspiciador' };

export default async function SponsorPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <SponsorPortalClient token={token} />
      <PublicPrivacyFooter flow="auspicio" token={token} />
    </>
  );
}
