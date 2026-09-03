import CandidateRegistrationClient from '@/components/candidates/CandidateRegistrationClient';

export const metadata = { title: 'Inscripción de candidatas' };

export default async function CandidateRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CandidateRegistrationClient token={token} />;
}
