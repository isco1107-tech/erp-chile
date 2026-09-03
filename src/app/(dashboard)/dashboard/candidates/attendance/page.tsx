import { can, getAuthContext } from '@/lib/auth/guards';
import SessionListClient from '@/components/candidates/sessions/SessionListClient';

export const metadata = { title: 'Asistencia' };

export default async function CandidateAttendancePage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'candidates:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Asistencia</h1>
      <SessionListClient canWrite={canWrite} />
    </div>
  );
}
