import { notFound } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getSessionAction } from '@/modules/candidates/actions/sessions.actions';
import SessionAttendanceRoster from '@/components/candidates/sessions/SessionAttendanceRoster';

export const metadata = { title: 'Pasar lista' };

export default async function SessionAttendancePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const context = await getAuthContext();
  const canWrite = can(context, 'candidates:write');

  const result = await getSessionAction(sessionId);
  if (!result.success) notFound();

  return <SessionAttendanceRoster session={result.data} canWrite={canWrite} />;
}
