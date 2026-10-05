import type { Metadata } from 'next';
import AcademyEnrollmentForm from '@/components/academy/AcademyEnrollmentForm';
import { PublicStatus } from '@/components/public/PublicShell';
import PublicPrivacyFooter from '@/components/legal/PublicPrivacyFooter';
import { getPublicEnrollmentInfo } from '@/modules/academy/services/academy-enrollment.service';

export const metadata: Metadata = { title: 'Inscripción a la academia', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AcademyEnrollmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await getPublicEnrollmentInfo(token);

  if (!info) {
    return (
      <PublicStatus
        accent="gold"
        variant="error"
        title="Link de inscripción inválido o cerrado"
        message="Pide a la academia el link vigente para inscribirte."
      />
    );
  }

  return (
    <>
      <AcademyEnrollmentForm token={token} companyName={info.companyName} groups={info.groups} />
      <PublicPrivacyFooter flow="academia" token={token} />
    </>
  );
}
