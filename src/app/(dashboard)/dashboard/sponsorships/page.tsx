import SponsorshipListClient from '@/components/sponsorships/SponsorshipListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Auspicios & Marcas' };

export default async function SponsorshipsPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'sponsorships:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Auspicios & Marcas</h1>
      <SponsorshipListClient canWrite={canWrite} />
    </div>
  );
}
