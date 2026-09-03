import JudgeScoringClient from '@/components/judging/JudgeScoringClient';

export const metadata = { title: 'Panel de Jurado' };

export default async function JudgeScoringPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JudgeScoringClient token={token} />;
}
