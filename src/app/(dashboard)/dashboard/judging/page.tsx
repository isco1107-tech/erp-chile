import { can, getAuthContext } from '@/lib/auth/guards';
import JudgingDirectorClient from '@/components/judging/JudgingDirectorClient';

export const metadata = { title: 'Votación & Escrutinio' };

export default async function JudgingPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'judging:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Votación & Escrutinio en Vivo</h1>
      <JudgingDirectorClient canWrite={canWrite} />
    </div>
  );
}
