import type { Metadata } from 'next';
import AcademyCheckInForm from '@/components/academy/AcademyCheckInForm';
import { PublicStatus } from '@/components/public/PublicShell';
import { classDayLabel } from '@/lib/academy/check-in';
import { resolveCheckIn } from '@/modules/academy/services/academy-check-in.service';

export const metadata: Metadata = { title: 'Registro de asistencia', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/**
 * Lo que abre el QR de asistencia de una clase. Solo muestra el nombre de la
 * academia, del grupo y el día: nada de la lista ni de otras alumnas.
 */
export default async function AcademyCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resolveCheckIn(token);

  if (!info) {
    return <PublicStatus accent="gold" variant="error" title="Este QR no es válido" message="Escanea el QR que muestra tu profesora en la clase de hoy." />;
  }
  if (info.state !== 'OPEN') {
    return (
      <PublicStatus
        accent="gold"
        variant="error"
        title="El registro de asistencia está cerrado"
        message={`El QR de ${info.groupName} ya no recibe asistencia. Si estás en clase, avísale a tu profesora para que te marque o muestre un QR nuevo.`}
      />
    );
  }

  return <AcademyCheckInForm token={token} companyName={info.companyName} groupName={info.groupName} dayLabel={classDayLabel(info.date)} />;
}
