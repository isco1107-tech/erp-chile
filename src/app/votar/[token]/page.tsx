import VotePurchaseClient from '@/components/voting/VotePurchaseClient';

export const metadata = { title: 'Votación' };

export default async function VotePurchasePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ candidata?: string }> }) {
  const { token } = await params;
  const { candidata } = await searchParams;
  return <VotePurchaseClient token={token} initialCandidateId={typeof candidata === 'string' ? candidata : undefined} />;
}
