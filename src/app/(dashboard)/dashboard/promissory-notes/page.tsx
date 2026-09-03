import PromissoryNoteListClient from '@/components/promissory-notes/PromissoryNoteListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Pagarés' };

export default async function PromissoryNotesPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'promissorynotes:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Pagarés</h1>
      <PromissoryNoteListClient canWrite={canWrite} />
    </div>
  );
}
