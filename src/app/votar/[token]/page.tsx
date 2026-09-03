import VotePurchaseClient from '@/components/voting/VotePurchaseClient';

export const metadata = { title: 'Votación' };

export default async function VotePurchasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VotePurchaseClient token={token} />;
}
